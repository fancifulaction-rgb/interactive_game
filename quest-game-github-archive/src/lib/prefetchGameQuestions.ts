import { agentDebugLog } from './debugLog'
import { supabase } from './supabase'

/** Колонки таблицы questions в Supabase (без prompt/base_points — только в UI). */
export const QUESTION_DB_SELECT =
  'id, game_id, question_number, order_index, question_text, question_type, type, options, answer, answer_count, difficulty, points, hint_levels, hint_penalties, per_question_time_sec, media_url'

const questionsInFlight = new Map<string, Promise<Record<string, unknown>[]>>()

async function fetchQuestionsOnce(gameId: string): Promise<Record<string, unknown>[]> {
  const started = Date.now()
  agentDebugLog(
    'prefetchGameQuestions.ts',
    'prefetch start',
    { gameId },
    'H14'
  )
  const { data, error } = await supabase
    .from('questions')
    .select(QUESTION_DB_SELECT)
    .eq('game_id', gameId)
    .order('question_number', { ascending: true })

  if (error) {
    agentDebugLog(
      'prefetchGameQuestions.ts',
      'prefetch error',
      { gameId, ms: Date.now() - started, msg: error.message },
      'H14'
    )
    throw error
  }
  const rows = data ?? []
  agentDebugLog(
    'prefetchGameQuestions.ts',
    'prefetch done',
    { gameId, count: rows.length, ms: Date.now() - started },
    'H14'
  )
  return rows
}

/** Один in-flight GET questions на gameId — все экраны делят один запрос. */
export function prefetchQuestionsForGame(gameId: string): Promise<Record<string, unknown>[]> {
  const existing = questionsInFlight.get(gameId)
  if (existing) {
    agentDebugLog('prefetchGameQuestions.ts', 'prefetch dedupe', { gameId }, 'H14')
    return existing
  }
  const promise = fetchQuestionsOnce(gameId).finally(() => {
    questionsInFlight.delete(gameId)
  })
  questionsInFlight.set(gameId, promise)
  return promise
}

export function mapQuestionsForPlay(questionsData: Record<string, unknown>[]) {
  return questionsData.map((q) => ({
    ...q,
    order_index: q.question_number,
    prompt: q.question_text,
    base_points: q.points,
  }))
}
