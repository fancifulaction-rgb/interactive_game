import { supabase } from './supabase'
import { getGamePlayCache, mergeTeamScoreInCache, updateTeamsSnapshot } from './gamePlayCache'

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
    cached.teamsSnapshot.map((t) => ({
      ...t,
      total_score: t.id === teamId ? score : t.total_score,
    }))
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
