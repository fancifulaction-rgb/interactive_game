import { supabase } from './supabase'
import {
  assertGameAccessCodeAvailable,
  gameAccessCodeValidationMessage,
  normalizeGameAccessCode,
} from './gameAccessCode'
import { QUESTION_DB_SELECT } from './prefetchGameQuestions'

export type CloneGameInput = {
  sourceGameId: string
  title: string
  code: string
}

export type ClonedGame = {
  id: string
  title: string
  code: string
  theme: string
}

type SourceGameRow = {
  id: string
  title: string
  code: string | null
  theme: string | null
  password: string | null
  settings: unknown
  mask_board: boolean | null
  total_time_sec: number | null
  per_question_time_sec: number | null
  scoring: unknown
  finish_page_type: string | null
}

function stripQuestionForClone(q: Record<string, unknown>, newGameId: string) {
  const {
    id: _id,
    game_id: _gameId,
    created_at: _createdAt,
    ...rest
  } = q
  return {
    ...rest,
    game_id: newGameId,
  }
}

export async function cloneGame(input: CloneGameInput): Promise<ClonedGame> {
  const title = input.title.trim()
  const code = normalizeGameAccessCode(input.code)

  if (!title) {
    throw new Error('Укажите название игры')
  }
  const codeError = gameAccessCodeValidationMessage(code)
  if (codeError) {
    throw new Error(codeError)
  }

  await assertGameAccessCodeAvailable(code)

  const { data: source, error: sourceErr } = await supabase
    .from('games')
    .select(
      'id, title, code, theme, password, settings, mask_board, total_time_sec, per_question_time_sec, scoring, finish_page_type'
    )
    .eq('id', input.sourceGameId)
    .maybeSingle()

  if (sourceErr) throw sourceErr
  if (!source) {
    throw new Error('Исходная игра не найдена')
  }

  const src = source as SourceGameRow
  const theme = src.theme?.trim() || 'default'

  const { data: newGame, error: insertErr } = await supabase
    .from('games')
    .insert({
      title,
      code,
      theme,
      password: null,
      settings: src.settings ?? {},
      mask_board: src.mask_board ?? false,
      total_time_sec: src.total_time_sec ?? 1800,
      per_question_time_sec: src.per_question_time_sec ?? 120,
      scoring: src.scoring ?? {
        p_base: 100,
        k_diff: 1.0,
        k_time: 0.5,
        k_skip: 0.8,
        k_fast: 1.2,
        combo_bonus: 10,
      },
      finish_page_type: src.finish_page_type ?? 'scoreboard',
    })
    .select('id, title, code, theme')
    .maybeSingle()

  if (insertErr) throw insertErr
  if (!newGame) {
    throw new Error('Не удалось создать копию игры')
  }

  const { error: stateErr } = await supabase.from('game_state').insert({
    game_id: newGame.id,
    current_state: 'closed',
    is_paused: false,
  })
  if (stateErr) {
    console.warn('game_state при клонировании:', stateErr.message)
  }

  const { data: questions, error: qErr } = await supabase
    .from('questions')
    .select(QUESTION_DB_SELECT)
    .eq('game_id', input.sourceGameId)
    .order('question_number', { ascending: true })

  if (qErr) throw qErr

  if (questions?.length) {
    const rows = questions.map((q) => stripQuestionForClone(q as Record<string, unknown>, newGame.id))
    const { error: qInsErr } = await supabase.from('questions').insert(rows)
    if (qInsErr) {
      await supabase.from('games').delete().eq('id', newGame.id)
      throw new Error(`Вопросы не скопировались: ${qInsErr.message}`)
    }
  }

  return newGame as ClonedGame
}
