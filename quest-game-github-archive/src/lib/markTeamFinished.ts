import { supabase } from './supabase'
import { archiveGameSession } from './eventArchive'
import { broadcastSessionChanged } from './gameRealtime'
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

export function enqueueMarkTeamFinished(gameId: string, teamId: string): void {
  if (!gameId || !teamId) return
  void enqueueBackground(async () => {
    const sessionToken = getTeamSessionToken()
    if (!sessionToken) {
      debugLog('markTeamFinished', 'no session token', { teamId })
      return
    }

    const { data, error } = await supabase.rpc('mark_team_finished', {
      p_game_id: gameId,
      p_team_id: teamId,
      p_session_token: sessionToken,
    })

    if (error) {
      console.warn('mark_team_finished failed:', error.message)
      return
    }

    const result = (data ?? {}) as MarkTeamFinishedResult
    invalidateTeamProgressCache(gameId)

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
  })
}
