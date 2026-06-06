import { supabase } from './supabase'
import { broadcastTeamsChanged } from './gameRealtime'
import { schedulePendingAvatar } from './pendingAvatar'
import { debugLog } from './debugLog'
import { enqueueCritical } from './requestQueue'

export type RegisterTeamInput = {
  gameId: string
  gameCode: string
  teamName: string
  captainName: string
  avatarFile: File | null
}

const TEAM_RETURN_COLUMNS =
  'id, game_id, team_name, captain_name, name, avatar_url, avatar, registration_time, created_at, total_score'

async function insertTeamOnce(row: Record<string, unknown>) {
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .insert(row)
    .select(TEAM_RETURN_COLUMNS)
    .maybeSingle()

  if (teamError) throw new Error(teamError.message)
  if (!team) throw new Error('Не удалось создать команду')
  return team
}

async function registerTeamInternal(input: RegisterTeamInput) {
  debugLog('teamRegister.ts:registerTeam', 'start', {
    gameId: input.gameId,
    hasAvatar: !!input.avatarFile,
    avatarSize: input.avatarFile?.size,
  }, 'B')

  const row = {
    game_id: input.gameId,
    team_name: input.teamName.trim(),
    captain_name: input.captainName.trim(),
    name: input.teamName.trim(),
    avatar_url: null,
    avatar: null,
    total_score: 0,
    registration_time: new Date().toISOString(),
  }

  debugLog('teamRegister.ts', 'team insert start', {}, 'C')
  const team = await insertTeamOnce(row)
  debugLog('teamRegister.ts', 'team insert ok', { teamId: team.id }, 'C')

  if (input.avatarFile) {
    schedulePendingAvatar(team.id, input.gameId, input.avatarFile)
  }

  void broadcastTeamsChanged(input.gameId)

  return { team, gameCode: input.gameCode }
}

export function registerTeam(input: RegisterTeamInput) {
  return enqueueCritical(() => registerTeamInternal(input))
}
