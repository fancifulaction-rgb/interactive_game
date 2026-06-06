/** Преобразует JSONB answer из answers в строку для табло и экспорта. */
export function answerJsonToDisplayText(answer: unknown): string {
  if (answer == null) return ''
  if (typeof answer === 'string') return answer
  if (Array.isArray(answer)) {
    return answer.map((v) => String(v)).filter((v) => v.length > 0).join(', ')
  }
  if (typeof answer === 'object') {
    try {
      return JSON.stringify(answer)
    } catch {
      return ''
    }
  }
  return String(answer)
}
