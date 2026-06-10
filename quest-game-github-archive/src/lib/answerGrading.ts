import {
  type AnswerGradingConfig,
  ANSWER_GRADING_BASELINE,
} from './answerGradingConfig'

const PUNCTUATION_RE = /[^a-zа-яё0-9\s]/g

/** Нормализация одного токена (порядок как в SQL / ANSWER_GRADING.md §7.2). */
export function normalizeAnswerToken(
  text: string,
  cfg: AnswerGradingConfig = ANSWER_GRADING_BASELINE
): string {
  let v = String(text ?? '').trim()
  if (cfg.normalize.collapse_whitespace) {
    v = v.replace(/\s+/g, ' ')
  }
  if (cfg.normalize.ignore_case) {
    v = v.toLowerCase()
  }
  if (cfg.normalize.ignore_punctuation) {
    v = v.replace(PUNCTUATION_RE, '').replace(/\s+/g, ' ').trim()
  }
  if (cfg.normalize.yo_to_e) {
    v = v.replace(/ё/g, 'е')
  }
  return v
}

function flattenAnswerJson(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0])) {
    return (raw[0] as unknown[]).map((a) => String(a ?? ''))
  }
  if (Array.isArray(raw)) {
    return raw.map((a) => String(a ?? ''))
  }
  return [String(raw)]
}

/** Нормализация правильных ответов из JSONB (совместимость со старыми форматами). */
export function extractCorrectAnswers(
  raw: unknown,
  cfg: AnswerGradingConfig = ANSWER_GRADING_BASELINE
): string[] {
  return flattenAnswerJson(raw)
    .map((a) => normalizeAnswerToken(a, cfg))
    .filter(Boolean)
}

export function normalizeUserAnswers(
  answers: string[],
  cfg: AnswerGradingConfig = ANSWER_GRADING_BASELINE
): string[] {
  return answers.map((a) => normalizeAnswerToken(a, cfg)).filter(Boolean)
}

export function levenshteinDistance(a: string, b: string): number {
  const lenA = a.length
  const lenB = b.length
  if (lenA === 0) return lenB
  if (lenB === 0) return lenA

  const prev = new Array<number>(lenB + 1)
  const curr = new Array<number>(lenB + 1)

  for (let j = 0; j <= lenB; j++) prev[j] = j

  for (let i = 1; i <= lenA; i++) {
    curr[0] = i
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= lenB; j++) prev[j] = curr[j]
  }
  return prev[lenB]
}

function wordsMatch(
  expected: string,
  actual: string,
  cfg: AnswerGradingConfig
): boolean {
  if (expected === actual) return true
  const fuzzy = cfg.fuzzy ?? ANSWER_GRADING_BASELINE.fuzzy!
  const maxLen = fuzzy.short_word_max_len
  if (expected.length > maxLen || actual.length > maxLen) return false
  return levenshteinDistance(expected, actual) <= fuzzy.max_distance_short
}

export type MatchTier = 'exact' | 'fuzzy' | 'partial_mcq' | 'none'

export type GradeResult = {
  isCorrect: boolean
  scoreMultiplier: number
  matchTier: MatchTier
}

function extractAnswerNumber(text: string): number | null {
  const m = String(text ?? '').match(/[-+]?[0-9]+(?:[.,][0-9]+)?/)
  if (!m?.[0]) return null
  const n = Number(m[0].replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function gradeTextSingle(
  correct: string[],
  user: string[],
  cfg: AnswerGradingConfig
): GradeResult {
  const text = user[0] ?? ''
  if (!text || correct.length === 0) {
    return { isCorrect: false, scoreMultiplier: 0, matchTier: 'none' }
  }

  if (correct.includes(text)) {
    return { isCorrect: true, scoreMultiplier: 1, matchTier: 'exact' }
  }

  if (cfg.text_match === 'keywords') {
    const userWords = text.split(/\s+/).filter(Boolean)
    const minMatch = Math.max(1, cfg.keywords?.min_match ?? 1)

    for (const key of correct) {
      const keyWords = key.split(/\s+/).filter(Boolean)
      if (keyWords.length === 0) continue
      let hits = 0
      for (const word of keyWords) {
        if (userWords.includes(word)) hits++
      }
      if (hits >= Math.min(minMatch, keyWords.length)) {
        return { isCorrect: true, scoreMultiplier: 1, matchTier: 'exact' }
      }
    }
    return { isCorrect: false, scoreMultiplier: 0, matchTier: 'none' }
  }

  if (cfg.text_match === 'numeric') {
    const tol = cfg.numeric?.tolerance_percent ?? 0
    const userNum = extractAnswerNumber(text)
    if (userNum === null) {
      return { isCorrect: false, scoreMultiplier: 0, matchTier: 'none' }
    }

    for (const key of correct) {
      const keyNum = extractAnswerNumber(key)
      if (keyNum === null) continue
      if (keyNum === 0) {
        if (userNum === 0) {
          return { isCorrect: true, scoreMultiplier: 1, matchTier: 'exact' }
        }
      } else if ((Math.abs(userNum - keyNum) / Math.abs(keyNum)) * 100 <= tol) {
        return { isCorrect: true, scoreMultiplier: 1, matchTier: 'exact' }
      }
    }
    return { isCorrect: false, scoreMultiplier: 0, matchTier: 'none' }
  }

  if (cfg.text_match !== 'fuzzy') {
    return { isCorrect: false, scoreMultiplier: 0, matchTier: 'none' }
  }

  const userWords = text.split(/\s+/).filter(Boolean)
  const penalty = cfg.fuzzy?.penalty_percent ?? 15
  const fuzzyMultiplier = Math.max(0, Math.min(1, 1 - penalty / 100))

  for (const key of correct) {
    const keyWords = key.split(/\s+/).filter(Boolean)
    if (keyWords.length !== userWords.length) continue

    let allMatch = true
    for (let i = 0; i < keyWords.length; i++) {
      if (!wordsMatch(keyWords[i], userWords[i], cfg)) {
        allMatch = false
        break
      }
    }
    if (allMatch) {
      return { isCorrect: true, scoreMultiplier: fuzzyMultiplier, matchTier: 'fuzzy' }
    }
  }

  return { isCorrect: false, scoreMultiplier: 0, matchTier: 'none' }
}

/** Та же логика, что на сервере (RPC submit_auto_answer). */
export function gradeUserAnswer(params: {
  answerCount: number
  correctAnswers: unknown
  userAnswers: string[]
  grading?: AnswerGradingConfig
}): GradeResult {
  const cfg = params.grading ?? ANSWER_GRADING_BASELINE
  const correct = extractCorrectAnswers(params.correctAnswers, cfg)
  const user = normalizeUserAnswers(params.userAnswers, cfg)

  if (params.answerCount === 1) {
    return gradeTextSingle(correct, user, cfg)
  }

  const correctSet = new Set(correct)
  const allCorrect = user.every((ans) => correctSet.has(ans))
  const correctCount = user.filter((ans) => correctSet.has(ans)).length
  const totalCorrect = correct.length
  const partialCredit = cfg.mcq.partial_credit

  if (!partialCredit) {
    if (allCorrect && correctCount === totalCorrect && totalCorrect > 0) {
      return { isCorrect: true, scoreMultiplier: 1, matchTier: 'exact' }
    }
    return { isCorrect: false, scoreMultiplier: 0, matchTier: 'none' }
  }

  if (allCorrect && correctCount === totalCorrect) {
    return { isCorrect: true, scoreMultiplier: 1, matchTier: 'exact' }
  }
  if (correctCount > 0 && allCorrect) {
    return { isCorrect: true, scoreMultiplier: 0.5, matchTier: 'partial_mcq' }
  }
  if (correctCount > 0) {
    return { isCorrect: true, scoreMultiplier: 0.3, matchTier: 'partial_mcq' }
  }
  return { isCorrect: false, scoreMultiplier: 0, matchTier: 'none' }
}
