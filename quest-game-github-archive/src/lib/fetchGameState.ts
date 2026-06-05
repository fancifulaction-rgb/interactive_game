import { supabase } from './supabase'
import type { GameStateRow } from './gameSessionState'

/** Одна строка game_state на игру (при дубликатах — самая свежая). */
export async function fetchGameStateForGame(gameId: string): Promise<GameStateRow | null> {
  const { data, error } = await supabase
    .from('game_state')
    .select('id, game_id, current_state, is_paused, paused_at, paused_by, updated_at, player_data')
    .eq('game_id', gameId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data
}
