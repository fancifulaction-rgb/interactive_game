import { supabase } from './supabase'
import { deleteGameStorageBestEffort } from './deleteGameStorage'
import { extractMediaUrlsFromAnswers } from './storagePaths'

export type DeleteGameResult = {
  success: boolean
  deleted: {
    game: number
    questions: number
    teams: number
    answers: number
    mediaFiles: number
  }
  usedEdgeFunction: boolean
  error?: string
}

const EDGE_DELETE_TIMEOUT_MS = 6000

async function tryEdgeDelete(gameId: string): Promise<DeleteGameResult | null> {
  try {
    const result = await Promise.race([
      supabase.functions.invoke('delete-game', { body: { gameId } }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('edge-timeout')), EDGE_DELETE_TIMEOUT_MS)
      ),
    ])

    const { data, error } = result
    if (!error && data?.success) {
      return {
        success: true,
        deleted: {
          game: data.deleted?.game ?? 1,
          questions: data.deleted?.questions ?? 0,
          teams: data.deleted?.teams ?? 0,
          answers: data.deleted?.answers ?? 0,
          mediaFiles: data.deleted?.mediaFiles ?? 0,
        },
        usedEdgeFunction: true,
      }
    }
  } catch {
    // Edge Function не развёрнута, таймаут или недоступна
  }
  return null
}

/** Удаление игры через Edge Function (если развёрнута) или напрямую из БД (CASCADE). */
export async function deleteGameCompletely(gameId: string): Promise<DeleteGameResult> {
  const empty = {
    game: 0,
    questions: 0,
    teams: 0,
    answers: 0,
    mediaFiles: 0,
  }

  const edgeResult = await tryEdgeDelete(gameId)
  if (edgeResult) return edgeResult

  const [questionsRes, teamsRes, questionsMediaRes, teamsMediaRes] = await Promise.all([
    supabase.from('questions').select('id', { count: 'exact', head: true }).eq('game_id', gameId),
    supabase.from('teams').select('id', { count: 'exact', head: true }).eq('game_id', gameId),
    supabase.from('questions').select('media_url').eq('game_id', gameId),
    supabase.from('teams').select('id, avatar_url').eq('game_id', gameId),
  ])

  const teamIds = (teamsMediaRes.data ?? []).map((t) => t.id)

  let answersCount = 0
  let answerMediaRows: { media_urls?: unknown; media_url?: string | null }[] = []
  if (teamIds.length > 0) {
    const [answersRes, answersMediaRes] = await Promise.all([
      supabase.from('answers').select('id', { count: 'exact', head: true }).in('team_id', teamIds),
      supabase.from('answers').select('media_urls').in('team_id', teamIds),
    ])
    answersCount = answersRes.count ?? 0
    answerMediaRows = answersMediaRes.data ?? []
  }

  const mediaUrls = [
    ...(questionsMediaRes.data ?? []).map((q) => q.media_url),
    ...(teamsMediaRes.data ?? []).map((t) => t.avatar_url),
    ...extractMediaUrlsFromAnswers(answerMediaRows),
  ]

  const { data: deletedRows, error: deleteError } = await supabase
    .from('games')
    .delete()
    .eq('id', gameId)
    .select('id')

  if (deleteError) {
    return {
      success: false,
      deleted: empty,
      usedEdgeFunction: false,
      error: deleteError.message,
    }
  }

  if (!deletedRows?.length) {
    return {
      success: false,
      deleted: empty,
      usedEdgeFunction: false,
      error: 'Игра не найдена или нет прав на удаление',
    }
  }

  // Очистка Storage в фоне — не блокируем UI
  void deleteGameStorageBestEffort(gameId, mediaUrls).catch((err) =>
    console.warn('Фоновая очистка Storage:', err)
  )

  return {
    success: true,
    deleted: {
      game: 1,
      questions: questionsRes.count ?? 0,
      teams: teamsRes.count ?? 0,
      answers: answersCount,
      mediaFiles: 0,
    },
    usedEdgeFunction: false,
  }
}
