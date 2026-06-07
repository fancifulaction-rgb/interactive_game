/**
 * Постоянный сбор диагностических логов (DEV).
 * Файл на ПК после тестов: quest-game-github-archive/diagnostic/client-logs.jsonl
 */

export const CLIENT_LOG_FILE_HINT =
  'quest-game-github-archive/diagnostic/client-logs.jsonl'

const STORAGE_KEY = 'quest_client_diagnostic_v1'
const MAX_ENTRIES = 800
const FLUSH_BATCH = 12
const FLUSH_MS = 1500

export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error'

export type ClientLogEntry = {
  ts: number
  level: ClientLogLevel
  source: string
  message: string
  data?: Record<string, unknown>
  hypothesisId?: string
  ctx: {
    route: string
    gameCode: string | null
    teamId: string | null
    ua: string
    host: string
  }
}

let pendingFlush: ClientLogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function isEnabled(): boolean {
  return import.meta.env.DEV
}

function readContext(): ClientLogEntry['ctx'] {
  let gameCode: string | null = null
  let teamId: string | null = null
  try {
    gameCode = localStorage.getItem('game_code')
    teamId = localStorage.getItem('team_id')
  } catch {
    // ignore
  }
  return {
    route: typeof window !== 'undefined' ? window.location.pathname : '',
    gameCode,
    teamId,
    ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 160) : '',
    host: typeof window !== 'undefined' ? window.location.host : '',
  }
}

function readRing(): ClientLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ClientLogEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRing(entries: ClientLogEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // quota — trim harder
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-Math.floor(MAX_ENTRIES / 2))))
    } catch {
      // ignore
    }
  }
}

function scheduleServerFlush(entry: ClientLogEntry) {
  if (!isEnabled() || typeof window === 'undefined') return
  pendingFlush.push(entry)
  if (pendingFlush.length >= FLUSH_BATCH) {
    void flushToServer()
    return
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flushToServer()
    }, FLUSH_MS)
  }
}

async function flushToServer(): Promise<void> {
  if (pendingFlush.length === 0) return
  const batch = pendingFlush.splice(0, pendingFlush.length)
  const body = batch.map((e) => JSON.stringify(e)).join('\n') + '\n'
  try {
    await fetch(`${window.location.origin}/__client_logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson' },
      body,
      keepalive: true,
    })
  } catch {
    // offline / prod build without middleware
  }
}

/** Основная точка входа — вызывается из debugLog / agentDebugLog и критичных мест. */
export function collectClientLog(
  source: string,
  message: string,
  data: Record<string, unknown> = {},
  opts?: { level?: ClientLogLevel; hypothesisId?: string }
): void {
  if (!isEnabled()) return

  const entry: ClientLogEntry = {
    ts: Date.now(),
    level: opts?.level ?? 'info',
    source,
    message,
    data,
    hypothesisId: opts?.hypothesisId,
    ctx: readContext(),
  }

  const ring = readRing()
  ring.push(entry)
  while (ring.length > MAX_ENTRIES) ring.shift()
  writeRing(ring)
  scheduleServerFlush(entry)
}

export function collectClientLogError(
  source: string,
  message: string,
  data: Record<string, unknown> = {},
  hypothesisId?: string
) {
  collectClientLog(source, message, data, { level: 'error', hypothesisId })
}

export function getClientLogEntries(): ClientLogEntry[] {
  return readRing()
}

export function clearClientLogs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  pendingFlush = []
}

export type ClientLogExportBundle = {
  exportedAt: string
  hint: string
  entries: ClientLogEntry[]
  meta: {
    ua: string
    host: string
    route: string
  }
}

export function buildClientLogExportBundle(): ClientLogExportBundle {
  return {
    exportedAt: new Date().toISOString(),
    hint: CLIENT_LOG_FILE_HINT,
    entries: getClientLogEntries(),
    meta: {
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      host: typeof window !== 'undefined' ? window.location.host : '',
      route: typeof window !== 'undefined' ? window.location.pathname : '',
    },
  }
}

export function downloadClientLogsJson(filename?: string): void {
  const bundle = buildClientLogExportBundle()
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download =
    filename ??
    `quest-diagnostic-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Слить импортированный JSON (с iPhone) в localStorage админки для просмотра. */
export function mergeImportedClientLogs(bundle: ClientLogExportBundle): number {
  const existing = readRing()
  const merged = [...existing, ...bundle.entries].sort((a, b) => a.ts - b.ts)
  const trimmed = merged.slice(-MAX_ENTRIES)
  writeRing(trimmed)
  return bundle.entries.length
}

export async function fetchServerDiagnosticLogs(): Promise<string | null> {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  try {
    const res = await fetch(`${window.location.origin}/__client_logs/export`)
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

export async function downloadServerDiagnosticLogs(): Promise<boolean> {
  const text = await fetchServerDiagnosticLogs()
  if (!text) return false
  const blob = new Blob([text], { type: 'application/x-ndjson' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `quest-server-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
  a.click()
  URL.revokeObjectURL(url)
  return true
}

/** Инициализация: навигация, необработанные ошибки. */
export function initClientLogCollector(): void {
  if (!isEnabled() || typeof window === 'undefined') return

  collectClientLog('clientLogCollector', 'session start', {
    href: window.location.href,
  })

  window.addEventListener('error', (ev) => {
    collectClientLogError('window', 'uncaught error', {
      message: ev.message,
      filename: ev.filename,
      lineno: ev.lineno,
    })
  })

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason instanceof Error ? ev.reason.message : String(ev.reason)
    collectClientLogError('window', 'unhandled rejection', { reason })
  })

  const origPushState = history.pushState.bind(history)
  history.pushState = (...args) => {
    origPushState(...args)
    collectClientLog('navigation', 'pushState', { path: window.location.pathname })
  }
  const origReplaceState = history.replaceState.bind(history)
  history.replaceState = (...args) => {
    origReplaceState(...args)
    collectClientLog('navigation', 'replaceState', { path: window.location.pathname })
  }
}
