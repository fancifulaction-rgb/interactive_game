import { supabase } from './supabase'
import { ensureAuthenticatedSession } from './adminAuth'
import { debugLog } from './debugLog'

export type QuestionSaveInput = {
  id?: string
  prompt: string
  type: string
  media_url: string | null
  answer: string[]
  options: string[]
  answer_count: number
  difficulty: string
  base_points: number
  hint_levels: string[]
  hint_penalties: number[]
  per_question_time_sec: number | null
}

function markStep(step: string, t0: number) {
  const ms = Date.now() - t0
  // #region agent log
  debugLog('saveGameQuestions.ts', step, { ms }, 'H8')
  // #endregion
  if (import.meta.env.DEV) {
    console.warn(`[quest-game] saveQuestions · ${step}: ${ms}ms`)
  }
}

function buildRow(gameId: string, question: QuestionSaveInput, index: number) {
  let finalOptions = question.options ?? []
  let finalAnswer = question.answer ?? []

  if (question.answer_count > 1) {
    finalOptions = finalOptions.filter((opt) => opt && typeof opt === 'string' && opt.trim())
    finalAnswer = finalAnswer.filter((ans) => finalOptions.includes(ans))
  }

  return {
    game_id: gameId,
    question_number: index + 1,
    question_type: question.type || 'text',
    type: question.type || 'text',
    question_text: question.prompt.trim(),
    media_url: question.media_url,
    answer: finalAnswer,
    options: finalOptions,
    answer_count: question.answer_count > 1 ? finalOptions.length : 1,
    difficulty: question.difficulty,
    points: question.base_points,
    hint_levels: question.hint_levels ?? [],
    hint_penalties: question.hint_penalties ?? [],
    per_question_time_sec: question.per_question_time_sec,
    order_index: index + 1,
  }
}

/**
 * 3–4 запроса вместо N последовательных UPDATE (раньше минуты при нескольких вопросах).
 */
export async function saveQuestionsForGame(
  gameId: string,
  questions: QuestionSaveInput[]
): Promise<QuestionSaveInput[]> {
  const t0 = Date.now()

  await ensureAuthenticatedSession()
  markStep('auth session', t0)

  const keptIds = questions.map((q) => q.id).filter((id): id is string => !!id)

  const { data: existingRows, error: existingError } = await supabase
    .from('questions')
    .select('id')
    .eq('game_id', gameId)

  if (existingError) {
    throw new Error(`Не удалось прочитать вопросы: ${existingError.message}`)
  }
  markStep('select ids', t0)

  const toDelete = (existingRows ?? [])
    .map((row) => row.id as string)
    .filter((id) => !keptIds.includes(id))

  if (toDelete.length) {
    const { error: deleteError } = await supabase.from('questions').delete().in('id', toDelete)
    if (deleteError) {
      throw new Error(`Не удалось удалить лишние вопросы: ${deleteError.message}`)
    }
  }
  markStep('delete orphans', t0)

  const upsertRows = questions
    .map((q, index) => (q.id ? { id: q.id, ...buildRow(gameId, q, index) } : null))
    .filter((row): row is ReturnType<typeof buildRow> & { id: string } => row !== null)

  if (upsertRows.length) {
    const { error: upsertError } = await supabase
      .from('questions')
      .upsert(upsertRows, { onConflict: 'id' })
    if (upsertError) throw upsertError
  }
  markStep(`upsert x${upsertRows.length}`, t0)

  const newOnes = questions
    .map((q, index) => ({ q, index }))
    .filter((item) => !item.q.id)

  let merged = [...questions]

  if (newOnes.length) {
    const rows = newOnes.map(({ q, index }) => buildRow(gameId, q, index))
    const { data: inserted, error: insertError } = await supabase
      .from('questions')
      .insert(rows)
      .select('id, question_number')

    if (insertError) throw insertError
    if (!inserted?.length) {
      throw new Error('Новые вопросы не сохранились в базе')
    }

    let insertOffset = 0
    merged = questions.map((q) => {
      if (q.id) return { ...q }
      const row = inserted[insertOffset++]
      return row ? { ...q, id: row.id as string } : q
    })
  }
  markStep(`insert x${newOnes.length}`, t0)

  markStep('done', t0)
  return merged.map((q, index) => ({ ...q, order_index: index + 1 }))
}
