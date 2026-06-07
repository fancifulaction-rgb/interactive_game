import { supabase } from './supabase'
import { broadcastTeamsChanged } from './gameRealtime'
import { schedulePendingAvatar } from './pendingAvatar'
import { agentDebugLog, debugLog } from './debugLog'
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

/** Вызов только внутри `enqueueCritical` (без повторной постановки в очередь). */
export async function registerTeamDirect(input: RegisterTeamInput) {
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
  agentDebugLog('teamRegister.ts', 'insert start', { gameId: input.gameId }, 'H11')

  let team: Awaited<ReturnType<typeof insertTeamOnce>>
  try {
    team = await insertTeamOnce(row)
    agentDebugLog('teamRegister.ts', 'insert ok', { teamId: team.id }, 'H11')
  } catch (err) {
    if (!isTransientNetworkError(err)) throw err
    const netMsg = err instanceof Error ? err.message : String(err)
    agentDebugLog('teamRegister.ts', 'insert network fail', { netMsg }, 'H11')
    await new Promise((r) => setTimeout(r, RECOVERY_PAUSE_MS))
    const recovered = await findRegisteredTeam(input.gameId, input.teamName, input.captainName)
    if (recovered) {
      agentDebugLog('teamRegister.ts', 'recovered after network fail', { teamId: recovered.id }, 'H11')
      team = recovered
    } else {
      try {
        team = await insertTeamOnce(row)
        agentDebugLog('teamRegister.ts', 'insert ok on retry', { teamId: team.id }, 'H11')
      } catch (retryErr) {
        if (!isTransientNetworkError(retryErr)) throw retryErr
        await new Promise((r) => setTimeout(r, RECOVERY_PAUSE_MS))
        const recovered2 = await findRegisteredTeam(input.gameId, input.teamName, input.captainName)
        if (!recovered2) throw retryErr
        agentDebugLog('teamRegister.ts', 'recovered on retry fail', { teamId: recovered2.id }, 'H11')
        team = recovered2
      }
    }
  }

  debugLog('teamRegister.ts', 'team insert ok', { teamId: team.id }, 'C')

  if (input.avatarFile) {
    schedulePendingAvatar(team.id, input.gameId, input.avatarFile)
  }

  // Не блокируем UI: postgres_changes teams INSERT + poll админки; channel.send на iOS висит ~10с.
  void broadcastTeamsChanged(input.gameId)

  return { team, gameCode: input.gameCode }
}

export function registerTeam(input: RegisterTeamInput) {
  return enqueueCritical(() => registerTeamDirect(input))
}
