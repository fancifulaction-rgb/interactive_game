import { debugLog } from './debugLog'

type Task<T> = () => Promise<T>

let criticalRunning = 0
let backgroundRunning = 0

const criticalQueue: Array<{
  task: Task<unknown>
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
}> = []

const backgroundQueue: Array<{
  task: Task<unknown>
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
}> = []

function tryDrainBackground() {
  if (criticalRunning > 0 || criticalQueue.length > 0) return
  if (backgroundRunning >= 1 || backgroundQueue.length === 0) return

  const item = backgroundQueue.shift()!
  backgroundRunning++
  item
    .task()
    .then(item.resolve)
    .catch(item.reject)
    .finally(() => {
      backgroundRunning--
      tryDrainBackground()
    })
}

function drainCritical() {
  if (criticalRunning >= 1 || criticalQueue.length === 0) return

  const item = criticalQueue.shift()!
  criticalRunning++
  item
    .task()
    .then(item.resolve)
    .catch(item.reject)
    .finally(() => {
      criticalRunning--
      drainCritical()
      tryDrainBackground()
    })
}

/** Критичные действия игрока: регистрация, ответ, загрузка табло. */
export function enqueueCritical<T>(task: Task<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // #region agent log
    debugLog(
      'requestQueue.ts',
      'enqueueCritical',
      {
        queueLen: criticalQueue.length,
        running: criticalRunning,
        bgQueueLen: backgroundQueue.length,
        bgRunning: backgroundRunning,
      },
      'H2'
    )
    // #endregion
    criticalQueue.push({
      task: task as Task<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
    })
    drainCritical()
  })
}

const MAX_SUPABASE_FETCHES = 2
let supabaseFetchesRunning = 0
const supabaseFetchWaiters: Array<() => void> = []

type SupabaseFetchJob<T> = {
  task: () => Promise<T>
  priority: number
  resolve: (v: T) => void
  reject: (e: unknown) => void
}

const supabaseFetchQueue: SupabaseFetchJob<unknown>[] = []

function acquireSupabaseFetchSlot(): Promise<void> {
  if (supabaseFetchesRunning < MAX_SUPABASE_FETCHES) {
    supabaseFetchesRunning++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    supabaseFetchWaiters.push(() => {
      supabaseFetchesRunning++
      resolve()
    })
  })
}

function releaseSupabaseFetchSlot(): void {
  supabaseFetchesRunning--
  const next = supabaseFetchWaiters.shift()
  if (next) next()
}

function drainSupabaseFetchQueue(): void {
  while (supabaseFetchesRunning < MAX_SUPABASE_FETCHES && supabaseFetchQueue.length > 0) {
    supabaseFetchQueue.sort((a, b) => b.priority - a.priority)
    const job = supabaseFetchQueue.shift()!
    void acquireSupabaseFetchSlot()
      .then(() => job.task())
      .then(job.resolve)
      .catch(job.reject)
      .finally(() => {
        releaseSupabaseFetchSlot()
        drainSupabaseFetchQueue()
      })
  }
}

/**
 * До 2 параллельных запросов к *.supabase.co (баланс: HTTP/2 reset vs мобильная сеть).
 * priority > 0 — POST/PATCH/DELETE обгоняют фоновые GET (сохранение вопросов на телефоне).
 */
export function enqueueSupabaseFetch<T>(
  task: () => Promise<T>,
  priority: number = 0
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    supabaseFetchQueue.push({
      task: task as () => Promise<unknown>,
      priority,
      resolve: resolve as (v: unknown) => void,
      reject,
    })
    drainSupabaseFetchQueue()
  })
}

/** Фон: аватар, уведомления — после critical. */
export function enqueueBackground<T>(task: Task<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    backgroundQueue.push({
      task: task as Task<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
    })
    tryDrainBackground()
  })
}
