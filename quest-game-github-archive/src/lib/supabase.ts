import { createClient } from '@supabase/supabase-js'
import { debugLog } from './debugLog'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Жёсткий потолок на любой запрос (включая auth refresh), иначе UI «висит» минутами. */
const FETCH_TIMEOUT_MS = 25_000

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
  if (import.meta.env.DEV) {
    console.warn('[quest-game] supabase fetch failed', {
      url: url.slice(0, 80),
      ms,
      name,
      msg,
    })
  }
  throw err
}

/** Promise.race — не трогаем signal SDK, но не ждём вечно (в т.ч. /auth/v1/token). */
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const started = Date.now()
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new DOMException(
          `Supabase request timed out after ${FETCH_TIMEOUT_MS}ms`,
          'TimeoutError'
        )
      )
    }, FETCH_TIMEOUT_MS)
  })

  return Promise.race([fetch(input, init), timeoutPromise])
    .finally(() => {
      if (timer) clearTimeout(timer)
    })
    .catch((err) => logFetchFailure(url, init, started, err))
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  global: { fetch: fetchWithTimeout },
})
