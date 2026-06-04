import { supabase } from './supabase'
import { mapQuestionsForPlay } from './prefetchGameQuestions'
import { setGamePlayCache } from './gamePlayCache'
let revalidateInFlight: Promise<{ game: Record<string, unknown>; questions: Record<string, unknown>[] } | null> | null =
  null
let revalidatePaused = false

/** Остановить фоновые games/questions — приоритет ответу игрока. */
export function pauseBackgroundRevalidate() {
  revalidatePaused = true
}

export async function revalidateGamePlayFromServer(gameCode: string) {
  if (revalidatePaused) return null
  const code = gameCode.trim().toUpperCase()
  if (revalidateInFlight) return revalidateInFlight

  revalidateInFlight = (async () => {
    if (revalidatePaused) return null
    const { data: gameData, error: gameError } = await supabase
      .from('games')
      .select('id, code, theme, per_question_time_sec, finish_page_type, scoring, mask_board, total_time_sec')
      .eq('code', code)
      .maybeSingle()

    if (gameError) throw gameError
    if (!gameData) return null

    const { data: questionsData, error: questionsError } = await supabase
      .from('questions')
      .select(
        'id, game_id, question_number, question_text, question_type, type, options, answer, answer_count, difficulty, points, hint_levels, hint_penalties, per_question_time_sec, media_url'
      )
      .eq('game_id', gameData.id)
      .order('question_number', { ascending: true })

    if (questionsError) throw questionsError

    const questions = questionsData ?? []
    setGamePlayCache(code, { game: gameData, questions })
    return { game: gameData, questions }
  })()

  try {
    return await revalidateInFlight
  } finally {
    revalidateInFlight = null
  }
}

export function mapRevalidatedQuestions(questions: Record<string, unknown>[]) {
  return mapQuestionsForPlay(questions)
}
