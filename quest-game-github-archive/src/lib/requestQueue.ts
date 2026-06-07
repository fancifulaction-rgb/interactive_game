import { collectClientLog } from './clientLogCollector'
import { agentDebugLog, debugLog } from './debugLog'
import { isAdminRoute } from './adminFetchBoost'

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
  if (isAdminRoute()) return mobile ? 6 : 8
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

/** Активна admin/player critical-сессия — в fetch-очереди только priority ≥ 8. */
export function isCriticalSessionActive(): boolean {
  return criticalDepth > 0 || criticalRunning > 0
}

function pickNextSupabaseFetchJob(): SupabaseFetchJob<unknown> | undefined {
  if (supabaseFetchQueue.length === 0) return undefined
  supabaseFetchQueue.sort((a, b) => b.priority - a.priority || a.enqueuedAt - b.enqueuedAt)
  if (isCriticalSessionActive()) {
    const idx = supabaseFetchQueue.findIndex((j) => j.priority >= 8)
    if (idx === -1) {
      collectClientLog(
        'requestQueue.ts',
        'critical stall: no priority>=8 job',
        {
          qlen: supabaseFetchQueue.length,
          topPriority: supabaseFetchQueue[0]?.priority,
          running: supabaseFetchesRunning,
        },
        { level: 'warn', hypothesisId: 'H4' }
      )
      return undefined
    }
    return supabaseFetchQueue.splice(idx, 1)[0]
  }
  return supabaseFetchQueue.shift()
}

function drainSupabaseFetchQueue(): void {
  while (supabaseFetchesRunning < maxSupabaseFetches()) {
    const job = pickNextSupabaseFetchJob()
    if (!job) break
    const waitedMs = Date.now() - job.enqueuedAt
    if (waitedMs >= 3000) {
      const priorityCounts: Record<string, number> = {}
      for (const q of supabaseFetchQueue) {
        const bucket = String(q.priority)
        priorityCounts[bucket] = (priorityCounts[bucket] ?? 0) + 1
      }
      const payload = {
        waitedMs,
        priority: job.priority,
        running: supabaseFetchesRunning,
        maxSlots: maxSupabaseFetches(),
        qlen: supabaseFetchQueue.length,
        queueByPriority: priorityCounts,
        criticalActive: isCriticalSessionActive(),
      }
      collectClientLog('requestQueue.ts', 'supabase queue wait', payload, {
        level: 'warn',
        hypothesisId: 'H13',
      })
      agentDebugLog('requestQueue.ts', 'supabase queue wait', payload, 'H13')
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
