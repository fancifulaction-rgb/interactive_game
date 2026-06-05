import { supabase } from './supabase'

export type AiQuestionProvider = 'groq' | 'qwen' | 'deepseek'

export type GeneratedQuestionDraft = {
  order_index: number
  type: string
  prompt: string
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

export type GenerateQuestionsParams = {
  topic: string
  count: number
  provider: AiQuestionProvider
  difficulty?: string
}

export async function generateQuestionsWithAi(
  params: GenerateQuestionsParams
): Promise<GeneratedQuestionDraft[]> {
  const topic = params.topic.trim()
  if (!topic) {
    throw new Error('Укажите тему для генерации')
  }

  const count = Math.min(15, Math.max(1, params.count || 5))

  const { data, error } = await supabase.functions.invoke('generate-questions', {
    body: {
      topic,
      count,
      provider: params.provider,
      difficulty: params.difficulty ?? 'Средний',
      language: 'ru',
    },
  })

  if (error) {
    throw new Error(error.message || 'Ошибка вызова generate-questions')
  }

  const errMsg =
    typeof data?.error === 'string'
      ? data.error
      : typeof data?.error === 'object' && data.error?.message
        ? String(data.error.message)
        : null

  if (errMsg || data?.success === false) {
    throw new Error(errMsg || 'Генерация не удалась')
  }

  const list = data?.questions
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Сервис вернул пустой список вопросов')
  }

  return list as GeneratedQuestionDraft[]
}
