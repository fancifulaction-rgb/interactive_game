import { supabase } from './supabase'
import { agentDebugLog } from './debugLog'
import { mapQuestionsForPlay, fetchQuestionsFullForGame, QUESTION_DB_SELECT } from './prefetchGameQuestions'
import { getGamePlayCache, setGamePlayCache } from './gamePlayCache'
let revalidateInFlight: Promise<{ game: Record<string, unknown>; questions: Record<string, unknown>[] } | null> | null =
  null
let revalidatePaused = false

/** Остановить фоновые games/questions — приоритет ответу игрока. */
export function pauseBackgroundRevalidate() {
  revalidatePaused = true
}

export function resumeBackgroundRevalidate() {
  revalidatePaused = false
}

export function isBackgroundRevalidatePaused() {
  return revalidatePaused
}

async function revalidateGamePlayFromServerInner(gameCode: string) {
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
      .from('questions_player')
      .select(QUESTION_DB_SELECT)
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

/** Фоновая revalidate (редактор, устаревший кэш). */
export async function revalidateGamePlayFromServer(gameCode: string) {
  return revalidateGamePlayFromServerInner(gameCode)
}

/** Старт игры / выход из лобби — без enqueueCritical (HTTP-приоритет в supabase.ts). */
export function revalidateGamePlayCritical(gameCode: string) {
  revalidatePaused = false
  return revalidateGamePlayFromServerInner(gameCode)
}

/** Только questions — когда game уже в кэше (1 HTTP вместо games+questions). */
export async function revalidateQuestionsForGameCritical(
  gameId: string,
  gameCode: string,
  cachedGame?: Record<string, unknown> | null
) {
  revalidatePaused = false
  const code = gameCode.trim().toUpperCase()
  const game =
    cachedGame ?? getGamePlayCache(code)?.game ?? null
  if (!game || String(game.id) !== String(gameId)) {
    agentDebugLog(
      'revalidateGamePlay.ts',
      'questions-only fallback full revalidate',
      { gameId, hasGame: !!game },
      'H15'
    )
    return revalidateGamePlayFromServerInner(gameCode)
  }

  const started = Date.now()
  agentDebugLog(
    'revalidateGamePlay.ts',
    'questions-only start',
    { gameId, code },
    'H15'
  )

  const questions = await fetchQuestionsFullForGame(gameId)
  setGamePlayCache(code, { game, questions })
  agentDebugLog(
    'revalidateGamePlay.ts',
    'questions-only done',
    { gameId, count: questions.length, ms: Date.now() - started },
    'H15'
  )
  return { game, questions }
}

export function mapRevalidatedQuestions(questions: Record<string, unknown>[]) {
  return mapQuestionsForPlay(questions)
}
