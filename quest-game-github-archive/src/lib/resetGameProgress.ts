import { supabase } from './supabase'
import { broadcastTeamsChanged } from './gameRealtime'

export type ResetGameProgressResult = {
  success: boolean
  teamsReset: number
  answersDeleted: number
  error?: string
}

/**
 * Сброс прогресса заезда: команды остаются, ответы и очки обнуляются.
 */
export async function resetGameProgress(gameId: string): Promise<ResetGameProgressResult> {
  const empty = { success: false, teamsReset: 0, answersDeleted: 0 }

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('game_id', gameId)

  if (teamsError) {
    return { ...empty, error: teamsError.message }
  }

  const teamIds = (teams ?? []).map((t) => t.id as string)
  let answersDeleted = 0

  if (teamIds.length > 0) {
    const { count: answersByTeam, error: answersError } = await supabase
      .from('answers')
      .delete({ count: 'exact' })
      .in('team_id', teamIds)

    if (answersError) {
      return { ...empty, error: answersError.message }
    }
    answersDeleted = answersByTeam ?? 0

    await supabase.from('message_reads').delete().in('team_id', teamIds)
    await supabase.from('message_recipients').delete().in('team_id', teamIds)
  }

  const { count: answersByGame, error: answersGameError } = await supabase
    .from('answers')
    .delete({ count: 'exact' })
    .eq('game_id', gameId)

  if (answersGameError) {
    return { ...empty, error: answersGameError.message }
  }
  answersDeleted = Math.max(answersDeleted, answersByGame ?? 0)

  const { error: scoresError } = await supabase
    .from('teams')
    .update({ total_score: 0 })
    .eq('game_id', gameId)

  if (scoresError) {
    return { ...empty, error: scoresError.message }
  }

  await supabase.from('team_scores').delete().eq('game_id', gameId)

  void broadcastTeamsChanged(gameId)

  return {
    success: true,
    teamsReset: teamIds.length,
    answersDeleted,
  }
}
