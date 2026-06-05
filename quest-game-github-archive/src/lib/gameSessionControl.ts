import { supabase } from './supabase'
import { archiveGameSession } from './eventArchive'
import { fetchGameStateForGame } from './fetchGameState'
import { resetGameProgress } from './resetGameProgress'
import { getAdminDisplayName } from './adminAuth'
import {
  GAME_STATE_FINISHED,
  GAME_STATE_PLAYING,
  GAME_STATE_WAITING,
  getGameStartedAt,
  type GameStateRow,
} from './gameSessionState'

export async function upsertGameStateForGame(
  gameId: string,
  patch: Partial<GameStateRow>
): Promise<void> {
  const { data, error } = await supabase
    .from('game_state')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .select('id')

  if (error) throw error

  if (!data?.length) {
    const { error: insErr } = await supabase.from('game_state').insert({
      game_id: gameId,
      ...patch,
    })
    if (insErr) throw insErr
  }
}

export async function startGameSession(gameId: string): Promise<void> {
  const current = await fetchGameStateForGame(gameId)
  const pd = { ...((current?.player_data as Record<string, unknown>) ?? {}) }
  if (!getGameStartedAt(current)) {
    pd.startedAt = new Date().toISOString()
  }
  await upsertGameStateForGame(gameId, {
    current_state: GAME_STATE_PLAYING,
    is_paused: false,
    paused_at: null,
    paused_by: null,
    player_data: pd,
  })
}

export async function pauseGameSession(gameId: string): Promise<void> {
  await upsertGameStateForGame(gameId, {
    current_state: GAME_STATE_PLAYING,
    is_paused: true,
    paused_at: new Date().toISOString(),
    paused_by: getAdminDisplayName(),
  })
}

export async function resumeGameSession(gameId: string): Promise<void> {
  await upsertGameStateForGame(gameId, {
    current_state: GAME_STATE_PLAYING,
    is_paused: false,
    paused_at: null,
    paused_by: null,
  })
}

export async function finishGameSession(gameId: string): Promise<void> {
  await upsertGameStateForGame(gameId, {
    current_state: GAME_STATE_FINISHED,
    is_paused: false,
    paused_at: null,
    paused_by: null,
  })

  const archive = await archiveGameSession(gameId)
  if (!archive.success) {
    console.warn('Не удалось сохранить архив заезда:', archive.error)
  }
}

export async function restartGameSessionToLobby(gameId: string): Promise<void> {
  const result = await resetGameProgress(gameId)
  if (!result.success) {
    throw new Error(result.error || 'Не удалось сбросить прогресс')
  }
  const current = await fetchGameStateForGame(gameId)
  const pd = { ...((current?.player_data as Record<string, unknown>) ?? {}) }
  delete pd.startedAt
  await upsertGameStateForGame(gameId, {
    current_state: GAME_STATE_WAITING,
    is_paused: false,
    paused_at: null,
    paused_by: null,
    player_data: pd,
  })
}
