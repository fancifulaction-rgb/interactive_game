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
  // Игрок-мобайл: 2. По device-логам параллельные TLS-коннекты к supabase.co дают 10-20с/запрос,
  // а последовательные по одному keep-alive — ~150мс. Десктоп держит больше — 4.
  return mobile ? 2 : 4
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

/** Priority buckets — без sort на каждом drain (BUG_AUDIT L2). */
const supabaseFetchBuckets = new Map<number, SupabaseFetchJob<unknown>[]>()
let supabaseFetchQueueLen = 0
let supabaseFetchMaxPriority = -1

/** При critical без prio≥8 — временно разрешить prio≥6 (BUG_AUDIT L3). */
const CRITICAL_STARVATION_ESCAPE_MS = 5000

function refreshSupabaseFetchMaxPriority(): void {
  supabaseFetchMaxPriority = -1
  for (const p of supabaseFetchBuckets.keys()) {
    if (p > supabaseFetchMaxPriority) supabaseFetchMaxPriority = p
  }
}

function enqueueSupabaseFetchJob(job: SupabaseFetchJob<unknown>): void {
  const bucket = supabaseFetchBuckets.get(job.priority) ?? []
  bucket.push(job)
  supabaseFetchBuckets.set(job.priority, bucket)
  supabaseFetchQueueLen++
  if (job.priority > supabaseFetchMaxPriority) supabaseFetchMaxPriority = job.priority
}

function dequeueSupabaseFetchJob(priority: number): SupabaseFetchJob<unknown> | undefined {
  const bucket = supabaseFetchBuckets.get(priority)
  if (!bucket || bucket.length === 0) return undefined
  const job = bucket.shift()!
  supabaseFetchQueueLen--
  if (bucket.length === 0) {
    supabaseFetchBuckets.delete(priority)
    if (priority === supabaseFetchMaxPriority) refreshSupabaseFetchMaxPriority()
  }
  return job
}

function supabaseFetchQueueByPriority(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const [p, bucket] of supabaseFetchBuckets) {
    if (bucket.length > 0) counts[String(p)] = bucket.length
  }
  return counts
}

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

function pickFromBuckets(minPriority: number): SupabaseFetchJob<unknown> | undefined {
  for (let p = supabaseFetchMaxPriority; p >= minPriority; p--) {
    const job = dequeueSupabaseFetchJob(p)
    if (job) return job
  }
  return undefined
}

function pickStarvationEscapeJob(): SupabaseFetchJob<unknown> | undefined {
  const now = Date.now()
  for (let p = supabaseFetchMaxPriority; p >= 6; p--) {
    const bucket = supabaseFetchBuckets.get(p)
    const head = bucket?.[0]
    if (head && now - head.enqueuedAt >= CRITICAL_STARVATION_ESCAPE_MS) {
      return dequeueSupabaseFetchJob(p)
    }
  }
  return undefined
}

function pickNextSupabaseFetchJob(): SupabaseFetchJob<unknown> | undefined {
  if (supabaseFetchQueueLen === 0) return undefined

  if (isCriticalSessionActive()) {
    const job = pickFromBuckets(8)
    if (job) return job
    const escaped = pickStarvationEscapeJob()
    if (escaped) {
      collectClientLog(
        'requestQueue.ts',
        'critical starvation escape',
        { priority: escaped.priority, waitedMs: Date.now() - escaped.enqueuedAt },
        { level: 'warn', hypothesisId: 'L3' }
      )
      return escaped
    }
    collectClientLog(
      'requestQueue.ts',
      'critical stall: no priority>=8 job',
      {
        qlen: supabaseFetchQueueLen,
        topPriority: supabaseFetchMaxPriority,
        running: supabaseFetchesRunning,
        queueByPriority: supabaseFetchQueueByPriority(),
      },
      { level: 'warn', hypothesisId: 'H4' }
    )
    return undefined
  }

  return pickFromBuckets(0)
}

function drainSupabaseFetchQueue(): void {
  while (supabaseFetchesRunning < maxSupabaseFetches()) {
    const job = pickNextSupabaseFetchJob()
    if (!job) break
    const waitedMs = Date.now() - job.enqueuedAt
    if (waitedMs >= 3000) {
      const payload = {
        waitedMs,
        priority: job.priority,
        running: supabaseFetchesRunning,
        maxSlots: maxSupabaseFetches(),
        qlen: supabaseFetchQueueLen,
        queueByPriority: supabaseFetchQueueByPriority(),
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
 * До 4 параллельных запросов к *.supabase.co (8 — desktop-админка, 6 — mobile-админка).
 * priority > 0 — POST/PATCH/DELETE обгоняют фоновые GET; при critical — только priority ≥ 8.
 */
export function enqueueSupabaseFetch<T>(
  task: () => Promise<T>,
  priority: number = 0
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    enqueueSupabaseFetchJob({
      task: task as () => Promise<unknown>,
      priority,
      enqueuedAt: Date.now(),
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
