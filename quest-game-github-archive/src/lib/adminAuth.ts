import { supabase } from './supabase'

/** Админские INSERT/DELETE в games требуют роли authenticated (RLS 011). */
export async function hasSupabaseAdminSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession()
  return !!data.session
}

/** Перед записью в БД: RLS 011 разрешает UPDATE questions только authenticated. */
export async function ensureAuthenticatedSession(): Promise<void> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session) {
    throw new Error(
      'Сессия Supabase истекла. Выйдите из админки и войдите снова через email — иначе сохранение зависает или отклоняется.'
    )
  }
}

export const ADMIN_SESSION_HINT =
  'Для создания и удаления игр нужен вход через email (Supabase Auth). Если сессия истекла — выйдите и войдите снова.'

/** Флаг из AdminLogin (email или legacy credentials). */
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
