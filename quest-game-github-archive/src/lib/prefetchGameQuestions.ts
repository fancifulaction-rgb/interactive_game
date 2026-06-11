import { agentDebugLog } from './debugLog'
import { supabase } from './supabase'
import { hintsForPlay, mediaItemsForPlay } from './questionMediaTypes'

/** Полный select для админки / таблицы questions (с эталоном answer). */
export const QUESTION_DB_SELECT =
  'id, game_id, question_number, order_index, question_text, question_type, type, options, answer, answer_count, difficulty, points, hint_levels, hint_penalties, per_question_time_sec, media_url, media_items, hints, grading_override, is_hidden'

/** Лёгкий select для лобби — таблица questions. */
export const QUESTION_LOBBY_SELECT =
  'id, game_id, question_number, order_index, question_text, question_type, type, options, answer, answer_count, difficulty, points, per_question_time_sec'

/** Игрок: view questions_player без поля answer (IMP-SEC-009). */
export const QUESTION_PLAYER_SELECT =
  'id, game_id, question_number, order_index, question_text, question_type, type, options, answer_count, difficulty, points, hint_levels, hint_penalties, per_question_time_sec, media_url, media_items, hints'

export const QUESTION_PLAYER_LOBBY_SELECT =
  'id, game_id, question_number, order_index, question_text, question_type, type, options, answer_count, difficulty, points, per_question_time_sec'

const questionsInFlight = new Map<string, Promise<Record<string, unknown>[]>>()

async function fetchQuestionsOnce(
  gameId: string,
  select: string,
  label: string
): Promise<Record<string, unknown>[]> {
  const started = Date.now()
  agentDebugLog('prefetchGameQuestions.ts', `${label} start`, { gameId }, 'H14')
  const { data, error } = await supabase
    .from('questions_player')
    .select(select)
    .eq('game_id', gameId)
    .order('question_number', { ascending: true })

  if (error) {
    agentDebugLog(
      'prefetchGameQuestions.ts',
      `${label} error`,
      { gameId, ms: Date.now() - started, msg: error.message },
      'H14'
    )
    throw error
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  agentDebugLog(
    'prefetchGameQuestions.ts',
    `${label} done`,
    { gameId, count: rows.length, ms: Date.now() - started },
    'H14'
  )
  return rows
}

function runDeduped(
  inflightKey: string,
  task: () => Promise<Record<string, unknown>[]>
): Promise<Record<string, unknown>[]> {
  const existing = questionsInFlight.get(inflightKey)
  if (existing) {
    agentDebugLog('prefetchGameQuestions.ts', 'prefetch dedupe', { gameId: inflightKey }, 'H14')
    return existing
  }
  const promise = task().finally(() => {
    questionsInFlight.delete(inflightKey)
  })
  questionsInFlight.set(inflightKey, promise)
  return promise
}

/** Количество сохранённых вопросов (таблица questions, для админки). */
export async function countQuestionsForGame(gameId: string): Promise<number> {
  const { count, error } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)
  if (error) throw error
  return count ?? 0
}

/** Лёгкий prefetch для лобби и регистрации. */
export function prefetchQuestionsForGame(gameId: string): Promise<Record<string, unknown>[]> {
  return runDeduped(`${gameId}:lobby`, () =>
    fetchQuestionsOnce(gameId, QUESTION_PLAYER_LOBBY_SELECT, 'prefetch lobby')
  )
}

/** Полный fetch перед стартом игры (подсказки, media_url). */
export function fetchQuestionsFullForGame(gameId: string): Promise<Record<string, unknown>[]> {
  return runDeduped(`${gameId}:full`, () =>
    fetchQuestionsOnce(gameId, QUESTION_PLAYER_SELECT, 'prefetch full')
  )
}

export function mapQuestionsForPlay(questionsData: Record<string, unknown>[]) {
  return questionsData.map((q) => {
    const media_items = mediaItemsForPlay(q)
    const hints = hintsForPlay(q)
    const hint_levels = hints.map((h) => h.text)
    const hint_penalties = hints.map((h) => h.penalty)
    return {
      ...q,
      order_index: q.question_number,
      prompt: q.question_text,
      base_points: q.points,
      media_items,
      hints,
      hint_levels,
      hint_penalties,
      media_url: media_items[0]?.url ?? (q.media_url as string | null) ?? null,
      type: media_items[0]?.kind ?? (q.type as string) ?? 'text',
    }
  })
}
