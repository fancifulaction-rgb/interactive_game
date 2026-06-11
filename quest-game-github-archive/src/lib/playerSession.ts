const REG_TIME_KEY = 'team_registration_time'
const JOIN_TOKEN_KEY_PREFIX = 'join_token:'

export function saveGameJoinToken(gameId: string, joinToken: string): void {
  try {
    localStorage.setItem(`${JOIN_TOKEN_KEY_PREFIX}${gameId}`, joinToken.trim())
  } catch {
    /* quota / private mode */
  }
}

export function readGameJoinToken(gameId: string): string | null {
  try {
    return localStorage.getItem(`${JOIN_TOKEN_KEY_PREFIX}${gameId}`)
  } catch {
    return null
  }
}

export function teamIdKeyForGame(gameCode: string): string {
  return `team_id:${gameCode.trim().toUpperCase()}`
}

export function currentTeamKeyForTeam(teamId: string): string {
  return `current_team:${teamId}`
}

/** team_id для конкретной игры (scoped); fallback — legacy только если game_code совпадает. */
export function readStoredTeamIdForGame(gameCode: string): string | null {
  const code = gameCode.trim().toUpperCase()
  try {
    const scoped = localStorage.getItem(teamIdKeyForGame(code))
    if (scoped) return scoped
    const storedCode = (localStorage.getItem('game_code') ?? '').trim().toUpperCase()
    const legacyTeamId = localStorage.getItem('team_id')
    if (legacyTeamId && storedCode === code) return legacyTeamId
  } catch {
    /* quota / private mode */
  }
  return null
}

export type StoredCurrentTeam = {
  id: string
  name?: string
  team_name?: string
  captain_name?: string
  players?: string[]
  avatar_url?: string | null
  total_score?: number
}

/** Данные команды для recovery; не возвращает чужую команду из глобального current_team. */
export function readStoredCurrentTeam(teamId: string): StoredCurrentTeam | null {
  try {
    const scopedRaw = localStorage.getItem(currentTeamKeyForTeam(teamId))
    if (scopedRaw) {
      const team = JSON.parse(scopedRaw) as StoredCurrentTeam
      if (team?.id === teamId) return team
    }
    const legacyRaw = localStorage.getItem('current_team')
    if (!legacyRaw) return null
    const team = JSON.parse(legacyRaw) as StoredCurrentTeam
    if (team?.id !== teamId) return null
    return team
  } catch {
    return null
  }
}

export function writeStoredCurrentTeam(team: StoredCurrentTeam): void {
  if (!team.id) return
  const payload = JSON.stringify(team)
  try {
    localStorage.setItem('current_team', payload)
    localStorage.setItem(currentTeamKeyForTeam(team.id), payload)
  } catch {
    /* quota / private mode */
  }
}

export function saveTeamSession(
  team: {
    id: string
    registration_time?: string | null
    created_at?: string | null
  },
  gameCode?: string
) {
  localStorage.setItem('team_id', team.id)
  if (gameCode) {
    localStorage.setItem(teamIdKeyForGame(gameCode), team.id)
  }
  const since = team.registration_time || team.created_at || new Date().toISOString()
  localStorage.setItem(REG_TIME_KEY, since)
  localStorage.setItem(`${REG_TIME_KEY}:${team.id}`, since)
}

export function getTeamRegistrationSince(teamId?: string | null): string | null {
  if (teamId) {
    const scoped = localStorage.getItem(`${REG_TIME_KEY}:${teamId}`)
    if (scoped) return scoped
  }
  return localStorage.getItem(REG_TIME_KEY)
}
