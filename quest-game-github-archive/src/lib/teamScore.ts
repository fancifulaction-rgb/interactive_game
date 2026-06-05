import { supabase } from './supabase'
import { debugLog } from './debugLog'
import { enqueueBackground } from './requestQueue'
import { mergeTeamScoreInCache } from './gamePlayCache'

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
