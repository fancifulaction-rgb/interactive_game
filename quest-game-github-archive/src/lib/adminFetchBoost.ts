const BOOST_KEY = 'quest_admin_fetch_boost_until'
const BOOST_MS = 90_000

/** Приоритет GET в админке — не ждать player/teams poll в общей очереди fetch. */
export function isAdminRoute(): boolean {
  if (typeof window === 'undefined') return false
  const path = window.location.pathname
  return (
    path.startsWith('/admin') ||
    path.startsWith('/host') ||
    path.startsWith('/scoreboard-detailed') ||
    path.startsWith('/scoreboard-admin')
  )
}

/** На время critical-действий админки (scratch, pause, start) — GET priority 9. */
export function markAdminFetchBoost(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(BOOST_KEY, String(Date.now() + BOOST_MS))
  } catch {
    // Private Browsing
  }
}

export function clearAdminFetchBoost(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(BOOST_KEY)
  } catch {
    // ignore
  }
}

export function isAdminFetchBoostActive(): boolean {
  if (typeof sessionStorage === 'undefined') return false
  try {
    const until = Number(sessionStorage.getItem(BOOST_KEY))
    return Number.isFinite(until) && until > Date.now()
  } catch {
    return false
  }
}
