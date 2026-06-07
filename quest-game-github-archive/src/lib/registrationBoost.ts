const BOOST_KEY = 'quest_registration_submit_boost_until'
const BOOST_MS = 90_000

/** Пока идёт submit регистрации — GET games/game_state с priority 10. */
export function markRegistrationSubmitBoost(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(BOOST_KEY, String(Date.now() + BOOST_MS))
  } catch {
    // ignore Private Browsing
  }
}

export function isRegistrationSubmitBoostActive(): boolean {
  if (typeof sessionStorage === 'undefined') return false
  try {
    const until = Number(sessionStorage.getItem(BOOST_KEY))
    return Number.isFinite(until) && until > Date.now()
  } catch {
    return false
  }
}
