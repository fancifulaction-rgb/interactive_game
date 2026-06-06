const ABORT_HINT =
  'Запрос прерван (медленная сеть, таймаут или повторный запрос). Подождите 2–3 секунды и попробуйте снова.'

const NETWORK_HINT =
  'Сбой соединения с Supabase (ERR_CONNECTION_RESET). Подождите 2–3 секунды и повторите действие.'

const SESSION_HINT =
  'Нет сессии Supabase Auth. Выйдите и войдите через email (не «учётные данные») — иначе сохранение запрещено политикой БД.'

const RLS_HINT =
  'Запись отклонена политикой безопасности. Войдите через email и повторите сохранение.'

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

function isNetworkLikeMessage(msg: string): boolean {
  const m = msg.toLowerCase()
  return m.includes('failed to fetch') || m.includes('connection reset') || m.includes('network')
}

function mapKnownMessage(msg: string): string | null {
  const m = msg.toLowerCase()
  if (isNetworkLikeMessage(msg)) return NETWORK_HINT
  if (m.includes('сессия supabase') || m.includes('jwt') || m.includes('not authenticated')) {
    return SESSION_HINT
  }
  if (m.includes('row-level security') || m.includes('rls') || m.includes('42501')) {
    return RLS_HINT
  }
  return null
}

/** Читаемое сообщение из Error, PostgrestError или plain object (иначе «[object Object]»). */
export function formatErrorMessage(err: unknown): string {
  if (isAbortLike(err)) return ABORT_HINT
  if (err instanceof Error) {
    return mapKnownMessage(err.message) ?? err.message
  }
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m.trim()) {
      return mapKnownMessage(m) ?? m
    }
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}
