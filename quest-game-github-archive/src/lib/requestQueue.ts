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
