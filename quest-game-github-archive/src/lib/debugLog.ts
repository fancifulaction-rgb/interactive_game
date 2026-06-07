import { collectClientLog, uploadClientLogBundleToServer } from './clientLogCollector'

const INGEST_PATH = '/ingest/7fb5ad31-3ebd-4437-b10a-7b29790fa840'
const SESSION = '017ee8'
const AGENT_SESSION = 'f420a1'

/** Включить: VITE_DEBUG_LOG=1 в .env (сессия 017ee8). */
const DEBUG_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_DEBUG_LOG === '1'

function ingestUrl(): string {
  if (typeof window === 'undefined') {
    return `http://127.0.0.1:7862${INGEST_PATH}`
  }
  // iPhone не достучится до :7862 — прокси через Vite на том же порту, что и приложение.
  if (import.meta.env.DEV) {
    return `${window.location.origin}/__debug_ingest`
  }
  const host =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? '127.0.0.1'
      : window.location.hostname
  return `http://${host}:7862${INGEST_PATH}`
}

const AGENT_RING_KEY = 'agent_debug_ring_f420a1'
const AGENT_RING_MAX = 80

function pushAgentRing(payload: Record<string, unknown>) {
  try {
    const raw = sessionStorage.getItem(AGENT_RING_KEY)
    const arr: Record<string, unknown>[] = raw ? JSON.parse(raw) : []
    arr.push(payload)
    while (arr.length > AGENT_RING_MAX) arr.shift()
    sessionStorage.setItem(AGENT_RING_KEY, JSON.stringify(arr))
  } catch {
    // quota / private mode
  }
}

/** Агентская отладка (сессия f420a1) — всегда в DEV, LAN-aware для iPhone. */
export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown> = {},
  hypothesisId?: string
) {
  if (!import.meta.env.DEV) return
  const payload = {
    sessionId: AGENT_SESSION,
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
  }
  pushAgentRing(payload)
  collectClientLog(location, message, data, { hypothesisId })
  const body = JSON.stringify(payload)
  const url = ingestUrl()
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
    }
  } catch {
    // ignore
  }
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': AGENT_SESSION },
    body,
    keepalive: true,
  }).catch(() => {})
}

const LAST_REG_ERROR_KEY = 'quest_last_reg_error'

/** Сохранить текст ошибки регистрации — видно на экране и в ring-buffer. */
export function saveRegistrationError(msg: string, extra: Record<string, unknown> = {}) {
  collectClientLog('TeamRegister.tsx', 'registration error', { msg, ...extra }, {
    level: 'error',
    hypothesisId: 'H9',
  })
  agentDebugLog('TeamRegister.tsx', 'error', { msg, ...extra }, 'H9')
  void uploadClientLogBundleToServer()
  try {
    localStorage.setItem(LAST_REG_ERROR_KEY, JSON.stringify({ msg, ...extra, ts: Date.now() }))
  } catch {
    // ignore
  }
}

/** Отправить ring-buffer и последнюю ошибку на ПК (через Vite /__debug_ingest). */
export async function reportDebugToServer(extra: Record<string, unknown> = {}): Promise<boolean> {
  if (!import.meta.env.DEV) return false
  const ring = agentDebugDump()
  const lastErr = getLastRegistrationError()
  const payload = {
    sessionId: AGENT_SESSION,
    location: 'debugLog.ts',
    message: 'client report',
    data: {
      ring,
      lastErr,
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      host: typeof window !== 'undefined' ? window.location.host : '',
      ...extra,
    },
    hypothesisId: 'H9',
    timestamp: Date.now(),
  }
  try {
    const res = await fetch(ingestUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': AGENT_SESSION },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
    return false
  }
}

export function getLastRegistrationError(): string | null {
  try {
    const raw = localStorage.getItem(LAST_REG_ERROR_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { msg?: string }
    return parsed.msg ?? null
  } catch {
    return null
  }
}

/** Снять ring-buffer с устройства, если ingest недоступен (iPhone). В консоли Safari: copy(JSON.stringify(__agentDebugDump())) */
export function agentDebugDump(): Record<string, unknown>[] {
  try {
    const raw = sessionStorage.getItem(AGENT_RING_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __agentDebugDump?: typeof agentDebugDump }).__agentDebugDump =
    agentDebugDump
}

export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown> = {},
  hypothesisId?: string
) {
  if (!DEBUG_ENABLED) return
  collectClientLog(location, message, data, { hypothesisId })
  const payload = {
    sessionId: SESSION,
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
  }
  fetch(ingestUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION },
    body: JSON.stringify(payload),
  }).catch(() => {})
}
