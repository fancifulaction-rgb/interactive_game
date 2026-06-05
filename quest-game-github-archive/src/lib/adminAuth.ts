import { supabase } from './supabase'

/** Админские INSERT/DELETE в games требуют роли authenticated (RLS 011). */
export async function hasSupabaseAdminSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession()
  return !!data.session
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
