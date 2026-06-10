import { supabase } from './supabase'
import { ensureAuthenticatedSessionForWrite } from './adminAuth'
import { debugLog } from './debugLog'
import { enqueueCritical } from './requestQueue'
import {
  questionGradingOverrideStorageValue,
  type QuestionGradingOverride,
} from './answerGradingConfig'

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
  grading_override?: QuestionGradingOverride | null
  is_hidden?: boolean
}

type QuestionNumberMeta = { question_number: number; order_index: number }

/** Видимым — 1..N; скрытым — order_index + 10000 (вне нумерации заезда). */
function assignQuestionNumbers(questions: QuestionSaveInput[]): QuestionNumberMeta[] {
  let visibleNum = 0
  return questions.map((q, index) => {
    const order_index = index + 1
    if (q.is_hidden) {
      return { question_number: order_index + 10000, order_index }
    }
    visibleNum += 1
    return { question_number: visibleNum, order_index }
  })
}

let lastStepAt = 0
let questionsSaveInFlight = false

function markStep(step: string, t0: number) {
  const now = Date.now()
  const totalMs = now - t0
  const stepMs = lastStepAt ? now - lastStepAt : totalMs
  lastStepAt = now
  // #region agent log
  debugLog('saveGameQuestions.ts', step, { totalMs, stepMs }, 'H8')
  // #endregion
  if (import.meta.env.DEV) {
    console.warn(`[quest-game] saveQuestions · ${step}: +${stepMs}ms (всего ${totalMs}ms)`)
  }
}

/** Удалить вопросы игры, которых нет в редакторе — без предварительного SELECT. */
async function deleteOrphanQuestions(gameId: string, keptIds: string[]): Promise<void> {
  let query = supabase.from('questions').delete().eq('game_id', gameId)
  if (keptIds.length > 0) {
    const inList = `(${keptIds.map((id) => `"${id}"`).join(',')})`
    query = query.not('id', 'in', inList)
  }
  const { error } = await query
  if (error) {
    throw new Error(`Не удалось удалить лишние вопросы: ${error.message}`)
  }
}

function buildRow(gameId: string, question: QuestionSaveInput, meta: QuestionNumberMeta) {
  let finalOptions = question.options ?? []
  let finalAnswer = question.answer ?? []

  if (question.answer_count > 1) {
    finalOptions = finalOptions.filter((opt) => opt && typeof opt === 'string' && opt.trim())
    finalAnswer = finalAnswer.filter((ans) => finalOptions.includes(ans))
  }

  const gradingOverride = questionGradingOverrideStorageValue(
    question.grading_override
  )

  return {
    game_id: gameId,
    question_number: meta.question_number,
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
    order_index: meta.order_index,
    is_hidden: Boolean(question.is_hidden),
    ...(gradingOverride ? { grading_override: gradingOverride } : { grading_override: null }),
  }
}

/**
 * 3–4 запроса вместо N последовательных UPDATE (раньше минуты при нескольких вопросах).
 */
export async function saveQuestionsForGame(
  gameId: string,
  questions: QuestionSaveInput[]
): Promise<QuestionSaveInput[]> {
  if (questionsSaveInFlight) {
    throw new Error('Сохранение вопросов уже выполняется — дождитесь завершения')
  }
  return enqueueCritical(async () => {
    questionsSaveInFlight = true
    lastStepAt = 0
    try {
      return await saveQuestionsForGameCore(gameId, questions)
    } finally {
      questionsSaveInFlight = false
    }
  })
}

async function saveQuestionsForGameCore(
  gameId: string,
  questions: QuestionSaveInput[]
): Promise<QuestionSaveInput[]> {
  const t0 = Date.now()

  await ensureAuthenticatedSessionForWrite()
  markStep('auth session', t0)

  const keptIds = questions.map((q) => q.id).filter((id): id is string => !!id)

  await deleteOrphanQuestions(gameId, keptIds)
  markStep(`delete orphans (keep ${keptIds.length})`, t0)

  const visibleWithPrompt = questions.filter((q) => !q.is_hidden && q.prompt?.trim())
  if (visibleWithPrompt.length === 0) {
    throw new Error('Должен остаться хотя бы один видимый вопрос с текстом')
  }

  const numbering = assignQuestionNumbers(questions)

  const upsertRows = questions
    .map((q, index) =>
      q.id ? { id: q.id, ...buildRow(gameId, q, numbering[index]) } : null
    )
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
    const rows = newOnes.map(({ q, index }) => buildRow(gameId, q, numbering[index]))
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
  return merged.map((q, index) => ({
    ...q,
    order_index: index + 1,
    is_hidden: Boolean(q.is_hidden),
  }))
}
