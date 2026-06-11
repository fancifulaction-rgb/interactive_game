import { supabase } from './supabase'

/** Админские INSERT/DELETE в games требуют роли authenticated (RLS 011). */
export async function hasSupabaseAdminSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession()
  return !!data.session
}

let lastAuthCheckAt = 0
const AUTH_CHECK_CACHE_MS = 60_000

const SESSION_EXPIRED_MSG =
  'Сессия Supabase истекла. Выйдите из админки и войдите снова через email — иначе сохранение отклоняется.'

/** Перед записью в БД: RLS 011 разрешает UPDATE questions только authenticated. */
export async function ensureAuthenticatedSession(): Promise<void> {
  if (Date.now() - lastAuthCheckAt < AUTH_CHECK_CACHE_MS) return

  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session) {
    throw new Error(SESSION_EXPIRED_MSG)
  }
  lastAuthCheckAt = Date.now()
}

/** Перед INSERT/UPDATE/DELETE: всегда проверить сессию и обновить JWT (важно на iPhone/Safari). */
export async function ensureAuthenticatedSessionForWrite(): Promise<void> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session) {
    throw new Error(SESSION_EXPIRED_MSG)
  }

  const expiresAt = data.session.expires_at ?? 0
  const expiresInMs = expiresAt * 1000 - Date.now()
  if (expiresInMs < 5 * 60_000) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError) throw refreshError
    if (!refreshed.session) {
      throw new Error(SESSION_EXPIRED_MSG)
    }
  }

  lastAuthCheckAt = Date.now()
}

export function resetAuthSessionCache(): void {
  lastAuthCheckAt = 0
}

export const ADMIN_SESSION_HINT =
  'Для создания и удаления игр нужен вход через email (Supabase Auth). Если сессия истекла — выйдите и войдите снова.'

export function clearAdminLocalStorage(): void {
  localStorage.removeItem('admin_logged_in')
  localStorage.removeItem('admin_email')
  localStorage.removeItem('admin_username')
  localStorage.removeItem('admin_user_id')
}

/** Источник правды для админ-роутов: Supabase Auth session, не localStorage. */
export async function verifyAdminPanelAccess(): Promise<boolean> {
  const hasSession = await hasSupabaseAdminSession()
  if (!hasSession) {
    clearAdminLocalStorage()
    resetAuthSessionCache()
    return false
  }
  return true
}

/** Только подсказка UI; для gate используйте verifyAdminPanelAccess(). */
export function isAdminPanelLoggedIn(): boolean {
  if (localStorage.getItem('admin_logged_in') !== 'true') return false
  return !!(localStorage.getItem('admin_username') || localStorage.getItem('admin_email'))
}

export function getAdminDisplayName(): string {
  return (
    localStorage.getItem('admin_username') ||
    localStorage.getItem('admin_email') ||
    'Администратор'
  )
}
