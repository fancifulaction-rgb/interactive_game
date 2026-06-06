import { createClient } from '@supabase/supabase-js'
import { debugLog } from './debugLog'
import { enqueueSupabaseFetch } from './requestQueue'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Потолок на запрос; на мобильной сети 25 с часто не хватает из-за очереди fetch. */
const FETCH_TIMEOUT_MS = 45_000
const FETCH_MAX_ATTEMPTS = 3
const FETCH_RETRY_BASE_MS = 400

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
  err: unknown
): never {
  const msg = err instanceof Error ? err.message : String(err)
  const name = err instanceof Error ? err.name : 'Error'
  const ms = Date.now() - started
  // #region agent log
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
    ms >= FETCH_TIMEOUT_MS - 500 ? 'H4' : 'H7'
  )
  // #endregion
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
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(
        new DOMException(
          `Supabase request timed out after ${FETCH_TIMEOUT_MS}ms`,
          'TimeoutError'
        )
      )
    }, FETCH_TIMEOUT_MS)
  })

  return Promise.race([
    fetch(input, { ...init, signal: controller.signal }),
    timeoutPromise,
  ])
    .finally(() => {
      if (timer) clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onExternalAbort)
    })
    .catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err
      }
      return logFetchFailure(url, init, started, err)
    })
}

/** Promise.race + abort + retry при ERR_CONNECTION_RESET / Failed to fetch. */
async function fetchWithTimeoutCore(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const externalAborted = !!init?.signal?.aborted
  let lastErr: unknown
  for (let attempt = 0; attempt < FETCH_MAX_ATTEMPTS; attempt++) {
    if (init?.signal?.aborted) {
      throw init.signal.reason
    }
    try {
      return await fetchWithTimeoutOnce(input, init)
    } catch (err) {
      lastErr = err
      if (!isRetryableFetchError(err, externalAborted) || attempt >= FETCH_MAX_ATTEMPTS - 1) {
        throw err
      }
      if (import.meta.env.DEV) {
        console.warn('[quest-game] supabase fetch retry', { attempt: attempt + 1 })
      }
      await sleep(FETCH_RETRY_BASE_MS * (attempt + 1))
    }
  }
  throw lastErr
}

function fetchPriority(init?: RequestInit): number {
  const method = (init?.method ?? 'GET').toUpperCase()
  return method === 'GET' || method === 'HEAD' ? 0 : 10
}

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return enqueueSupabaseFetch(
    () => fetchWithTimeoutCore(input, init),
    fetchPriority(init)
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  global: { fetch: fetchWithTimeout },
})
