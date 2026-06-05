import { supabase } from './supabase'
import { debugLog } from './debugLog'
import { cancelActiveStorageUpload } from './storageUpload'
import { setAnswerSaveInFlight } from './networkMutex'
import { enqueueCritical } from './requestQueue'
import { broadcastScoreUpdate } from './gameRealtime'
import type { AnswerInsertPayload } from './saveAnswer'

export type SubmitAutoAnswerRequest = {
  game_id: string
  team_id: string
  question_number: number
  answer: string[]
  media_urls: string[]
  time_spent: number
  hints_used: number
}

export type SubmitAutoAnswerResult = {
  is_correct: boolean
  points_earned: number
  team_total_score: number
  answer_id?: string
  via: 'rpc' | 'fallback'
}

async function insertAnswerFallback(payload: AnswerInsertPayload): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.from('answers').insert(payload)
    if (!error) return
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    } else {
      throw new Error(error.message)
    }
  }
}

async function submitViaRpc(
  req: SubmitAutoAnswerRequest
): Promise<SubmitAutoAnswerResult> {
  const { data, error } = await supabase.rpc('submit_auto_answer', {
    p_game_id: req.game_id,
    p_team_id: req.team_id,
    p_question_number: req.question_number,
    p_answer: req.answer,
    p_media_urls: req.media_urls,
    p_time_spent: req.time_spent,
    p_hints_used: req.hints_used,
  })

  if (error) throw error
  if (!data || typeof data !== 'object') {
    throw new Error('submit_auto_answer: empty response')
  }

  const row = data as Record<string, unknown>
  return {
    is_correct: row.is_correct === true,
    points_earned: Number(row.points_earned) || 0,
    team_total_score: Number(row.team_total_score) || 0,
    answer_id: typeof row.answer_id === 'string' ? row.answer_id : undefined,
    via: 'rpc',
  }
}

/**
 * Сервер считает is_correct и points (IMP-LOG-001).
 * Fallback — прямой insert, если RPC ещё не применена в БД.
 */
export async function submitAutoAnswerToServer(
  req: SubmitAutoAnswerRequest,
  fallback?: AnswerInsertPayload
): Promise<SubmitAutoAnswerResult> {
  cancelActiveStorageUpload()
  setAnswerSaveInFlight(true)
  const started = Date.now()
  debugLog('submitAutoAnswer.ts', 'start', { q: req.question_number }, 'H')

  try {
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

      return result
    } catch (rpcErr) {
      const msg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr)
      const missingRpc =
        msg.includes('submit_auto_answer') ||
        msg.includes('Could not find the function') ||
        msg.includes('schema cache')

      if (!missingRpc || !fallback) throw rpcErr

      debugLog('submitAutoAnswer.ts', 'rpc missing, fallback insert', { msg }, 'H')
      await insertAnswerFallback(fallback)

      return {
        is_correct: fallback.is_correct,
        points_earned: fallback.points_earned,
        team_total_score: 0,
        via: 'fallback',
      }
    }
  } finally {
    setAnswerSaveInFlight(false)
  }
}

export function enqueueSubmitAutoAnswer(
  req: SubmitAutoAnswerRequest,
  fallback?: AnswerInsertPayload
): Promise<SubmitAutoAnswerResult> {
  return enqueueCritical(() => submitAutoAnswerToServer(req, fallback))
}
