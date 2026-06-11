import { collectClientLog, uploadClientLogBundleToServer } from './clientLogCollector'

/** Включить: VITE_DEBUG_LOG=1 в .env */
const DEBUG_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_DEBUG_LOG === '1'

const LAST_REG_ERROR_KEY = 'quest_last_reg_error'

/** DEV: пишет в ring-buffer → DiagnosticLogsPanel / diagnostic/*.jsonl */
export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown> = {},
  hypothesisId?: string
) {
  if (!import.meta.env.DEV) return
  collectClientLog(location, message, data, { hypothesisId })
}

/** Сохранить текст ошибки регистрации — видно на экране и в diagnostic/exports. */
export function saveRegistrationError(msg: string, extra: Record<string, unknown> = {}) {
  collectClientLog('TeamRegister.tsx', 'registration error', { msg, ...extra }, {
    level: 'error',
    hypothesisId: 'H9',
  })
  void uploadClientLogBundleToServer()
  try {
    localStorage.setItem(LAST_REG_ERROR_KEY, JSON.stringify({ msg, ...extra, ts: Date.now() }))
  } catch {
    // ignore
  }
}

/** Отправить bundle логов на dev-сервер (POST /__client_logs/bundle). */
export async function reportDebugToServer(extra: Record<string, unknown> = {}): Promise<boolean> {
  if (!import.meta.env.DEV) return false
  collectClientLog('debugLog.ts', 'client report', {
    lastErr: getLastRegistrationError(),
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    host: typeof window !== 'undefined' ? window.location.host : '',
    ...extra,
  }, { hypothesisId: 'H9' })
  return uploadClientLogBundleToServer()
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

export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown> = {},
  hypothesisId?: string
) {
  if (!DEBUG_ENABLED) return
  collectClientLog(location, message, data, { hypothesisId })
}
