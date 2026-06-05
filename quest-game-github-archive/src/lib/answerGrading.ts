/** Нормализация правильных ответов из JSONB (совместимость со старыми форматами). */
export function extractCorrectAnswers(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0])) {
    return (raw[0] as unknown[])
      .map((a) => String(a ?? '').toLowerCase().trim())
      .filter(Boolean)
  }
  if (Array.isArray(raw)) {
    return raw.map((a) => String(a ?? '').toLowerCase().trim()).filter(Boolean)
  }
  return [String(raw).toLowerCase().trim()].filter(Boolean)
}

export function normalizeUserAnswers(answers: string[]): string[] {
  return answers.map((a) => a.toLowerCase().trim()).filter(Boolean)
}

export type GradeResult = {
  isCorrect: boolean
  scoreMultiplier: number
}

/** Та же логика, что на сервере (RPC submit_auto_answer). */
export function gradeUserAnswer(params: {
  answerCount: number
  correctAnswers: unknown
  userAnswers: string[]
}): GradeResult {
  const correct = extractCorrectAnswers(params.correctAnswers)
  const user = normalizeUserAnswers(params.userAnswers)

  if (params.answerCount === 1) {
    const text = user[0] ?? ''
    const isCorrect = correct.includes(text)
    return { isCorrect, scoreMultiplier: isCorrect ? 1 : 0 }
  }

  const correctSet = new Set(correct)
  const allCorrect = user.every((ans) => correctSet.has(ans))
  const correctCount = user.filter((ans) => correctSet.has(ans)).length
  const totalCorrect = correct.length

  if (allCorrect && correctCount === totalCorrect) {
    return { isCorrect: true, scoreMultiplier: 1 }
  }
  if (correctCount > 0 && allCorrect) {
    return { isCorrect: true, scoreMultiplier: 0.5 }
  }
  if (correctCount > 0) {
    return { isCorrect: true, scoreMultiplier: 0.3 }
  }
  return { isCorrect: false, scoreMultiplier: 0 }
}
