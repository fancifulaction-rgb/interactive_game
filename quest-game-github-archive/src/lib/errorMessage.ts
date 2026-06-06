const ABORT_HINT =
  'Запрос прерван (медленная сеть, таймаут или повторный запрос). Подождите 2–3 секунды и попробуйте снова.'

function isAbortLike(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') return true
    const m = err.message.toLowerCase()
    return m.includes('aborted') || m.includes('abort')
  }
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = String((err as { message?: unknown }).message).toLowerCase()
    return m.includes('aborted') || m.includes('abort')
  }
  return false
}

/** Читаемое сообщение из Error, PostgrestError или plain object (иначе «[object Object]»). */
export function formatErrorMessage(err: unknown): string {
  if (isAbortLike(err)) return ABORT_HINT
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m.trim()) return m
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}
