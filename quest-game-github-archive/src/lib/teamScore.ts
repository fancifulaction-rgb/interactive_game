import { supabase } from './supabase'
import { debugLog } from './debugLog'
import { enqueueBackground } from './requestQueue'
import { getGamePlayCache, mergeTeamScoreInCache, updateTeamsSnapshot } from './gamePlayCache'
import { broadcastScoreUpdate } from './gameRealtime'

async function resolveGameId(gameCode?: string, teamId?: string): Promise<string | null> {
  if (gameCode) {
    const cached = getGamePlayCache(gameCode.trim().toUpperCase())
    const id = cached?.game?.id
    if (typeof id === 'string' && id) return id
  }
  if (teamId) {
    const { data } = await supabase
      .from('teams')
      .select('game_id')
      .eq('id', teamId)
      .maybeSingle()
    return data?.game_id ?? null
  }
  return null
}

function readLocalTotalScore(teamId: string): number {
  try {
    const raw = localStorage.getItem('current_team')
    if (!raw) return 0
    const team = JSON.parse(raw)
    if (team?.id !== teamId) return 0
    return Number(team.total_score) || 0
  } catch {
    return 0
  }
}

function writeLocalTotalScore(teamId: string, next: number) {
  try {
    const raw = localStorage.getItem('current_team')
    if (!raw) return
    const team = JSON.parse(raw)
    if (team?.id === teamId) {
      team.total_score = next
      localStorage.setItem('current_team', JSON.stringify(team))
    }
  } catch {
    /* ignore */
  }
}

/** Подтянуть счёт с сервера (после сброса заезда админом). */
export async function syncPlayerTeamScoreFromServer(teamId: string, gameCode?: string) {
  const { data, error } = await supabase
    .from('teams')
    .select('total_score')
    .eq('id', teamId)
    .maybeSingle()

  if (error || !data) return

  const score = Number(data.total_score) || 0
  writeLocalTotalScore(teamId, score)

  if (!gameCode) return
  const code = gameCode.trim().toUpperCase()
  const cached = getGamePlayCache(code)
  if (!cached?.teamsSnapshot?.length) return

  updateTeamsSnapshot(
    code,
    cached.teamsSnapshot.map((t) => ({ ...t, total_score: t.id === teamId ? score : 0 }))
  )
}

/** Только UI/кэш без запроса на сервер (перед submit_auto_answer). */
export function applyOptimisticTeamScoreBump(teamId: string, delta: number, gameCode?: string) {
  if (delta <= 0) return
  const next = readLocalTotalScore(teamId) + delta
  writeLocalTotalScore(teamId, next)
  if (gameCode) {
    mergeTeamScoreInCache(gameCode.trim().toUpperCase(), teamId, delta)
  }
}

/** Оптимистичный счёт: localStorage + кэш табло, один UPDATE в фоне. */
export function bumpTeamScoreInBackground(teamId: string, delta: number, gameCode?: string) {
  if (delta <= 0) return

  const next = readLocalTotalScore(teamId) + delta
  writeLocalTotalScore(teamId, next)
  if (gameCode) {
    mergeTeamScoreInCache(gameCode.trim().toUpperCase(), teamId, delta)
  }

  void enqueueBackground(async () => {
    debugLog('teamScore.ts', 'bump start', { teamId, next }, 'H')
    try {
      const gameId = await resolveGameId(gameCode, teamId)
      if (gameId) {
        void broadcastScoreUpdate(gameId, {
          team_id: teamId,
          total_score: next,
          delta,
        })
      }

      const { error } = await supabase.rpc('increment_team_score', {
        p_team_id: teamId,
        p_delta: delta,
      })

      if (error) throw error
      debugLog('teamScore.ts', 'bump ok', { next }, 'H')
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : JSON.stringify(err)
      debugLog('teamScore.ts', 'bump fail', { msg }, 'H')
    }
  })
}
