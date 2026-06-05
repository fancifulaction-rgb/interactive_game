import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Единый канал на игру (IMP-RT-001 / IMP-RT-003). */
export function gameChannelName(gameId: string) {
  return `game:${gameId}`
}

export const SCORE_BROADCAST_EVENT = 'score_update'
export const TEAMS_BROADCAST_EVENT = 'teams_changed'

export type ScoreBroadcastPayload = {
  team_id: string
  total_score: number
  delta?: number
}

const publishChannels = new Map<string, RealtimeChannel>()

async function ensurePublishChannel(gameId: string): Promise<RealtimeChannel> {
  const existing = publishChannels.get(gameId)
  if (existing) return existing

  const channel = supabase.channel(gameChannelName(gameId), {
    config: { broadcast: { ack: false, self: false } },
  })

  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
    })
  })

  publishChannels.set(gameId, channel)
  return channel
}

/** Отправить обновление счёта всем подписчикам табло (без postgres_changes на UPDATE). */
export async function broadcastScoreUpdate(
  gameId: string,
  payload: ScoreBroadcastPayload
): Promise<void> {
  if (!gameId) return
  try {
    const channel = await ensurePublishChannel(gameId)
    await channel.send({
      type: 'broadcast',
      event: SCORE_BROADCAST_EVENT,
      payload,
    })
  } catch (err) {
    console.warn('broadcastScoreUpdate failed:', err)
  }
}

/** Полный перезагруз списка команд (регистрация, сброс заезда, удаление). */
export async function broadcastTeamsChanged(gameId: string): Promise<void> {
  if (!gameId) return
  try {
    const channel = await ensurePublishChannel(gameId)
    await channel.send({
      type: 'broadcast',
      event: TEAMS_BROADCAST_EVENT,
      payload: { game_id: gameId },
    })
  } catch (err) {
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

export type GameRealtimeHandlers = {
  onScoreUpdate?: (payload: ScoreBroadcastPayload) => void
  onTeamsChanged?: () => void
}

/**
 * Подписка на табло: broadcast для счёта, postgres только INSERT/DELETE команд.
 */
export function subscribeGameRealtime(
  gameId: string,
  handlers: GameRealtimeHandlers
): RealtimeChannel {
  const channel = supabase
    .channel(gameChannelName(gameId))
    .on('broadcast', { event: SCORE_BROADCAST_EVENT }, ({ payload }) => {
      handlers.onScoreUpdate?.(payload as ScoreBroadcastPayload)
    })
    .on('broadcast', { event: TEAMS_BROADCAST_EVENT }, () => {
      handlers.onTeamsChanged?.()
    })
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'teams',
        filter: `game_id=eq.${gameId}`,
      },
      () => handlers.onTeamsChanged?.()
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'teams',
        filter: `game_id=eq.${gameId}`,
      },
      () => handlers.onTeamsChanged?.()
    )
    .subscribe()

  return channel
}
