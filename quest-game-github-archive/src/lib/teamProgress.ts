import { supabase } from './supabase'
import type { GameSessionStatus } from './gameSessionState'

export type TeamProgressRow = {
  team_id: string
  answered_count: number
  last_question_number: number | null
  total_questions: number
  is_finished: boolean
  finished_at: string | null
}

export type TeamProgressStatus = 'waiting' | 'in_game' | 'finished'

const cache = new Map<string, { at: number; rows: TeamProgressRow[] }>()
const CACHE_MS = 2500

export function invalidateTeamProgressCache(gameId?: string): void {
  if (!gameId) {
    cache.clear()
    return
  }
  cache.delete(gameId)
}

export async function fetchTeamProgress(
  gameId: string,
  opts?: { force?: boolean }
): Promise<TeamProgressRow[]> {
  if (!gameId) return []
  const now = Date.now()
  const hit = cache.get(gameId)
  if (!opts?.force && hit && now - hit.at < CACHE_MS) {
    return hit.rows
  }

  const { data, error } = await supabase.rpc('get_team_progress', {
    p_game_id: gameId,
  })

  if (error) throw error

  const rows = (data ?? []) as TeamProgressRow[]
  cache.set(gameId, { at: now, rows })
  return rows
}

export function teamProgressMap(rows: TeamProgressRow[]): Map<string, TeamProgressRow> {
  return new Map(rows.map((r) => [r.team_id, r]))
}

export function resolveTeamProgressStatus(
  sessionStatus: GameSessionStatus | null,
  row: TeamProgressRow | undefined
): TeamProgressStatus {
  if (!sessionStatus || sessionStatus === 'waiting' || sessionStatus === 'closed') {
    return 'waiting'
  }
  if (row?.is_finished) return 'finished'
  if (sessionStatus === 'playing' || sessionStatus === 'paused' || sessionStatus === 'finished') {
    return 'in_game'
  }
  return 'waiting'
}

export function teamProgressLabel(
  status: TeamProgressStatus,
  row: TeamProgressRow | undefined,
  detailed = false
): string {
  if (status === 'waiting') return 'Ожидает'
  if (status === 'finished') return 'Пройдено'
  if (
    detailed &&
    row &&
    row.total_questions > 0 &&
    (row.last_question_number ?? 0) > 0
  ) {
    return `Вопрос ${row.last_question_number} из ${row.total_questions}`
  }
  if (detailed && row && row.total_questions > 0) {
    return `В игре (${row.answered_count}/${row.total_questions})`
  }
  return 'В игре'
}

export function countFinishedTeams(rows: TeamProgressRow[]): number {
  return rows.filter((r) => r.is_finished).length
}
