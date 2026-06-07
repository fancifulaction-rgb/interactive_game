import { agentDebugLog } from './debugLog'
import { supabase } from './supabase'

export const ADMIN_TEAM_SELECT =
  'id, team_name, captain_name, avatar_url, total_score, registration_time, game_id'

export type AdminTeamRow = {
  id: string
  team_name: string
  captain_name: string
  avatar_url?: string | null
  total_score: number
  registration_time: string
  game_id: string
}

export type DeleteTeamsResult = {
  success: boolean
  teams_deleted: number
  usedEdgeFunction: boolean
  error?: string
}

const EDGE_DELETE_TIMEOUT_MS = 12_000

function isTransientNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /failed to fetch|network|load failed|connection reset/i.test(msg)
}

/** После resetGameProgress: только players + teams (ответы уже удалены). */
async function deleteTeamsAfterProgressReset(teamIds: string[]): Promise<DeleteTeamsResult> {
  const uniqueIds = [...new Set(teamIds.filter(Boolean))]
  if (uniqueIds.length === 0) {
    return { success: true, teams_deleted: 0, usedEdgeFunction: false }
  }

  const t0 = Date.now()
  const { data: teamRows, error: teamsReadError } = await supabase
    .from('teams')
    .select('id, team_name')
    .in('id', uniqueIds)

  if (teamsReadError) {
    agentDebugLog(
      'adminTeams.ts',
      'delete after reset read failed',
      { error: teamsReadError.message.slice(0, 80) },
      'H18'
    )
    return {
      success: false,
      teams_deleted: 0,
      usedEdgeFunction: false,
      error: teamsReadError.message,
    }
  }

  const teamNames = (teamRows ?? [])
    .map((t) => t.team_name)
    .filter((name): name is string => !!name)

  if (teamNames.length > 0) {
    await supabase.from('players').delete().in('team_name', teamNames)
  }

  agentDebugLog(
    'adminTeams.ts',
    'delete after reset teams',
    { count: uniqueIds.length },
    'H18'
  )

  const { data: deletedRows, error: deleteError } = await supabase
    .from('teams')
    .delete()
    .in('id', uniqueIds)
    .select('id')

  if (deleteError) {
    agentDebugLog(
      'adminTeams.ts',
      'delete after reset failed',
      { error: deleteError.message.slice(0, 80) },
      'H18'
    )
    return {
      success: false,
      teams_deleted: 0,
      usedEdgeFunction: false,
      error: deleteError.message,
    }
  }

  if (!deletedRows?.length) {
    return {
      success: false,
      teams_deleted: 0,
      usedEdgeFunction: false,
      error: 'Команды не удалены — проверьте вход через email (Supabase Auth)',
    }
  }

  agentDebugLog(
    'adminTeams.ts',
    'delete after reset ok',
    { count: deletedRows.length, ms: Date.now() - t0 },
    'H18'
  )
  return {
    success: true,
    teams_deleted: deletedRows.length,
    usedEdgeFunction: false,
  }
}

/** Загрузка команд для админки — напрямую, без player-очереди (она может блокироваться часами). */
export async function fetchAdminTeams(gameId: string): Promise<AdminTeamRow[]> {
  const { data, error } = await supabase
    .from('teams')
    .select(ADMIN_TEAM_SELECT)
    .eq('game_id', gameId)
    .order('registration_time', { ascending: false })

  if (error) throw error
  return (data ?? []) as AdminTeamRow[]
}

export async function fetchAdminTeamsWithRetry(gameId: string): Promise<AdminTeamRow[]> {
  try {
    return await fetchAdminTeams(gameId)
  } catch (first) {
    if (!isTransientNetworkError(first)) throw first
    await new Promise((r) => setTimeout(r, 400))
    return fetchAdminTeams(gameId)
  }
}

async function tryEdgeDeleteTeams(
  teamIds: string[],
  gameId: string
): Promise<DeleteTeamsResult | null> {
  try {
    const result = await Promise.race([
      supabase.functions.invoke('delete-teams', {
        body: { team_ids: teamIds, game_id: gameId },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('edge-timeout')), EDGE_DELETE_TIMEOUT_MS)
      ),
    ])

    const { data, error } = result
    if (error) return null
    if (data?.error) {
      return {
        success: false,
        teams_deleted: 0,
        usedEdgeFunction: true,
        error: data.error.message ?? 'Ошибка Edge Function',
      }
    }

    return {
      success: true,
      teams_deleted: data?.data?.teams_deleted ?? teamIds.length,
      usedEdgeFunction: true,
    }
  } catch {
    return null
  }
}

async function deleteTeamsDirect(teamIds: string[]): Promise<DeleteTeamsResult> {
  if (teamIds.length === 0) {
    return { success: true, teams_deleted: 0, usedEdgeFunction: false }
  }

  const { data: teamRows, error: teamsReadError } = await supabase
    .from('teams')
    .select('id, team_name')
    .in('id', teamIds)

  if (teamsReadError) {
    return {
      success: false,
      teams_deleted: 0,
      usedEdgeFunction: false,
      error: teamsReadError.message,
    }
  }

  const teamNames = (teamRows ?? [])
    .map((t) => t.team_name)
    .filter((name): name is string => !!name)

  await supabase.from('message_reads').delete().in('team_id', teamIds)
  await supabase.from('message_recipients').delete().in('team_id', teamIds)
  await supabase.from('answers').delete().in('team_id', teamIds)

  if (teamNames.length > 0) {
    await supabase.from('players').delete().in('team_name', teamNames)
  }

  const { data: deletedRows, error: deleteError } = await supabase
    .from('teams')
    .delete()
    .in('id', teamIds)
    .select('id')

  if (deleteError) {
    return {
      success: false,
      teams_deleted: 0,
      usedEdgeFunction: false,
      error: deleteError.message,
    }
  }

  if (!deletedRows?.length) {
    return {
      success: false,
      teams_deleted: 0,
      usedEdgeFunction: false,
      error: 'Команды не удалены — проверьте вход через email (Supabase Auth)',
    }
  }

  return {
    success: true,
    teams_deleted: deletedRows.length,
    usedEdgeFunction: false,
  }
}

/** Удалить все команды игры (для «Начать с нуля»). */
export async function deleteAllTeamsForGame(
  gameId: string,
  knownTeamIds?: string[],
  afterProgressReset = false
): Promise<DeleteTeamsResult> {
  const teamIds =
    knownTeamIds ?? (await fetchAdminTeams(gameId)).map((t) => t.id)
  if (afterProgressReset) {
    return deleteTeamsAfterProgressReset(teamIds)
  }
  return deleteTeamsCompletely(teamIds, gameId)
}

/** Удаление команд: сначала прямой DELETE (быстро для админа), edge — запасной путь. */
export async function deleteTeamsCompletely(
  teamIds: string[],
  gameId: string
): Promise<DeleteTeamsResult> {
  const uniqueIds = [...new Set(teamIds.filter(Boolean))]
  if (uniqueIds.length === 0) {
    return { success: true, teams_deleted: 0, usedEdgeFunction: false }
  }

  const direct = await deleteTeamsDirect(uniqueIds)
  if (direct.success) {
    agentDebugLog('adminTeams.ts', 'delete direct ok', { count: direct.teams_deleted }, 'H17')
    return direct
  }

  agentDebugLog(
    'adminTeams.ts',
    'delete direct failed, try edge',
    { error: direct.error?.slice(0, 80) },
    'H17'
  )
  const edgeResult = await tryEdgeDeleteTeams(uniqueIds, gameId)
  if (edgeResult?.success) return edgeResult
  if (edgeResult && !edgeResult.success && edgeResult.usedEdgeFunction) return edgeResult

  return direct
}
