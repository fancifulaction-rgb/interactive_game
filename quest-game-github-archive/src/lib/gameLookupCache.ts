const TTL_MS = 15 * 60 * 1000

type CachedGame = {
  id: string
  code: string
  title: string
  theme: string | null
  per_question_time_sec: number | null
  finish_page_type: string | null
  scoring: unknown
  mask_board: boolean | null
  total_time_sec: number | null
  ts: number
}

function key(code: string) {
  return `quest_game_lookup_${code.trim().toUpperCase()}`
}

export function getCachedGameByCode(code: string): CachedGame | null {
  try {
    const raw = sessionStorage.getItem(key(code))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedGame
    if (!parsed?.id || Date.now() - parsed.ts > TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

export function setCachedGameByCode(
  code: string,
  game: Omit<CachedGame, 'ts'>
): void {
  try {
    sessionStorage.setItem(key(code), JSON.stringify({ ...game, ts: Date.now() }))
  } catch {
    /* ignore */
  }
}
