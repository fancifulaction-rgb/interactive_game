import { supabase } from './supabase'
import { enqueueCritical } from './requestQueue'
import { broadcastScoreUpdate } from './gameRealtime'

export type PendingAnswerRow = {
  answer_id: string
  team_id: string
  team_name: string
  question_number: number
  answer: unknown
  media_urls: string[]
  created_at: string
  grading_meta: Record<string, unknown>
}

export type ModerateAnswerResult = {
  success: boolean
  answer_id: string
  grading_status: string
  is_correct?: boolean
  points_earned: number
  team_total_score?: number
  match_tier?: string
}

export type TeamPendingReview = {
  team_id: string
  pending_count: number
}

export type PosthocAnswerRow = PendingAnswerRow & {
  grading_status: string
}

function parsePendingRow(row: Record<string, unknown>): PendingAnswerRow {
  const media = row.media_urls
  let mediaUrls: string[] = []
  if (Array.isArray(media)) {
    mediaUrls = media.map((u) => String(u ?? '')).filter(Boolean)
  }

  return {
    answer_id: String(row.answer_id ?? ''),
    team_id: String(row.team_id ?? ''),
    team_name: String(row.team_name ?? ''),
    question_number: Number(row.question_number) || 0,
    answer: row.answer,
    media_urls: mediaUrls,
    created_at: String(row.created_at ?? ''),
    grading_meta:
      row.grading_meta && typeof row.grading_meta === 'object'
        ? (row.grading_meta as Record<string, unknown>)
        : {},
  }
}

export async function listPendingAnswers(
  gameId: string
): Promise<PendingAnswerRow[]> {
  const { data, error } = await supabase.rpc('list_pending_answers', {
    p_game_id: gameId,
  })
  if (error) throw error
  if (!Array.isArray(data)) return []
  return data.map((row) => parsePendingRow(row as Record<string, unknown>))
}

export async function getTeamsPendingReview(
  gameId: string
): Promise<TeamPendingReview[]> {
  const { data, error } = await supabase.rpc('get_teams_pending_review', {
    p_game_id: gameId,
  })
  if (error) throw error
  if (!Array.isArray(data)) return []
  return data.map((row) => {
    const r = row as Record<string, unknown>
    return {
      team_id: String(r.team_id ?? ''),
      pending_count: Number(r.pending_count) || 0,
    }
  })
}

export function enqueueListPendingAnswers(
  gameId: string
): Promise<PendingAnswerRow[]> {
  return enqueueCritical(() => listPendingAnswers(gameId))
}

export function enqueueGetTeamsPendingReview(
  gameId: string
): Promise<TeamPendingReview[]> {
  return enqueueCritical(() => getTeamsPendingReview(gameId))
}

/** team_id → количество ответов на проверке (для табло). */
export async function fetchPendingCountByTeam(
  gameId: string
): Promise<Record<string, number>> {
  const rows = await getTeamsPendingReview(gameId)
  const map: Record<string, number> = {}
  for (const row of rows) {
    map[row.team_id] = row.pending_count
  }
  return map
}

export async function moderateAnswer(
  answerId: string,
  action: 'accept' | 'reject',
  gameId?: string
): Promise<ModerateAnswerResult> {
  const { data, error } = await supabase.rpc('moderate_answer', {
    p_answer_id: answerId,
    p_action: action,
  })
  if (error) throw error
  if (!data || typeof data !== 'object') {
    throw new Error('moderate_answer: empty response')
  }

  const row = data as Record<string, unknown>
  const result: ModerateAnswerResult = {
    success: row.success === true,
    answer_id: String(row.answer_id ?? answerId),
    grading_status: String(row.grading_status ?? ''),
    is_correct: row.is_correct === true,
    points_earned: Number(row.points_earned) || 0,
    team_total_score:
      row.team_total_score != null ? Number(row.team_total_score) : undefined,
    match_tier: typeof row.match_tier === 'string' ? row.match_tier : undefined,
  }

  return result
}

function parsePosthocRow(row: Record<string, unknown>): PosthocAnswerRow {
  const base = parsePendingRow(row)
  return {
    ...base,
    grading_status: String(row.grading_status ?? 'auto_accepted'),
  }
}

export async function listPosthocAnswers(
  gameId: string
): Promise<PosthocAnswerRow[]> {
  const { data, error } = await supabase.rpc('list_posthoc_answers', {
    p_game_id: gameId,
  })
  if (error) throw error
  if (!Array.isArray(data)) return []
  return data.map((row) => parsePosthocRow(row as Record<string, unknown>))
}

export function enqueueListPosthocAnswers(
  gameId: string
): Promise<PosthocAnswerRow[]> {
  return enqueueCritical(() => listPosthocAnswers(gameId))
}

export async function posthocAcceptAnswer(
  answerId: string
): Promise<ModerateAnswerResult> {
  const { data, error } = await supabase.rpc('posthoc_accept_answer', {
    p_answer_id: answerId,
  })
  if (error) throw error
  if (!data || typeof data !== 'object') {
    throw new Error('posthoc_accept_answer: empty response')
  }

  const row = data as Record<string, unknown>
  return {
    success: row.success === true,
    answer_id: String(row.answer_id ?? answerId),
    grading_status: String(row.grading_status ?? ''),
    is_correct: row.is_correct === true,
    points_earned: Number(row.points_earned) || 0,
    team_total_score:
      row.team_total_score != null ? Number(row.team_total_score) : undefined,
    match_tier: typeof row.match_tier === 'string' ? row.match_tier : undefined,
  }
}

export function enqueuePosthocAcceptAnswer(
  answerId: string,
  opts?: { gameId?: string; teamId?: string }
): Promise<ModerateAnswerResult> {
  return enqueueCritical(async () => {
    const result = await posthocAcceptAnswer(answerId)
    if (
      opts?.gameId &&
      opts.teamId &&
      result.points_earned > 0 &&
      result.team_total_score != null
    ) {
      void broadcastScoreUpdate(opts.gameId, {
        team_id: opts.teamId,
        total_score: result.team_total_score,
        delta: result.points_earned,
      })
    }
    return result
  })
}

export function enqueueModerateAnswer(
  answerId: string,
  action: 'accept' | 'reject',
  opts?: { gameId?: string; teamId?: string }
): Promise<ModerateAnswerResult> {
  return enqueueCritical(async () => {
    const result = await moderateAnswer(answerId, action, opts?.gameId)
    if (
      opts?.gameId &&
      opts.teamId &&
      result.points_earned > 0 &&
      result.team_total_score != null
    ) {
      void broadcastScoreUpdate(opts.gameId, {
        team_id: opts.teamId,
        total_score: result.team_total_score,
        delta: result.points_earned,
      })
    }
    return result
  })
}
