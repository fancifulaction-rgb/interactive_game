const BOOST_KEY = 'quest_player_fetch_boost_until'
const BOOST_MS = 30_000

/** Повысить приоритет GET questions/games на player routes после navigate. */
export function markPlayerFetchBoost(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(BOOST_KEY, String(Date.now() + BOOST_MS))
  } catch {
    // ignore Private Browsing
  }
}

export function isPlayerFetchBoostActive(): boolean {
  if (typeof sessionStorage === 'undefined') return false
  try {
    const until = Number(sessionStorage.getItem(BOOST_KEY))
    return Number.isFinite(until) && until > Date.now()
  } catch {
    return false
  }
}

export function isPlayerRoute(): boolean {
  if (typeof window === 'undefined') return false
  const path = window.location.pathname
  return path.startsWith('/game/') || path.startsWith('/team/register')
}
