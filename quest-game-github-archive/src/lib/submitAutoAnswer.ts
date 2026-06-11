import { supabase } from './supabase'
import { debugLog } from './debugLog'
import { cancelActiveStorageUpload } from './storageUpload'
import { setAnswerSaveInFlight } from './networkMutex'
import { broadcastScoreUpdate } from './gameRealtime'
import { enqueueCritical } from './requestQueue'
import { isTransientNetworkError } from './teamRegister'
import { getTeamSessionToken } from './teamSession'
import { trackProductEvent } from './productAnalytics'

export type SubmitAutoAnswerRequest = {
  game_id: string
  team_id: string
  question_number: number
  answer: string[]
  media_urls: string[]
  time_spent: number
  hints_used: number
  session_token?: string
}

export type GradingStatus =
  | 'auto_accepted'
  | 'pending'
  | 'jury_pending'
  | 'rejected'
  | 'accepted_manual'

export type SubmitAutoAnswerResult = {
  is_correct: boolean
  points_earned: number
  team_total_score: number
  answer_id?: string
  grading_status?: GradingStatus
  match_tier?: string
  via: 'rpc'
}

const RPC_TRANSIENT_RETRIES = 3
const RPC_RETRY_PAUSE_MS = [400, 900, 1800]

async function submitViaRpc(
  req: SubmitAutoAnswerRequest
): Promise<SubmitAutoAnswerResult> {
  const sessionToken = req.session_token ?? getTeamSessionToken(req.team_id)
  if (!sessionToken) {
    throw new Error('team session token missing — перерегистрируйтесь в лобби')
  }

  let lastErr: unknown
  for (let attempt = 0; attempt < RPC_TRANSIENT_RETRIES; attempt++) {
    try {
      const { data, error } = await supabase.rpc('submit_auto_answer', {
        p_game_id: req.game_id,
        p_team_id: req.team_id,
        p_question_number: req.question_number,
        p_answer: req.answer,
        p_media_urls: req.media_urls,
        p_time_spent: req.time_spent,
        p_hints_used: req.hints_used,
        p_session_token: sessionToken,
      })

      if (error) throw error
      lastErr = undefined

      if (!data || typeof data !== 'object') {
        throw new Error('submit_auto_answer: empty response')
      }

      const row = data as Record<string, unknown>
      const gradingStatus = row.grading_status
      return {
        is_correct: row.is_correct === true,
        points_earned: Number(row.points_earned) || 0,
        team_total_score: Number(row.team_total_score) || 0,
        answer_id: typeof row.answer_id === 'string' ? row.answer_id : undefined,
        grading_status:
          typeof gradingStatus === 'string'
            ? (gradingStatus as GradingStatus)
            : undefined,
        match_tier:
          typeof row.match_tier === 'string' ? row.match_tier : undefined,
        via: 'rpc',
      }
    } catch (err) {
      lastErr = err
      if (attempt < RPC_TRANSIENT_RETRIES - 1 && isTransientNetworkError(err)) {
        await new Promise((r) => setTimeout(r, RPC_RETRY_PAUSE_MS[attempt] ?? 1000))
        continue
      }
      throw err
    }
  }
  throw lastErr ?? new Error('submit_auto_answer failed')
}

/**
 * Сервер считает is_correct и points (IMP-LOG-001). Требует team session token (IMP-SEC).
 */
export async function submitAutoAnswerToServer(
  req: SubmitAutoAnswerRequest
): Promise<SubmitAutoAnswerResult> {
  cancelActiveStorageUpload()
  setAnswerSaveInFlight(true)
  const started = Date.now()
  debugLog('submitAutoAnswer.ts', 'start', { q: req.question_number }, 'H')

  try {
    const result = await submitViaRpc(req)
    debugLog('submitAutoAnswer.ts', 'rpc ok', { ms: Date.now() - started, ...result }, 'H')

    if (result.points_earned > 0) {
      void broadcastScoreUpdate(req.game_id, {
        team_id: req.team_id,
        total_score: result.team_total_score,
        delta: result.points_earned,
      })
    }

    trackProductEvent({
      event: 'answer_submitted',
      role: 'player',
      gameId: req.game_id,
      teamId: req.team_id,
      payload: {
        question_number: req.question_number,
        is_correct: result.is_correct,
        points_earned: result.points_earned,
        hints_used: req.hints_used,
        grading_status: result.grading_status,
        time_spent: req.time_spent,
      },
    })

    return result
  } finally {
    setAnswerSaveInFlight(false)
  }
}

export function enqueueSubmitAutoAnswer(
  req: SubmitAutoAnswerRequest
): Promise<SubmitAutoAnswerResult> {
  return enqueueCritical(() => submitAutoAnswerToServer(req))
}
