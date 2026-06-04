const REG_TIME_KEY = 'team_registration_time'

export function saveTeamSession(team: {
  id: string
  registration_time?: string | null
  created_at?: string | null
}) {
  localStorage.setItem('team_id', team.id)
  const since = team.registration_time || team.created_at || new Date().toISOString()
  localStorage.setItem(REG_TIME_KEY, since)
}

export function getTeamRegistrationSince(): string | null {
  return localStorage.getItem(REG_TIME_KEY)
}
