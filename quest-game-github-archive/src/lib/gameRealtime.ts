import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { agentDebugLog } from './debugLog'
import { invalidateLobbyTeamsCache } from './fetchLobbyTeams'
import type { GameStateRow } from './gameSessionState'

/** Единый канал на игру (IMP-RT-001 / IMP-RT-003). */
export function gameChannelName(gameId: string) {
  return `game:${gameId}`
}

export const SCORE_BROADCAST_EVENT = 'score_update'
export const TEAMS_BROADCAST_EVENT = 'teams_changed'
export const SESSION_BROADCAST_EVENT = 'session_changed'

export type SessionBroadcastPayload = {
  current_state?: string | null
  is_paused?: boolean
  paused_at?: string | null
  paused_by?: string | null
  updated_at?: string | null
}

export type ScoreBroadcastPayload = {
  team_id: string
  total_score: number
  delta?: number
}

export type GameRealtimeHandlers = {
  onScoreUpdate?: (payload: ScoreBroadcastPayload) => void
  onTeamsChanged?: () => void
  onSessionChanged?: (payload: SessionBroadcastPayload) => void
  onGameStateChanged?: (row: GameStateRow) => void
}

type HandlerSlot = symbol

type GameRealtimeHub = {
  channel: RealtimeChannel
  scoreHandlers: Map<HandlerSlot, (payload: ScoreBroadcastPayload) => void>
  teamsHandlers: Map<HandlerSlot, () => void>
  sessionHandlers: Map<HandlerSlot, (payload: SessionBroadcastPayload) => void>
  gameStateHandlers: Map<HandlerSlot, (row: GameStateRow) => void>
  refCount: number
}

const hubs = new Map<string, GameRealtimeHub>()

const BROADCAST_SEND_TIMEOUT_MS = 1500

async function channelSendWithTimeout(
  channel: RealtimeChannel,
  message: { type: 'broadcast'; event: string; payload: Record<string, unknown> }
): Promise<void> {
  await Promise.race([
    channel.send(message),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('broadcast send timeout')), BROADCAST_SEND_TIMEOUT_MS)
    ),
  ])
}

function dispatchScore(hub: GameRealtimeHub, payload: ScoreBroadcastPayload) {
  for (const fn of hub.scoreHandlers.values()) fn(payload)
}

function dispatchTeams(hub: GameRealtimeHub) {
  for (const fn of hub.teamsHandlers.values()) fn()
}

function dispatchSession(hub: GameRealtimeHub, payload: SessionBroadcastPayload) {
  for (const fn of hub.sessionHandlers.values()) fn(payload)
}

function dispatchGameState(hub: GameRealtimeHub, row: GameStateRow) {
  for (const fn of hub.gameStateHandlers.values()) fn(row)
}

function getOrCreateHub(gameId: string): GameRealtimeHub {
  const existing = hubs.get(gameId)
  if (existing) return existing

  const hub: GameRealtimeHub = {
    channel: null as unknown as RealtimeChannel,
    scoreHandlers: new Map(),
    teamsHandlers: new Map(),
    sessionHandlers: new Map(),
    gameStateHandlers: new Map(),
    refCount: 0,
  }

  const channel = supabase
    .channel(gameChannelName(gameId), {
      config: { broadcast: { ack: false, self: false } },
    })
    .on('broadcast', { event: SCORE_BROADCAST_EVENT }, ({ payload }) => {
      dispatchScore(hub, payload as ScoreBroadcastPayload)
    })
    .on('broadcast', { event: TEAMS_BROADCAST_EVENT }, () => {
      dispatchTeams(hub)
    })
    .on('broadcast', { event: SESSION_BROADCAST_EVENT }, ({ payload }) => {
      dispatchSession(hub, payload as SessionBroadcastPayload)
    })
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'teams',
        filter: `game_id=eq.${gameId}`,
      },
      () => dispatchTeams(hub)
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'teams',
        filter: `game_id=eq.${gameId}`,
      },
      () => dispatchTeams(hub)
    )
    .subscribe()

  hub.channel = channel
  hubs.set(gameId, hub)
  return hub
}

/**
 * Единая подписка на игру: несколько компонентов делят один WebSocket-канал.
 * На iOS Safari дубли `supabase.channel(game:id)` ломали broadcast/postgres handlers.
 */
export function attachGameRealtime(gameId: string, handlers: GameRealtimeHandlers): () => void {
  const hub = getOrCreateHub(gameId)
  const slot: HandlerSlot = Symbol('rt-handler')

  if (handlers.onScoreUpdate) hub.scoreHandlers.set(slot, handlers.onScoreUpdate)
  if (handlers.onTeamsChanged) hub.teamsHandlers.set(slot, handlers.onTeamsChanged)
  if (handlers.onSessionChanged) hub.sessionHandlers.set(slot, handlers.onSessionChanged)
  if (handlers.onGameStateChanged) hub.gameStateHandlers.set(slot, handlers.onGameStateChanged)
  hub.refCount++
  // #region agent log
  agentDebugLog(
    'gameRealtime.ts',
    'attach',
    { gameId, refCount: hub.refCount, teamsHandlers: hub.teamsHandlers.size },
    'H4'
  )
  // #endregion

  return () => {
    hub.scoreHandlers.delete(slot)
    hub.teamsHandlers.delete(slot)
    hub.sessionHandlers.delete(slot)
    hub.gameStateHandlers.delete(slot)
    hub.refCount--
    // #region agent log
    agentDebugLog(
      'gameRealtime.ts',
      'detach',
      { gameId, refCount: hub.refCount },
      'H4'
    )
    // #endregion
    if (hub.refCount <= 0) {
      supabase.removeChannel(hub.channel)
      hubs.delete(gameId)
    }
  }
}

function ensurePublishChannel(gameId: string): RealtimeChannel {
  return getOrCreateHub(gameId).channel
}

/** Отправить обновление счёта всем подписчикам табло (без postgres_changes на UPDATE). */
export async function broadcastScoreUpdate(
  gameId: string,
  payload: ScoreBroadcastPayload
): Promise<void> {
  if (!gameId) return
  try {
    const channel = ensurePublishChannel(gameId)
    await channelSendWithTimeout(channel, {
      type: 'broadcast',
      event: SCORE_BROADCAST_EVENT,
      payload,
    })
  } catch (err) {
    console.warn('broadcastScoreUpdate failed:', err)
  }
}

/** Старт / пауза / финиш — дублируем в broadcast (iOS Safari часто теряет postgres_changes). */
export async function broadcastSessionChanged(
  gameId: string,
  payload: SessionBroadcastPayload
): Promise<void> {
  if (!gameId) return
  try {
    const channel = ensurePublishChannel(gameId)
    await channelSendWithTimeout(channel, {
      type: 'broadcast',
      event: SESSION_BROADCAST_EVENT,
      payload: { game_id: gameId, ...payload },
    })
  } catch (err) {
    console.warn('broadcastSessionChanged failed:', err)
  }
}

/** Полный перезагруз списка команд (регистрация, сброс заезда, удаление). */
export async function broadcastTeamsChanged(gameId: string): Promise<void> {
  if (!gameId) return
  invalidateLobbyTeamsCache(gameId)
  try {
    const channel = ensurePublishChannel(gameId)
    await channelSendWithTimeout(channel, {
      type: 'broadcast',
      event: TEAMS_BROADCAST_EVENT,
      payload: { game_id: gameId },
    })
    // #region agent log
    agentDebugLog('gameRealtime.ts', 'broadcastTeamsChanged ok', { gameId }, 'H5')
    // #endregion
  } catch (err) {
    // #region agent log
    agentDebugLog(
      'gameRealtime.ts',
      'broadcastTeamsChanged fail',
      { gameId, msg: err instanceof Error ? err.message : String(err) },
      'H5'
    )
    // #endregion
    console.warn('broadcastTeamsChanged failed:', err)
  }
}

export function applyScoreBroadcastToTeams<T extends { id: string; total_score: number }>(
  teams: T[],
  payload: ScoreBroadcastPayload
): T[] {
  const updated = teams.map((t) =>
    t.id === payload.team_id ? { ...t, total_score: payload.total_score } : t
  )
  return [...updated].sort((a, b) => b.total_score - a.total_score)
}
