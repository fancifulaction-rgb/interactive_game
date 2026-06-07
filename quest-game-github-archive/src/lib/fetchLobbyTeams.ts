import { supabase } from './supabase'
import { agentDebugLog } from './debugLog'
import { isTransientNetworkError } from './teamRegister'

export type LobbyTeamRow = {
  id: string
  team_name: string | null
  name: string | null
  captain_name: string | null
  avatar_url?: string | null
}

type InflightEntry = {
  promise: Promise<LobbyTeamRow[]>
  gen: number
}

const inflight = new Map<string, InflightEntry>()
const lastOk = new Map<string, { at: number; rows: LobbyTeamRow[] }>()
const lastErrorAt = new Map<string, number>()
const generation = new Map<string, number>()

const MIN_INTERVAL_MS = 3000
const MIN_INTERVAL_MOBILE_MS = 15000
const ERROR_BACKOFF_MS = 3000

function bumpGeneration(gameId: string): number {
  const next = (generation.get(gameId) ?? 0) + 1
  generation.set(gameId, next)
  return next
}

function isMobileUa(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export function invalidateLobbyTeamsCache(gameId: string): void {
  bumpGeneration(gameId)
  lastOk.delete(gameId)
  lastErrorAt.delete(gameId)
}

async function fetchLobbyTeamsOnce(gameId: string): Promise<LobbyTeamRow[]> {
  // #region agent log
  agentDebugLog('fetchLobbyTeams.ts', 'start', { gameId }, 'H3')
  // #endregion
  const { data, error } = await supabase
    .from('teams')
    .select('id, team_name, name, captain_name, avatar_url')
    .eq('game_id', gameId)
    .order('registration_time', { ascending: true })
  if (error) {
    // #region agent log
    agentDebugLog('fetchLobbyTeams.ts', 'error', { gameId, msg: error.message }, 'H3')
    // #endregion
    throw error
  }
  const rows = data ?? []
  // #region agent log
  agentDebugLog('fetchLobbyTeams.ts', 'ok', { gameId, count: rows.length }, 'H3')
  // #endregion
  return rows
}

export type FetchLobbyTeamsOptions = {
  /** Обойти throttle/backoff (админка, после регистрации). */
  force?: boolean
}

/**
 * Список команд. Coalescing + throttle только для непустых снимков —
 * пустой ответ никогда не кэшируется (иначе админка «теряет» команды).
 */
export async function fetchLobbyTeams(
  gameId: string,
  options?: FetchLobbyTeamsOptions
): Promise<LobbyTeamRow[]> {
  const force = options?.force ?? false
  const now = Date.now()

  if (force) {
    bumpGeneration(gameId)
  }

  const reqGen = generation.get(gameId) ?? 0

  const running = inflight.get(gameId)
  if (running && !force) return running.promise

  if (!force) {
    const errAt = lastErrorAt.get(gameId)
    if (errAt && now - errAt < ERROR_BACKOFF_MS) {
      const cached = lastOk.get(gameId)
      if (cached && cached.rows.length > 0) {
        // #region agent log
        agentDebugLog('fetchLobbyTeams.ts', 'backoff cache', { gameId, count: cached.rows.length }, 'H3')
        // #endregion
        return cached.rows
      }
    }

    const cached = lastOk.get(gameId)
    const minGap = isMobileUa() ? MIN_INTERVAL_MOBILE_MS : MIN_INTERVAL_MS
    if (cached && cached.rows.length > 0 && now - cached.at < minGap) {
      return cached.rows
    }
  }

  const promise = (async () => {
    try {
      const rows = await fetchLobbyTeamsOnce(gameId)
      if ((generation.get(gameId) ?? 0) === reqGen) {
        if (rows.length > 0 || force) {
          lastOk.set(gameId, { at: Date.now(), rows })
        }
      }
      lastErrorAt.delete(gameId)
      return rows
    } catch (err) {
      if (isTransientNetworkError(err)) {
        lastErrorAt.set(gameId, Date.now())
        const cached = lastOk.get(gameId)
        if (cached && cached.rows.length > 0) return cached.rows
      }
      throw err
    } finally {
      const entry = inflight.get(gameId)
      if (entry?.gen === reqGen) {
        inflight.delete(gameId)
      }
    }
  })()

  inflight.set(gameId, { promise, gen: reqGen })
  return promise
}
