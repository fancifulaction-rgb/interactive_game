import { agentDebugLog } from './debugLog'
import { isTransientNetworkError } from './teamRegister'
import type { SubmitAutoAnswerRequest } from './submitAutoAnswer'
import { submitAutoAnswerToServer } from './submitAutoAnswer'

const STORAGE_KEY = 'quest_pending_answers_v1'
const MAX_ATTEMPTS = 8
const FLUSH_INTERVAL_MS = 5000

export type PendingAnswerItem = {
  id: string
  req: SubmitAutoAnswerRequest
  gameCode: string
  attempts: number
  at: number
}

let flushTimer: ReturnType<typeof setInterval> | null = null
let flushing = false

function readQueue(): PendingAnswerItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PendingAnswerItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(items: PendingAnswerItem[]) {
  try {
    if (items.length === 0) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    }
  } catch {
    /* quota / private mode */
  }
}

export function enqueuePendingAnswer(
  req: SubmitAutoAnswerRequest,
  gameCode: string
): void {
  const queue = readQueue()
  const dup = queue.some(
    (q) => q.req.team_id === req.team_id && q.req.question_number === req.question_number
  )
  if (dup) return

  queue.push({
    id: `${req.team_id}:${req.question_number}:${Date.now()}`,
    req,
    gameCode: gameCode.trim().toUpperCase(),
    attempts: 0,
    at: Date.now(),
  })
  writeQueue(queue)
  agentDebugLog(
    'pendingAnswerQueue.ts',
    'enqueued',
    { q: req.question_number, teamId: req.team_id, len: queue.length },
    'H7'
  )
}

export async function flushPendingAnswers(): Promise<void> {
  if (flushing) return
  const queue = readQueue()
  if (queue.length === 0) return

  flushing = true
  const remaining: PendingAnswerItem[] = []

  for (const item of queue) {
    try {
      await submitAutoAnswerToServer(item.req)
      agentDebugLog(
        'pendingAnswerQueue.ts',
        'flushed',
        { q: item.req.question_number, attempts: item.attempts },
        'H7'
      )
    } catch (err) {
      const nextAttempts = item.attempts + 1
      if (nextAttempts < MAX_ATTEMPTS && isTransientNetworkError(err)) {
        remaining.push({ ...item, attempts: nextAttempts })
      } else {
        agentDebugLog(
          'pendingAnswerQueue.ts',
          'flush drop',
          {
            q: item.req.question_number,
            attempts: nextAttempts,
            msg: err instanceof Error ? err.message : String(err),
          },
          'H7'
        )
      }
    }
  }

  writeQueue(remaining)
  flushing = false
}

export function startPendingAnswerFlushLoop(): void {
  if (flushTimer) return
  void flushPendingAnswers()
  flushTimer = setInterval(() => {
    void flushPendingAnswers()
  }, FLUSH_INTERVAL_MS)

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void flushPendingAnswers()
    })
  }
}
