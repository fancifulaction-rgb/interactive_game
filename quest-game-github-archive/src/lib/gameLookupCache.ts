import { supabase } from './supabase'
import { agentDebugLog } from './debugLog'

const DEBUG_INGEST =
  'http://127.0.0.1:7862/ingest/7fb5ad31-3ebd-4437-b10a-7b29790fa840'
const DEBUG_SESSION = '36d626'

function debugIngest(location: string, message: string, data: Record<string, unknown>, hypothesisId: string) {
  if (!import.meta.env.DEV) return
  // #region agent log
  fetch(DEBUG_INGEST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': DEBUG_SESSION },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION,
      location,
      message,
      data,
      hypothesisId,
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
}

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
  ts: number
}

const GAME_SELECT =
  'id, code, title, theme, per_question_time_sec, finish_page_type, scoring, mask_board, total_time_sec'

type InflightEntry = {
  promise: Promise<CachedGameRow | null>
  gen: number
}

const lookupInflight = new Map<string, InflightEntry>()
const lookupGeneration = new Map<string, number>()
const revalidateInflight = new Set<string>()

function bumpLookupGeneration(code: string): number {
  const next = (lookupGeneration.get(code) ?? 0) + 1
  lookupGeneration.set(code, next)
  return next
}

function key(code: string) {
  return `quest_game_lookup_${code.trim().toUpperCase()}`
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
  debugIngest('gameLookupCache.ts', 'fetch start', { code: normalized }, 'H1')
  agentDebugLog('gameLookupCache.ts', 'fetch start', { code: normalized }, 'H1')

  const { data, error } = await supabase
    .from('games')
    .select(GAME_SELECT)
    .eq('code', normalized)
    .maybeSingle()

  const ms = Date.now() - started
  if (error) {
    debugIngest('gameLookupCache.ts', 'fetch error', { code: normalized, ms, msg: error.message }, 'H1')
    agentDebugLog('gameLookupCache.ts', 'fetch error', { code: normalized, ms, msg: error.message }, 'H1')
    throw error
  }
  if (!data) {
    debugIngest('gameLookupCache.ts', 'fetch miss', { code: normalized, ms }, 'H1')
    agentDebugLog('gameLookupCache.ts', 'fetch miss', { code: normalized, ms }, 'H1')
    return null
  }
  const row = data as Omit<CachedGameRow, 'ts'>
  setCachedGameByCode(normalized, row)
  debugIngest('gameLookupCache.ts', 'fetch ok', { code: normalized, gameId: row.id, ms }, 'H1')
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
    debugIngest('gameLookupCache.ts', 'cache hit', { code: normalized, gameId: cached.id, ageMs: age }, 'H1')
    return Promise.resolve(cached)
  }

  const reqGen = lookupGeneration.get(normalized) ?? 0
  const existing = lookupInflight.get(normalized)
  if (existing) {
    debugIngest('gameLookupCache.ts', 'inflight join', { code: normalized }, 'H1')
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
