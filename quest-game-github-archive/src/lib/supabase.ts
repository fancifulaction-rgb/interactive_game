import { createClient } from '@supabase/supabase-js'
import { collectClientLog } from './clientLogCollector'
import { debugLog } from './debugLog'
import { isPlayerFetchBoostActive, isPlayerRoute } from './playerFetchBoost'
import { isAdminFetchBoostActive, isAdminRoute } from './adminFetchBoost'
import { isRegistrationSubmitBoostActive } from './registrationBoost'
import { enqueueSupabaseFetch, isCriticalSessionActive } from './requestQueue'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Потолок на запрос; на мобильной сети 25 с часто не хватает из-за очереди fetch. */
const FETCH_TIMEOUT_MS = 45_000
/** Игрок-GET: на мобильной сети холодный запрос может занять 10-20с — потолок 30с, чтобы не убивать его и не плодить ретраи. */
const PLAYER_GET_TIMEOUT_MS = 30_000
const FETCH_MAX_ATTEMPTS = 3
const FETCH_RETRY_BASE_MS = 400

/** Эффективный таймаут: записи (insert/update/rpc) не обрываем рано — идемпотентность не гарантирована. */
function fetchTimeoutMs(url: string, init?: RequestInit): number {
  const method = (init?.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return FETCH_TIMEOUT_MS
  if (isPlayerRoute()) return PLAYER_GET_TIMEOUT_MS
  return FETCH_TIMEOUT_MS
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableFetchError(err: unknown, externalAborted: boolean): boolean {
  if (externalAborted) return false
  if (err instanceof DOMException) {
    if (err.name === 'TimeoutError') return true
    if (err.name === 'AbortError') return false
  }
  if (err instanceof TypeError) {
    const m = err.message.toLowerCase()
    return m.includes('failed to fetch') || m.includes('network')
  }
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = String((err as { message?: unknown }).message).toLowerCase()
    return m.includes('failed to fetch') || m.includes('connection reset')
  }
  return false
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[quest-game] Задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в файле .env (см. .env.example и docs/SUPABASE_RESTORE.md)'
  )
}

function logFetchFailure(
  url: string,
  init: RequestInit | undefined,
  started: number,
  err: unknown,
  timeoutMs: number
): never {
  const msg = err instanceof Error ? err.message : String(err)
  const name = err instanceof Error ? err.name : 'Error'
  const ms = Date.now() - started
  collectClientLog(
    'supabase.ts',
    'fetch failed',
    {
      url: url.slice(0, 100),
      method: init?.method ?? 'GET',
      ms,
      name,
      msg,
    },
    { level: 'error' }
  )
  debugLog(
    'supabase.ts',
    'fetch failed',
    {
      url: url.slice(0, 120),
      method: init?.method ?? 'GET',
      ms,
      name,
      msg,
      isAuth: url.includes('/auth/v1/'),
    },
    ms >= timeoutMs - 500 ? 'H4' : 'H7'
  )
  // Отмена через abortSignal (StrictMode, уход со страницы) — не ошибка сети.
  if (import.meta.env.DEV && name !== 'AbortError') {
    console.warn('[quest-game] supabase fetch failed', {
      url: url.slice(0, 80),
      ms,
      name,
      msg,
    })
  }
  throw err
}

/** Один fetch с таймаутом и abort. */
function fetchWithTimeoutOnce(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const started = Date.now()
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const timeoutMs = fetchTimeoutMs(url, init)

  const controller = new AbortController()
  const externalSignal = init?.signal
  const onExternalAbort = () => controller.abort(externalSignal?.reason)
  if (externalSignal) {
    if (externalSignal.aborted) {
      return Promise.reject(externalSignal.reason)
    }
    externalSignal.addEventListener('abort', onExternalAbort)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
      reject(
        new DOMException(
          `Supabase request timed out after ${timeoutMs}ms`,
          'TimeoutError'
        )
      )
    }, timeoutMs)
  })

  const method = (init?.method ?? 'GET').toUpperCase()

  return Promise.race([
    fetch(input, { ...init, signal: controller.signal }),
    timeoutPromise,
  ])
    .then((res) => {
      const ms = Date.now() - started
      if (import.meta.env.DEV && (method !== 'GET' || ms >= 1500)) {
        collectClientLog(
          'supabase.ts',
          'fetch ok',
          {
            method,
            url: url.slice(0, 100),
            ms,
            status: res.status,
            bypassBoost: isAdminFetchBoostActive(),
            criticalActive: isCriticalSessionActive(),
            priority: fetchPriority(url, init),
          },
          { level: res.status >= 400 || ms >= 8000 ? 'warn' : 'info' }
        )
      }
      return res
    })
    .finally(() => {
      if (timer) clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onExternalAbort)
    })
    .catch((err) => {
      if (
        timedOut &&
        err instanceof DOMException &&
        err.name === 'AbortError'
      ) {
        throw new DOMException(
          `Supabase request timed out after ${timeoutMs}ms`,
          'TimeoutError'
        )
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err
      }
      return logFetchFailure(url, init, started, err, timeoutMs)
    })
}

/** Promise.race + abort + retry при ERR_CONNECTION_RESET / Failed to fetch. */
function fetchMaxAttempts(url: string): number {
  // Edge Functions часто недоступны; 3× retry по ~19 с блокируют админку на минуту.
  if (url.includes('/functions/v1/')) return 1
  return FETCH_MAX_ATTEMPTS
}

async function fetchWithTimeoutCore(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const maxAttempts = fetchMaxAttempts(url)
  const externalAborted = !!init?.signal?.aborted
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (init?.signal?.aborted) {
      throw init.signal.reason
    }
    try {
      return await fetchWithTimeoutOnce(input, init)
    } catch (err) {
      lastErr = err
      if (!isRetryableFetchError(err, externalAborted) || attempt >= maxAttempts - 1) {
        throw err
      }
      if (import.meta.env.DEV) {
        console.warn('[quest-game] supabase fetch retry', { attempt: attempt + 1 })
        collectClientLog(
          'supabase.ts',
          'fetch retry',
          { url: url.slice(0, 100), attempt: attempt + 1, maxAttempts },
          { level: 'warn', hypothesisId: 'H13' }
        )
      }
      await sleep(FETCH_RETRY_BASE_MS * (attempt + 1))
    }
  }
  throw lastErr
}

function fetchPriority(url: string, init?: RequestInit): number {
  const method = (init?.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return 10

  // Critical admin action (scratch/start): все GET админки обгоняют фоновый poll.
  if (isAdminRoute() && isAdminFetchBoostActive()) return 9

  const path = url.toLowerCase()
  if (path.includes('/rpc/')) return 11
  if (
    isPlayerRoute() &&
    isRegistrationSubmitBoostActive() &&
    (path.includes('/games') || path.includes('game_state'))
  ) {
    return 10
  }
  if (path.includes('game_state')) {
    if (isPlayerRoute() && isPlayerFetchBoostActive()) return 9
    return 9
  }
  if (path.includes('/games')) {
    if (isAdminRoute()) return 9
    if (isPlayerRoute() && isPlayerFetchBoostActive()) return 9
    return 8
  }
  if (path.includes('/questions')) {
    if (isPlayerRoute() && isPlayerFetchBoostActive()) return 9
    // Админка: questions GET ≥8 — иначе deadlock в enqueueCritical (GameEditor load).
    if (isAdminRoute()) return 8
    return 7
  }
  if (path.includes('/answers')) return 6
  // Админка: teams GET ≥8 — иначе deadlock в enqueueCritical (resetGameProgress/select teams).
  // Игрок: список команд лобби — 6 (ниже game_state/games/questions, но не голодает в фоне).
  if (path.includes('/teams') && path.includes('game_id=eq')) {
    if (isAdminRoute()) return 8
    return 6
  }
  if (path.includes('/teams')) {
    if (isAdminRoute()) return 8
    return 5
  }
  if (path.includes('/settings') || path.includes('/themes')) {
    if (isAdminRoute() && isCriticalSessionActive()) return 8
    return isAdminRoute() ? 5 : 3
  }
  return 3
}

/** Игрок game_state в boost-режиме — критичный обгон, но в пределах лимита параллельности. */
function isPlayerCriticalBypass(url: string): boolean {
  if (!isPlayerRoute()) return false
  const path = url.toLowerCase()
  if (!path.includes('game_state')) return false
  return isRegistrationSubmitBoostActive() || isPlayerFetchBoostActive()
}

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const run = () => fetchWithTimeoutCore(input, init)
  // Админ-boost — без очереди (десктоп, не источник мобильного burst).
  if (isAdminFetchBoostActive()) return run()
  // Игрок game_state в boost — первым в очереди (priority 12), но считается в лимите слотов.
  if (isPlayerCriticalBypass(url)) return enqueueSupabaseFetch(run, 12)
  return enqueueSupabaseFetch(run, fetchPriority(url, init))
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  global: { fetch: fetchWithTimeout },
  realtime: {
    params: { eventsPerSecond: 20 },
    heartbeatIntervalMs: 15_000,
  },
})
