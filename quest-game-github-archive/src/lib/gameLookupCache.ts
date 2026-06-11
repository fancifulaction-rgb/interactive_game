import { supabase } from './supabase'
import { agentDebugLog } from './debugLog'
import { normalizeJoinToken } from './joinToken'

const TTL_MS = 15 * 60 * 1000
/** После этого возраста кэш отдаётся сразу, но в фоне идёт revalidate. */
const STALE_REVALIDATE_MS = 60 * 1000

export type CachedGameRow = {
  id: string
  code: string
  title: string
  theme: string | null
  per_question_time_sec: number | null
  finish_page_type: string | null
  scoring: unknown
  mask_board: boolean | null
  total_time_sec: number | null
  settings: unknown
  ts: number
}

const GAME_SELECT =
  'id, code, title, theme, per_question_time_sec, finish_page_type, scoring, mask_board, total_time_sec, settings'

type InflightEntry = {
  promise: Promise<CachedGameRow | null>
  gen: number
}

const lookupInflight = new Map<string, InflightEntry>()
const lookupGeneration = new Map<string, number>()
const revalidateInflight = new Set<string>()

const joinLookupInflight = new Map<string, InflightEntry>()
const joinLookupGeneration = new Map<string, number>()
const joinRevalidateInflight = new Set<string>()

function bumpLookupGeneration(code: string): number {
  const next = (lookupGeneration.get(code) ?? 0) + 1
  lookupGeneration.set(code, next)
  return next
}

function key(code: string) {
  return `quest_game_lookup_${code.trim().toUpperCase()}`
}

function joinKey(joinToken: string) {
  return `quest_game_lookup_join_${normalizeJoinToken(joinToken)}`
}

function bumpJoinLookupGeneration(token: string): number {
  const next = (joinLookupGeneration.get(token) ?? 0) + 1
  joinLookupGeneration.set(token, next)
  return next
}

export function getCachedGameByCode(code: string): CachedGameRow | null {
  try {
    const raw = sessionStorage.getItem(key(code))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedGameRow
    if (!parsed?.id || Date.now() - parsed.ts > TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

export function setCachedGameByCode(code: string, game: Omit<CachedGameRow, 'ts'>): void {
  try {
    sessionStorage.setItem(key(code), JSON.stringify({ ...game, ts: Date.now() }))
  } catch {
    /* ignore */
  }
}

async function fetchGameRowFromNetwork(normalized: string): Promise<CachedGameRow | null> {
  const started = Date.now()
  agentDebugLog('gameLookupCache.ts', 'fetch start', { code: normalized }, 'H1')

  const { data, error } = await supabase
    .from('games')
    .select(GAME_SELECT)
    .eq('code', normalized)
    .maybeSingle()

  const ms = Date.now() - started
  if (error) {
    agentDebugLog('gameLookupCache.ts', 'fetch error', { code: normalized, ms, msg: error.message }, 'H1')
    throw error
  }
  if (!data) {
    agentDebugLog('gameLookupCache.ts', 'fetch miss', { code: normalized, ms }, 'H1')
    return null
  }
  const row = data as Omit<CachedGameRow, 'ts'>
  setCachedGameByCode(normalized, row)
  agentDebugLog('gameLookupCache.ts', 'fetch ok', { code: normalized, gameId: row.id, ms }, 'H1')
  return { ...row, ts: Date.now() }
}

function revalidateGameByCodeInBackground(normalized: string): void {
  if (revalidateInflight.has(normalized)) return
  revalidateInflight.add(normalized)
  void fetchGameRowFromNetwork(normalized)
    .catch(() => {
      /* фоновая ошибка не ломает UI */
    })
    .finally(() => {
      revalidateInflight.delete(normalized)
    })
}

/** Один in-flight GET games на код — прогрев и submit делят один запрос. */
export function fetchGameByCode(code: string): Promise<CachedGameRow | null> {
  const normalized = code.trim().toUpperCase()
  const cached = getCachedGameByCode(normalized)
  if (cached) {
    const age = Date.now() - cached.ts
    if (age >= STALE_REVALIDATE_MS) {
      revalidateGameByCodeInBackground(normalized)
    }
    agentDebugLog('gameLookupCache.ts', 'cache hit', { code: normalized, gameId: cached.id, ageMs: age }, 'H1')
    return Promise.resolve(cached)
  }

  const reqGen = lookupGeneration.get(normalized) ?? 0
  const existing = lookupInflight.get(normalized)
  if (existing) {
    agentDebugLog('gameLookupCache.ts', 'inflight join', { code: normalized }, 'H1')
    return existing.promise
  }

  const promise = fetchGameRowFromNetwork(normalized).finally(() => {
    const entry = lookupInflight.get(normalized)
    if (entry?.gen === reqGen) {
      lookupInflight.delete(normalized)
    }
  })

  lookupInflight.set(normalized, { promise, gen: reqGen })
  return promise
}

async function fetchGameRowByJoinFromNetwork(joinToken: string): Promise<CachedGameRow | null> {
  const normalized = normalizeJoinToken(joinToken)
  const started = Date.now()
  agentDebugLog('gameLookupCache.ts', 'fetch join start', { joinToken: normalized }, 'H1')

  const { data, error } = await supabase
    .from('games')
    .select(GAME_SELECT)
    .eq('join_token', normalized)
    .maybeSingle()

  const ms = Date.now() - started
  if (error) {
    agentDebugLog('gameLookupCache.ts', 'fetch join error', { joinToken: normalized, ms, msg: error.message }, 'H1')
    throw error
  }
  if (!data) {
    agentDebugLog('gameLookupCache.ts', 'fetch join miss', { joinToken: normalized, ms }, 'H1')
    return null
  }
  const row = data as Omit<CachedGameRow, 'ts'>
  setCachedGameByCode(row.code, row)
  try {
    sessionStorage.setItem(joinKey(normalized), JSON.stringify({ ...row, ts: Date.now() }))
  } catch {
    /* ignore */
  }
  agentDebugLog('gameLookupCache.ts', 'fetch join ok', { joinToken: normalized, gameId: row.id, ms }, 'H1')
  return { ...row, ts: Date.now() }
}

function getCachedGameByJoinToken(joinToken: string): CachedGameRow | null {
  try {
    const raw = sessionStorage.getItem(joinKey(joinToken))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedGameRow
    if (!parsed?.id || Date.now() - parsed.ts > TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function revalidateGameByJoinInBackground(joinToken: string): void {
  const normalized = normalizeJoinToken(joinToken)
  if (joinRevalidateInflight.has(normalized)) return
  joinRevalidateInflight.add(normalized)
  void fetchGameRowByJoinFromNetwork(normalized)
    .catch(() => {})
    .finally(() => {
      joinRevalidateInflight.delete(normalized)
    })
}

/** Lookup по секретной ссылке регистрации (join_token). */
export function fetchGameByJoinToken(joinToken: string): Promise<CachedGameRow | null> {
  const normalized = normalizeJoinToken(joinToken)
  const cached = getCachedGameByJoinToken(normalized)
  if (cached) {
    const age = Date.now() - cached.ts
    if (age >= STALE_REVALIDATE_MS) {
      revalidateGameByJoinInBackground(normalized)
    }
    return Promise.resolve(cached)
  }

  const reqGen = joinLookupGeneration.get(normalized) ?? 0
  const existing = joinLookupInflight.get(normalized)
  if (existing) {
    return existing.promise
  }

  const promise = fetchGameRowByJoinFromNetwork(normalized).finally(() => {
    const entry = joinLookupInflight.get(normalized)
    if (entry?.gen === reqGen) {
      joinLookupInflight.delete(normalized)
    }
  })

  joinLookupInflight.set(normalized, { promise, gen: reqGen })
  return promise
}
