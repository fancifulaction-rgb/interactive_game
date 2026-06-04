const CACHE_TTL_MS = 10 * 60 * 1000

export type TeamSnapshot = {
  id: string
  team_name: string
  captain_name: string
  avatar_url: string | null
  total_score: number
  registration_time?: string
}

export type GamePlayCache = {
  game: Record<string, unknown>
  questions: Record<string, unknown>[]
  teamsSnapshot?: TeamSnapshot[]
  ts: number
}

function cacheKey(code: string) {
  return `quest_play_${code.trim().toUpperCase()}`
}

export function setGamePlayCache(
  code: string,
  payload: Omit<GamePlayCache, 'ts'> & { teamsSnapshot?: TeamSnapshot[] }
) {
  const existing = getGamePlayCache(code)
  const entry: GamePlayCache = {
    game: payload.game,
    questions: payload.questions,
    teamsSnapshot: payload.teamsSnapshot ?? existing?.teamsSnapshot,
    ts: Date.now(),
  }
  sessionStorage.setItem(cacheKey(code), JSON.stringify(entry))
}

export function updateTeamsSnapshot(code: string, teams: TeamSnapshot[]) {
  const cached = getGamePlayCache(code)
  if (!cached) return
  setGamePlayCache(code, {
    game: cached.game,
    questions: cached.questions,
    teamsSnapshot: teams,
  })
}

export function mergeTeamScoreInCache(code: string, teamId: string, delta: number) {
  const cached = getGamePlayCache(code)
  if (!cached?.teamsSnapshot?.length) return
  const teams = cached.teamsSnapshot.map((t) =>
    t.id === teamId ? { ...t, total_score: (t.total_score ?? 0) + delta } : t
  )
  updateTeamsSnapshot(code, teams)
}

export function isGamePlayCacheFresh(code: string, maxAgeMs = 5 * 60 * 1000): boolean {
  const entry = getGamePlayCache(code)
  if (!entry) return false
  return Date.now() - entry.ts <= maxAgeMs
}

export function getGamePlayCache(code: string): GamePlayCache | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(code))
    if (!raw) return null
    const parsed = JSON.parse(raw) as GamePlayCache
    if (!parsed?.game || !Array.isArray(parsed.questions)) return null
    if (Date.now() - (parsed.ts ?? 0) > CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}
