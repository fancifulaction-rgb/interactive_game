const INGEST_PATH = '/ingest/7fb5ad31-3ebd-4437-b10a-7b29790fa840'
const SESSION = '017ee8'

/** Включить: VITE_DEBUG_LOG=1 в .env (сессия 017ee8). */
const DEBUG_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_DEBUG_LOG === '1'

function ingestUrl(): string {
  if (typeof window === 'undefined') {
    return `http://127.0.0.1:7862${INGEST_PATH}`
  }
  const host =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? '127.0.0.1'
      : window.location.hostname
  return `http://${host}:7862${INGEST_PATH}`
}

export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown> = {},
  hypothesisId?: string
) {
  if (!DEBUG_ENABLED) return
  const payload = {
    sessionId: SESSION,
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
  }
  // #region agent log
  fetch(ingestUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION },
    body: JSON.stringify(payload),
  }).catch(() => {})
  // #endregion
}
