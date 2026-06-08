import { supabase } from './supabase'
import { broadcastTeamsChanged } from './gameRealtime'
import { schedulePendingAvatar } from './pendingAvatar'
import { agentDebugLog, debugLog } from './debugLog'
import { enqueueCritical } from './requestQueue'
import {
  parseRegisterTeamRpc,
  setTeamSessionToken,
  type RegisterTeamRpcRow,
} from './teamSession'

export type RegisterTeamInput = {
  gameId: string
  gameCode: string
  teamName: string
  captainName: string
  avatarFile: File | null
}

const TEAM_RETURN_COLUMNS =
  'id, game_id, team_name, captain_name, name, avatar_url, avatar, registration_time, created_at, total_score'

const RECOVERY_PAUSE_MS = 400
const RECOVERY_LOOKUP_ATTEMPTS = 4
const RECOVERY_LOOKUP_DELAYS_MS = [200, 400, 700, 1200]

export function isTransientNetworkError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'TimeoutError') return true
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    msg.includes('load failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('connection reset') ||
    msg.includes('timed out') ||
    msg.includes('aborted')
  )
}

/** Повтор при ERR_CONNECTION_RESET / Failed to fetch (админка, сброс игры). */
export async function withTransientRetry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = 3
): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      if (!isTransientNetworkError(e) || i >= attempts - 1) throw e
      agentDebugLog('teamRegister.ts', 'transient retry', { label, attempt: i + 1 }, 'H21')
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw last
}

async function registerTeamViaRpc(
  gameId: string,
  teamName: string,
  captainName: string
): Promise<{ team: RegisterTeamRpcRow; sessionToken: string }> {
  const { data, error } = await supabase.rpc('register_team', {
    p_game_id: gameId,
    p_team_name: teamName.trim(),
    p_captain_name: captainName.trim(),
  })
  if (error) throw new Error(error.message)
  const parsed = parseRegisterTeamRpc(data)
  if (!parsed) throw new Error('register_team: invalid response')
  return parsed
}

async function recoverTeamSessionViaRpc(
  gameId: string,
  teamName: string,
  captainName: string
): Promise<{ team: RegisterTeamRpcRow; sessionToken: string }> {
  const { data, error } = await supabase.rpc('recover_team_session', {
    p_game_id: gameId,
    p_team_name: teamName.trim(),
    p_captain_name: captainName.trim(),
  })
  if (error) throw new Error(error.message)
  const parsed = parseRegisterTeamRpc(data)
  if (!parsed) throw new Error('recover_team_session: invalid response')
  return parsed
}

async function findRegisteredTeam(gameId: string, teamName: string, captainName: string) {
  for (let attempt = 0; attempt < RECOVERY_LOOKUP_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RECOVERY_LOOKUP_DELAYS_MS[attempt - 1] ?? 500))
    }
    const { data, error } = await supabase
      .from('teams')
      .select(TEAM_RETURN_COLUMNS)
      .eq('game_id', gameId)
      .eq('team_name', teamName.trim())
      .eq('captain_name', captainName.trim())
      .order('registration_time', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error && data) return data
    if (error && !isTransientNetworkError(error)) {
      agentDebugLog('teamRegister.ts', 'recover lookup failed', { msg: error.message }, 'H11')
      return null
    }
  }
  agentDebugLog('teamRegister.ts', 'recover lookup exhausted', { gameId }, 'H11')
  return null
}

/** Вызов только внутри `enqueueCritical` (без повторной постановки в очередь). */
export async function registerTeamDirect(input: RegisterTeamInput) {
  debugLog('teamRegister.ts:registerTeam', 'start', {
    gameId: input.gameId,
    hasAvatar: !!input.avatarFile,
    avatarSize: input.avatarFile?.size,
  }, 'B')

  debugLog('teamRegister.ts', 'team register rpc start', {}, 'C')
  agentDebugLog('teamRegister.ts', 'register rpc start', { gameId: input.gameId }, 'H11')

  let team: RegisterTeamRpcRow
  let sessionToken: string

  try {
    const result = await registerTeamViaRpc(input.gameId, input.teamName, input.captainName)
    team = result.team
    sessionToken = result.sessionToken
    agentDebugLog('teamRegister.ts', 'register rpc ok', { teamId: team.id }, 'H11')
  } catch (err) {
    if (!isTransientNetworkError(err)) throw err
    const netMsg = err instanceof Error ? err.message : String(err)
    agentDebugLog('teamRegister.ts', 'register network fail', { netMsg }, 'H11')
    await new Promise((r) => setTimeout(r, RECOVERY_PAUSE_MS))

    try {
      const recovered = await recoverTeamSessionViaRpc(
        input.gameId,
        input.teamName,
        input.captainName
      )
      team = recovered.team
      sessionToken = recovered.sessionToken
      agentDebugLog('teamRegister.ts', 'recover session after fail', { teamId: team.id }, 'H11')
    } catch {
      const existing = await findRegisteredTeam(input.gameId, input.teamName, input.captainName)
      if (!existing) throw err
      const recovered2 = await recoverTeamSessionViaRpc(
        input.gameId,
        input.teamName,
        input.captainName
      )
      team = recovered2.team
      sessionToken = recovered2.sessionToken
      agentDebugLog('teamRegister.ts', 'recover session after lookup', { teamId: team.id }, 'H11')
    }
  }

  setTeamSessionToken(sessionToken)
  debugLog('teamRegister.ts', 'team register ok', { teamId: team.id }, 'C')

  if (input.avatarFile) {
    schedulePendingAvatar(team.id, input.gameId, input.avatarFile)
  }

  void broadcastTeamsChanged(input.gameId)

  return { team, gameCode: input.gameCode, sessionToken }
}

export function registerTeam(input: RegisterTeamInput) {
  return enqueueCritical(() => registerTeamDirect(input))
}

/** Восстановить токен для уже зарегистрированной команды (обновление страницы без токена). */
export async function recoverTeamSessionIfNeeded(
  gameId: string,
  teamName: string,
  captainName: string
): Promise<string | null> {
  try {
    const { sessionToken } = await recoverTeamSessionViaRpc(gameId, teamName, captainName)
    setTeamSessionToken(sessionToken)
    return sessionToken
  } catch {
    return null
  }
}
