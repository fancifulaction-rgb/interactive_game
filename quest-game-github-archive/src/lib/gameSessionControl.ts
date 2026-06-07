import { agentDebugLog } from './debugLog'
import { supabase } from './supabase'
import { enqueueCritical } from './requestQueue'
import { archiveGameSession } from './eventArchive'
import { fetchGameStateForGame } from './fetchGameState'
import { deleteAllTeamsForGame } from './adminTeams'
import { broadcastSessionChanged, broadcastTeamsChanged } from './gameRealtime'
import { resetGameProgress } from './resetGameProgress'
import { getAdminDisplayName } from './adminAuth'
import { isTransientNetworkError, withTransientRetry } from './teamRegister'
import {
  GAME_STATE_FINISHED,
  GAME_STATE_PLAYING,
  GAME_STATE_WAITING,
  getGameStartedAt,
  type GameStateRow,
} from './gameSessionState'

async function upsertGameStateForGameInner(
  gameId: string,
  patch: Partial<GameStateRow>
): Promise<void> {
  const updatedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('game_state')
    .update({ ...patch, updated_at: updatedAt })
    .eq('game_id', gameId)
    .select('id')

  if (error) throw error

  if (!data?.length) {
    const { error: insErr } = await supabase.from('game_state').insert({
      game_id: gameId,
      ...patch,
      updated_at: updatedAt,
    })
    if (insErr) throw insErr
  }

  void broadcastSessionChanged(gameId, {
    current_state: patch.current_state,
    is_paused: patch.is_paused,
    paused_at: patch.paused_at ?? null,
    paused_by: patch.paused_by ?? null,
    updated_at: updatedAt,
  })
}

export function upsertGameStateForGame(
  gameId: string,
  patch: Partial<GameStateRow>
): Promise<void> {
  return enqueueCritical(() => upsertGameStateForGameInner(gameId, patch))
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
  const prevEpoch = typeof pd.lobbyEpoch === 'number' ? pd.lobbyEpoch : 0
  pd.lobbyEpoch = prevEpoch + 1
  await upsertGameStateForGame(gameId, {
    current_state: GAME_STATE_WAITING,
    is_paused: false,
    paused_at: null,
    paused_by: null,
    player_data: pd,
  })
}

/** Полный сброс: ответы, очки, все команды; игра в комнате ожидания. */
export async function restartGameSessionFromScratch(gameId: string): Promise<void> {
  await withTransientRetry(async () => {
    const t0 = Date.now()
    agentDebugLog('gameSessionControl.ts', 'scratch start', { gameId }, 'H18')

    const progress = await resetGameProgress(gameId)
    if (!progress.success) {
      const err = progress.error || 'Не удалось сбросить прогресс'
      if (isTransientNetworkError(new Error(err))) throw new Error(err)
      throw new Error(err)
    }

    agentDebugLog(
      'gameSessionControl.ts',
      'scratch progress done',
      { teamCount: progress.teamIds.length, ms: Date.now() - t0 },
      'H18'
    )

    const deleted = await deleteAllTeamsForGame(gameId, progress.teamIds, true)
    if (!deleted.success) {
      const err = deleted.error || 'Не удалось удалить команды'
      if (isTransientNetworkError(new Error(err))) throw new Error(err)
      throw new Error(err)
    }

    await upsertGameStateForGame(gameId, {
      current_state: GAME_STATE_WAITING,
      is_paused: false,
      paused_at: null,
      paused_by: null,
      player_data: {},
    })

    void broadcastTeamsChanged(gameId)
    agentDebugLog('gameSessionControl.ts', 'scratch done', { ms: Date.now() - t0 }, 'H18')
  }, 'restartFromScratch')
}
