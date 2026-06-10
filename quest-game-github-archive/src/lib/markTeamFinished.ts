import { supabase } from './supabase'
import { archiveGameSession } from './eventArchive'
import { broadcastSessionChanged, broadcastTeamsChanged } from './gameRealtime'
import { debugLog } from './debugLog'
import { enqueueBackground } from './requestQueue'
import { getTeamSessionToken } from './teamSession'
import { invalidateTeamProgressCache } from './teamProgress'

export type MarkTeamFinishedResult = {
  success: boolean
  team_id?: string
  finished_at?: string
  game_finished?: boolean
  current_state?: string
  reason?: string
}

export async function markTeamFinished(
  gameId: string,
  teamId: string,
  sessionToken?: string | null
): Promise<MarkTeamFinishedResult | null> {
  if (!gameId || !teamId) return null

  const token = sessionToken ?? getTeamSessionToken(teamId)
  if (!token) {
    debugLog('markTeamFinished', 'no session token', { teamId })
    return null
  }

  const { data, error } = await supabase.rpc('mark_team_finished', {
    p_game_id: gameId,
    p_team_id: teamId,
    p_session_token: token,
  })

  if (error) {
    console.warn('mark_team_finished failed:', error.message)
    return null
  }

  const result = (data ?? {}) as MarkTeamFinishedResult
  if (!result.success) {
    debugLog('markTeamFinished', 'rpc declined', { teamId, reason: result.reason })
    return result
  }

  invalidateTeamProgressCache(gameId)
  void broadcastTeamsChanged(gameId)

  if (result.game_finished && result.current_state === 'finished') {
    debugLog('markTeamFinished', 'auto-finish session', { gameId })
    await broadcastSessionChanged(gameId, {
      current_state: 'finished',
      is_paused: false,
      paused_at: null,
      paused_by: null,
    })
    const archive = await archiveGameSession(gameId)
    if (!archive.success) {
      console.warn('Архив заезда после автофиниша:', archive.error)
    }
  }

  return result
}

/** Фоновая пометка (не hot-path финиша). Токен захватывается при постановке в очередь. */
export function enqueueMarkTeamFinished(gameId: string, teamId: string): void {
  if (!gameId || !teamId) return
  const sessionToken = getTeamSessionToken(teamId)
  void enqueueBackground(async () => {
    await markTeamFinished(gameId, teamId, sessionToken)
  })
}
