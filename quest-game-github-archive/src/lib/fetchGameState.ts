import { supabase } from './supabase'
import type { GameStateRow } from './gameSessionState'
import { gameStateUpdatedAtMs } from './gameSessionState'

type InflightEntry = {
  promise: Promise<GameStateRow | null>
  gen: number
}

const inflight = new Map<string, InflightEntry>()
const lastOk = new Map<string, { at: number; row: GameStateRow | null }>()
const generation = new Map<string, number>()

function bumpGeneration(gameId: string): number {
  const next = (generation.get(gameId) ?? 0) + 1
  generation.set(gameId, next)
  return next
}

export function invalidateGameStateCache(gameId: string): void {
  bumpGeneration(gameId)
  lastOk.delete(gameId)
}

const MIN_INTERVAL_MS = 800
const MIN_INTERVAL_MOBILE_MS = 1500

function isMobileUa(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

async function fetchGameStateForGameDirect(gameId: string): Promise<GameStateRow | null> {
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

export type FetchGameStateOptions = {
  /** Обойти throttle (после broadcast / старт игры). */
  force?: boolean
}

/**
 * Одна строка game_state на игру. Coalescing + короткий throttle —
 * десятки poll не создают шторм параллельных GET на iPhone.
 */
export function fetchGameStateForGame(
  gameId: string,
  options?: FetchGameStateOptions
): Promise<GameStateRow | null> {
  const force = options?.force ?? false
  const now = Date.now()
  const minGap = isMobileUa() ? MIN_INTERVAL_MOBILE_MS : MIN_INTERVAL_MS

  if (force) {
    bumpGeneration(gameId)
    lastOk.delete(gameId)
  }

  const reqGen = generation.get(gameId) ?? 0

  const running = inflight.get(gameId)
  if (running && !force) return running.promise

  if (!force) {
    const cached = lastOk.get(gameId)
    if (cached && now - cached.at < minGap) {
      return Promise.resolve(cached.row)
    }
  }

  const promise = fetchGameStateForGameDirect(gameId)
    .then((row) => {
      if ((generation.get(gameId) ?? 0) === reqGen) {
        lastOk.set(gameId, { at: Date.now(), row })
      }
      return row
    })
    .finally(() => {
      const entry = inflight.get(gameId)
      if (entry?.gen === reqGen) {
        inflight.delete(gameId)
      }
    })

  inflight.set(gameId, { promise, gen: reqGen })
  return promise
}

const ADMIN_GAME_STATE_LIST_SELECT =
  'game_id, current_state, is_paused, updated_at, player_data'

/**
 * Batch game_state для списка игр в админке (один запрос .in).
 * При дубликатах строк берётся запись с более поздним updated_at.
 */
export async function fetchGameStatesForGameIds(
  gameIds: string[]
): Promise<Record<string, GameStateRow | null>> {
  const unique = [...new Set(gameIds.filter(Boolean))]
  const result: Record<string, GameStateRow | null> = {}
  if (unique.length === 0) return result

  const { data, error } = await supabase
    .from('game_state')
    .select(ADMIN_GAME_STATE_LIST_SELECT)
    .in('game_id', unique)

  if (error) throw error

  for (const row of data ?? []) {
    const id = row.game_id as string
    const asRow = row as GameStateRow
    const prev = result[id]
    if (!prev || gameStateUpdatedAtMs(asRow) >= gameStateUpdatedAtMs(prev)) {
      result[id] = asRow
    }
  }

  for (const id of unique) {
    if (!(id in result)) result[id] = null
  }

  return result
}
