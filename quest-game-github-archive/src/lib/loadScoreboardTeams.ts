import { supabase } from './supabase'
import type { TeamSnapshot } from './gamePlayCache'
import { enqueueCritical } from './requestQueue'

const TEAM_SELECT =
  'id, team_name, captain_name, avatar_url, total_score, registration_time'

export function fetchTeamsForScoreboard(gameId: string): Promise<TeamSnapshot[]> {
  return enqueueCritical(async () => {
    const { data, error } = await supabase
      .from('teams')
      .select(TEAM_SELECT)
      .eq('game_id', gameId)
      .order('total_score', { ascending: false })

    if (error) throw error
    return (data ?? []) as TeamSnapshot[]
  })
}
