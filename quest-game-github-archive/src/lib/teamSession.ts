const LEGACY_TOKEN_KEY = 'team_session_token'

function perTeamKey(teamId: string): string {
  return `team_session_token:${teamId}`
}

/** Токен сессии команды. С teamId — только ключ этой команды (без общего legacy). */
export function getTeamSessionToken(teamId?: string | null): string | null {
  try {
    if (teamId) {
      const scoped = localStorage.getItem(perTeamKey(teamId))
      return scoped && scoped.length > 0 ? scoped : null
    }
    const legacy = localStorage.getItem(LEGACY_TOKEN_KEY)
    return legacy && legacy.length > 0 ? legacy : null
  } catch {
    return null
  }
}

export function setTeamSessionToken(token: string, teamId?: string | null): void {
  try {
    if (teamId) {
      localStorage.setItem(perTeamKey(teamId), token)
    } else {
      localStorage.setItem(LEGACY_TOKEN_KEY, token)
    }
  } catch {
    /* quota / private mode */
  }
}

export function clearTeamSessionToken(teamId?: string | null): void {
  try {
    if (teamId) {
      localStorage.removeItem(perTeamKey(teamId))
    } else {
      localStorage.removeItem(LEGACY_TOKEN_KEY)
    }
  } catch {
    /* ignore */
  }
}

export type RegisterTeamRpcRow = {
  id: string
  game_id: string
  team_name: string | null
  captain_name: string | null
  name: string | null
  avatar_url?: string | null
  avatar?: string | null
  registration_time?: string | null
  created_at?: string | null
  total_score?: number | null
}

export function parseRegisterTeamRpc(data: unknown): { team: RegisterTeamRpcRow; sessionToken: string } | null {
  if (!data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  const token = typeof row.session_token === 'string' ? row.session_token : null
  const teamRaw = row.team
  if (!token || !teamRaw || typeof teamRaw !== 'object') return null
  const team = teamRaw as RegisterTeamRpcRow
  if (!team.id || !team.game_id) return null
  return { team, sessionToken: token }
}
