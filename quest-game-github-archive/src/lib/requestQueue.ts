import { agentDebugLog, debugLog } from './debugLog'

type Task<T> = () => Promise<T>

let criticalRunning = 0
/** >0 внутри выполняющейся critical-задачи — вложенный enqueueCritical не ждёт очередь (иначе deadlock). */
let criticalDepth = 0
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
  criticalDepth++
  Promise.resolve()
    .then(() => item.task())
    .then(item.resolve)
    .catch(item.reject)
    .finally(() => {
      criticalDepth--
      criticalRunning--
      drainCritical()
      tryDrainBackground()
    })
}

/** Критичные действия игрока: регистрация, ответ, загрузка табло. */
export function enqueueCritical<T>(task: Task<T>): Promise<T> {
  if (criticalDepth > 0) {
    return task()
  }
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

function maxSupabaseFetches(): number {
  if (typeof navigator === 'undefined') return 4
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  // Safari/iOS: до 6 соединений на хост; узкая очередь давала ~10с на каждый запрос.
  return mobile ? 6 : 4
}
let supabaseFetchesRunning = 0
const supabaseFetchWaiters: Array<() => void> = []

type SupabaseFetchJob<T> = {
  task: () => Promise<T>
  priority: number
  enqueuedAt: number
  resolve: (v: T) => void
  reject: (e: unknown) => void
}

const supabaseFetchQueue: SupabaseFetchJob<unknown>[] = []

function acquireSupabaseFetchSlot(): Promise<void> {
  if (supabaseFetchesRunning < maxSupabaseFetches()) {
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

function isCriticalSessionActive(): boolean {
  return criticalDepth > 0 || criticalRunning > 0
}

function pickNextSupabaseFetchJob(): SupabaseFetchJob<unknown> | undefined {
  if (supabaseFetchQueue.length === 0) return undefined
  supabaseFetchQueue.sort((a, b) => b.priority - a.priority || a.enqueuedAt - b.enqueuedAt)
  if (isCriticalSessionActive()) {
    const idx = supabaseFetchQueue.findIndex((j) => j.priority >= 8)
    if (idx === -1) return undefined
    return supabaseFetchQueue.splice(idx, 1)[0]
  }
  return supabaseFetchQueue.shift()
}

function drainSupabaseFetchQueue(): void {
  while (supabaseFetchesRunning < maxSupabaseFetches()) {
    const job = pickNextSupabaseFetchJob()
    if (!job) break
    const waitedMs = Date.now() - job.enqueuedAt
    if (waitedMs >= 2000) {
      // #region agent log
      agentDebugLog(
        'requestQueue.ts',
        'supabase queue wait',
        { waitedMs, priority: job.priority, running: supabaseFetchesRunning, qlen: supabaseFetchQueue.length },
        'H13'
      )
      // #endregion
    }
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
 * До 4 (desktop) / 6 (mobile) параллельных запросов к *.supabase.co.
 * priority > 0 — POST/PATCH/DELETE обгоняют фоновые GET; при critical — только priority ≥ 8.
 */
export function enqueueSupabaseFetch<T>(
  task: () => Promise<T>,
  priority: number = 0
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const job: SupabaseFetchJob<unknown> = {
      task: task as () => Promise<unknown>,
      priority,
      enqueuedAt: Date.now(),
      resolve: resolve as (v: unknown) => void,
      reject,
    }
    if (priority >= 10) {
      supabaseFetchQueue.unshift(job)
    } else {
      supabaseFetchQueue.push(job)
    }
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
