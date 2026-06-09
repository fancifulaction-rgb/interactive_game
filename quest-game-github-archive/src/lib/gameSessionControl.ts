import { agentDebugLog } from './debugLog'
import { logAdminAction, nextAdminActionId } from './adminActionLog'
import { supabase } from './supabase'
import { enqueueCritical } from './requestQueue'
import { archiveGameSession, type ArchiveGameSessionResult } from './eventArchive'
import { fetchGameStateForGame, invalidateGameStateCache } from './fetchGameState'
import { deleteAllTeamsForGame } from './adminTeams'
import { broadcastSessionChanged, broadcastTeamsChanged } from './gameRealtime'
import { resetGameProgress } from './resetGameProgress'
import { getAdminDisplayName } from './adminAuth'
import { isTransientNetworkError, withTransientRetry } from './teamRegister'
import {
  GAME_STATE_CLOSED,
  GAME_STATE_FINISHED,
  GAME_STATE_PLAYING,
  GAME_STATE_WAITING,
  getGameStartedAt,
  isGameInLobby,
  type GameStateRow,
} from './gameSessionState'

export type AdminSessionRpcSnapshot = {
  success: boolean
  game_id: string
  current_state: string
  is_paused?: boolean
  paused_at?: string | null
  paused_by?: string | null
  player_data?: Record<string, unknown> | null
  teams_deleted?: number
  answers_deleted?: number
  updated_at?: string | null
}

export type SessionActionResult = {
  gameState: GameStateRow
  teamsDeleted?: number
  skipReload?: boolean
  archive?: ArchiveGameSessionResult
}

function isRpcUnavailable(err: unknown): boolean {
  const msg =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message?: unknown }).message).toLowerCase()
      : String(err).toLowerCase()
  return (
    msg.includes('could not find the function') ||
    msg.includes('admin_set_session') ||
    msg.includes('admin_restart_from_scratch') ||
    msg.includes('pgrst202')
  )
}

function snapshotToRow(snapshot: AdminSessionRpcSnapshot): GameStateRow {
  return {
    game_id: snapshot.game_id,
    current_state: snapshot.current_state,
    is_paused: snapshot.is_paused ?? false,
    paused_at: snapshot.paused_at ?? null,
    paused_by: snapshot.paused_by ?? null,
    player_data: (snapshot.player_data as Record<string, unknown>) ?? {},
    updated_at: snapshot.updated_at ?? new Date().toISOString(),
  }
}

async function callAdminSetSessionRpc(
  gameId: string,
  action: string,
  actionId: string
): Promise<AdminSessionRpcSnapshot> {
  logAdminAction(actionId, 'start', { gameId, action, rpc: 'admin_set_session' })
  const t0 = Date.now()
  const { data, error } = await supabase.rpc('admin_set_session', {
    p_game_id: gameId,
    p_action: action,
    p_admin_name: getAdminDisplayName(),
  })
  if (error) {
    logAdminAction(actionId, 'error', { msg: error.message, ms: Date.now() - t0 })
    throw error
  }
  logAdminAction(actionId, 'rpc_done', { ms: Date.now() - t0, action })
  return data as AdminSessionRpcSnapshot
}

async function callRestartFromScratchRpc(
  gameId: string,
  actionId: string
): Promise<AdminSessionRpcSnapshot> {
  logAdminAction(actionId, 'start', { gameId, rpc: 'admin_restart_from_scratch' })
  const t0 = Date.now()
  const { data, error } = await supabase.rpc('admin_restart_from_scratch', {
    p_game_id: gameId,
  })
  if (error) {
    logAdminAction(actionId, 'error', { msg: error.message, ms: Date.now() - t0 })
    throw error
  }
  logAdminAction(actionId, 'rpc_done', { ms: Date.now() - t0 })
  return data as AdminSessionRpcSnapshot
}

async function publishSessionSnapshot(
  gameId: string,
  snapshot: AdminSessionRpcSnapshot,
  options?: { teamsChanged?: boolean }
): Promise<GameStateRow> {
  invalidateGameStateCache(gameId)
  const row = snapshotToRow(snapshot)
  void broadcastSessionChanged(gameId, {
    current_state: row.current_state,
    is_paused: row.is_paused,
    paused_at: row.paused_at ?? null,
    paused_by: row.paused_by ?? null,
    updated_at: row.updated_at ?? null,
  })
  if (options?.teamsChanged) {
    invalidateGameStateCache(gameId)
    void broadcastTeamsChanged(gameId)
  }
  return row
}

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

async function runSessionRpc(
  gameId: string,
  action: string
): Promise<SessionActionResult> {
  const actionId = nextAdminActionId(action)
  return enqueueCritical(async () => {
    try {
      const snapshot = await callAdminSetSessionRpc(gameId, action, actionId)
      const gameState = await publishSessionSnapshot(gameId, snapshot, {
        teamsChanged: action === 'restart_to_lobby',
      })
      logAdminAction(actionId, 'optimistic', { current_state: gameState.current_state })
      return { gameState, skipReload: true }
    } catch (err) {
      if (!isRpcUnavailable(err)) throw err
      agentDebugLog('gameSessionControl.ts', 'RPC fallback', { action }, 'H18')
      return legacySessionAction(gameId, action)
    }
  })
}

async function legacySessionAction(
  gameId: string,
  action: string
): Promise<SessionActionResult> {
  switch (action) {
    case 'open_lobby':
      await upsertGameStateForGameInner(gameId, {
        current_state: GAME_STATE_WAITING,
        is_paused: false,
        paused_at: null,
        paused_by: null,
      })
      break
    case 'close_game': {
      const current = await fetchGameStateForGame(gameId)
      const pd = { ...((current?.player_data as Record<string, unknown>) ?? {}) }
      delete pd.startedAt
      await upsertGameStateForGameInner(gameId, {
        current_state: GAME_STATE_CLOSED,
        is_paused: false,
        paused_at: null,
        paused_by: null,
        player_data: pd,
      })
      break
    }
    case 'start_game': {
      const current = await fetchGameStateForGame(gameId)
      if (!isGameInLobby(current)) {
        throw new Error('Начать игру можно только когда лобби открыто (комната ожидания).')
      }
      const pd = { ...((current?.player_data as Record<string, unknown>) ?? {}) }
      if (!getGameStartedAt(current)) pd.startedAt = new Date().toISOString()
      await upsertGameStateForGameInner(gameId, {
        current_state: GAME_STATE_PLAYING,
        is_paused: false,
        paused_at: null,
        paused_by: null,
        player_data: pd,
      })
      break
    }
    case 'pause':
      await upsertGameStateForGameInner(gameId, {
        current_state: GAME_STATE_PLAYING,
        is_paused: true,
        paused_at: new Date().toISOString(),
        paused_by: getAdminDisplayName(),
      })
      break
    case 'resume':
      await upsertGameStateForGameInner(gameId, {
        current_state: GAME_STATE_PLAYING,
        is_paused: false,
        paused_at: null,
        paused_by: null,
      })
      break
    case 'finish_game':
      await upsertGameStateForGameInner(gameId, {
        current_state: GAME_STATE_FINISHED,
        is_paused: false,
        paused_at: null,
        paused_by: null,
      })
      break
    case 'restart_to_lobby': {
      const result = await resetGameProgress(gameId)
      if (!result.success) throw new Error(result.error || 'Не удалось сбросить прогресс')
      const current = await fetchGameStateForGame(gameId, { force: true })
      const pd = { ...((current?.player_data as Record<string, unknown>) ?? {}) }
      delete pd.startedAt
      const prevEpoch = typeof pd.lobbyEpoch === 'number' ? pd.lobbyEpoch : 0
      pd.lobbyEpoch = prevEpoch + 1
      await upsertGameStateForGameInner(gameId, {
        current_state: GAME_STATE_WAITING,
        is_paused: false,
        paused_at: null,
        paused_by: null,
        player_data: pd,
      })
      void broadcastTeamsChanged(gameId)
      break
    }
    default:
      throw new Error(`Unknown action ${action}`)
  }
  invalidateGameStateCache(gameId)
  const row = await fetchGameStateForGame(gameId, { force: true })
  return { gameState: row ?? { game_id: gameId }, skipReload: false }
}

export async function openLobbySession(gameId: string): Promise<SessionActionResult> {
  return runSessionRpc(gameId, 'open_lobby')
}

export async function closeGameSession(gameId: string): Promise<SessionActionResult> {
  return runSessionRpc(gameId, 'close_game')
}

export async function startGameSession(gameId: string): Promise<SessionActionResult> {
  return runSessionRpc(gameId, 'start_game')
}

export async function pauseGameSession(gameId: string): Promise<SessionActionResult> {
  return runSessionRpc(gameId, 'pause')
}

export async function resumeGameSession(gameId: string): Promise<SessionActionResult> {
  return runSessionRpc(gameId, 'resume')
}

export async function finishGameSession(gameId: string): Promise<SessionActionResult> {
  const result = await runSessionRpc(gameId, 'finish_game')
  const archive = await archiveGameSession(gameId)
  if (!archive.success) {
    console.warn('Не удалось сохранить архив заезда:', archive.error)
  }
  return { ...result, archive }
}

export async function restartGameSessionToLobby(gameId: string): Promise<SessionActionResult> {
  return withTransientRetry(() => runSessionRpc(gameId, 'restart_to_lobby'), 'restartToLobby')
}

/** Полный сброс: ответы, очки, все команды; игра закрыта. */
export async function restartGameSessionFromScratch(
  gameId: string
): Promise<SessionActionResult> {
  return withTransientRetry(async () => {
    const actionId = nextAdminActionId('restart_from_scratch')
    return enqueueCritical(async () => {
      try {
        const snapshot = await callRestartFromScratchRpc(gameId, actionId)
        const gameState = await publishSessionSnapshot(gameId, snapshot, { teamsChanged: true })
        logAdminAction(actionId, 'optimistic', {
          teams_deleted: snapshot.teams_deleted ?? 0,
        })
        return {
          gameState,
          teamsDeleted: snapshot.teams_deleted ?? 0,
          skipReload: true,
        }
      } catch (err) {
        if (!isRpcUnavailable(err)) throw err
        agentDebugLog('gameSessionControl.ts', 'scratch RPC fallback', {}, 'H18')
        const t0 = Date.now()
        const progress = await resetGameProgress(gameId)
        if (!progress.success) {
          throw new Error(progress.error || 'Не удалось сбросить прогресс')
        }
        const deleted = await deleteAllTeamsForGame(gameId, progress.teamIds, true)
        if (!deleted.success) {
          throw new Error(deleted.error || 'Не удалось удалить команды')
        }
        await upsertGameStateForGameInner(gameId, {
          current_state: GAME_STATE_CLOSED,
          is_paused: false,
          paused_at: null,
          paused_by: null,
          player_data: {},
        })
        invalidateGameStateCache(gameId)
        void broadcastTeamsChanged(gameId)
        agentDebugLog('gameSessionControl.ts', 'scratch fallback done', { ms: Date.now() - t0 }, 'H18')
        return {
          gameState: {
            game_id: gameId,
            current_state: GAME_STATE_CLOSED,
            is_paused: false,
            paused_at: null,
            paused_by: null,
            player_data: {},
          },
          teamsDeleted: deleted.teams_deleted,
          skipReload: false,
        }
      }
    })
  }, 'restartFromScratch')
}
