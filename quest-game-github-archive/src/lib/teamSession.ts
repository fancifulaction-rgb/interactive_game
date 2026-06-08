const TOKEN_KEY = 'team_session_token'

export function getTeamSessionToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw && raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

export function setTeamSessionToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearTeamSessionToken(): void {
  localStorage.removeItem(TOKEN_KEY)
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
