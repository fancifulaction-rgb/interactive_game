const ENDPOINT = 'http://127.0.0.1:7862/ingest/7fb5ad31-3ebd-4437-b10a-7b29790fa840'
const SESSION = 'e7f9ce'

const DEBUG_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_DEBUG_LOG === '1'

export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown> = {},
  hypothesisId?: string
) {
  if (!DEBUG_ENABLED) return
  // #region agent log
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION },
    body: JSON.stringify({
      sessionId: SESSION,
      location,
      message,
      data,
      hypothesisId,
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
}
