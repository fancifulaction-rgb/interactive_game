import { supabase } from './supabase'
import { broadcastTeamsChanged } from './gameRealtime'
import { schedulePendingAvatar } from './pendingAvatar'
import { agentDebugLog, debugLog } from './debugLog'
import { enqueueCritical } from './requestQueue'
import {
  parseRegisterTeamRpc,
  getTeamSessionToken,
  setTeamSessionToken,
  type RegisterTeamRpcRow,
} from './teamSession'
import { readGameJoinToken, readStoredCurrentTeam } from './playerSession'
import { normalizeJoinToken } from './joinToken'

export type RegisterTeamInput = {
  gameId: string
  gameCode: string
  joinToken: string
  teamName: string
  captainName: string
  avatarFile: File | null
}

const RECOVERY_PAUSE_MS = 400

/** RPC register_team / unique index: название уже занято в этой игре. */
export function isTeamNameTakenError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    msg.includes('team_name_taken') ||
    msg.includes('teams_game_id_normalized_name') ||
    (msg.includes('duplicate key') && msg.includes('teams'))
  )
}

export function teamNameTakenUserMessage(): string {
  return 'Команда с таким названием уже зарегистрирована в этой игре. Выберите другое имя.'
}

export function joinTokenRequiredUserMessage(): string {
  return 'Откройте ссылку регистрации из QR-кода организатора (параметр join в адресе).'
}

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
  throw last instanceof Error ? last : new Error(String(last))
}

function requireJoinToken(joinToken: string): string {
  const normalized = normalizeJoinToken(joinToken)
  if (!normalized) {
    throw new Error(joinTokenRequiredUserMessage())
  }
  return normalized
}

async function registerTeamViaRpc(
  gameId: string,
  teamName: string,
  captainName: string,
  joinToken: string
): Promise<{ team: RegisterTeamRpcRow; sessionToken: string }> {
  const { data, error } = await supabase.rpc('register_team', {
    p_game_id: gameId,
    p_team_name: teamName.trim(),
    p_captain_name: captainName.trim(),
    p_join_token: requireJoinToken(joinToken),
  })
  if (error) throw new Error(error.message)
  const parsed = parseRegisterTeamRpc(data)
  if (!parsed) throw new Error('register_team: invalid response')
  return parsed
}

async function recoverTeamSessionViaRpc(
  gameId: string,
  teamName: string,
  captainName: string,
  sessionToken: string,
  joinToken: string
): Promise<{ team: RegisterTeamRpcRow; sessionToken: string }> {
  const { data, error } = await supabase.rpc('recover_team_session', {
    p_game_id: gameId,
    p_team_name: teamName.trim(),
    p_captain_name: captainName.trim(),
    p_session_token: sessionToken,
    p_join_token: requireJoinToken(joinToken),
  })
  if (error) throw new Error(error.message)
  const parsed = parseRegisterTeamRpc(data)
  if (!parsed) throw new Error('recover_team_session: invalid response')
  return parsed
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
    const result = await registerTeamViaRpc(
      input.gameId,
      input.teamName,
      input.captainName,
      input.joinToken
    )
    team = result.team
    sessionToken = result.sessionToken
    agentDebugLog('teamRegister.ts', 'register rpc ok', { teamId: team.id }, 'H11')
  } catch (err) {
    if (isTeamNameTakenError(err)) throw err
    if (!isTransientNetworkError(err)) throw err
    const netMsg = err instanceof Error ? err.message : String(err)
    agentDebugLog('teamRegister.ts', 'register network fail', { netMsg }, 'H11')
    await new Promise((r) => setTimeout(r, RECOVERY_PAUSE_MS))
    const retry = await registerTeamViaRpc(
      input.gameId,
      input.teamName,
      input.captainName,
      input.joinToken
    )
    team = retry.team
    sessionToken = retry.sessionToken
    agentDebugLog('teamRegister.ts', 'register retry ok', { teamId: team.id }, 'H11')
  }

  setTeamSessionToken(sessionToken, team.id)
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

/** Восстановить токен только при валидном prior session token (IMP-SEC-018). */
export async function recoverTeamSessionIfNeeded(
  gameId: string,
  teamName: string,
  captainName: string,
  expectedTeamId?: string,
  joinToken?: string | null
): Promise<string | null> {
  const resolvedJoin = joinToken ?? readGameJoinToken(gameId)
  if (!resolvedJoin) return null

  const priorToken = expectedTeamId ? getTeamSessionToken(expectedTeamId) : null
  if (!priorToken) return null

  try {
    const { team, sessionToken } = await recoverTeamSessionViaRpc(
      gameId,
      teamName,
      captainName,
      priorToken,
      resolvedJoin
    )
    if (expectedTeamId && team.id !== expectedTeamId) {
      debugLog('recoverTeamSession', 'team id mismatch', {
        expectedTeamId,
        actual: team.id,
      })
      return null
    }
    setTeamSessionToken(sessionToken, team.id)
    return sessionToken
  } catch {
    return null
  }
}

/** Токен этой команды: из storage или recover по prior token + join (не чужой вкладки). */
export async function ensureTeamSessionToken(
  gameId: string,
  teamId: string,
  joinToken?: string | null
): Promise<string | null> {
  const existing = getTeamSessionToken(teamId)
  if (existing) return existing
  const team = readStoredCurrentTeam(teamId)
  if (!team) return null
  const name = (team.name ?? team.team_name ?? '').trim()
  const captain = (team.captain_name ?? '').trim()
  if (!name || !captain) return null
  return recoverTeamSessionIfNeeded(gameId, name, captain, teamId, joinToken)
}
