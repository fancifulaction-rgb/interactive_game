import { describe, expect, it } from 'vitest'
import {
  extractCorrectAnswers,
  gradeUserAnswer,
  levenshteinDistance,
  normalizeAnswerToken,
} from './answerGrading'
import {
  ANSWER_GRADING_BASELINE,
  validateGradingRegex,
} from './answerGradingConfig'

describe('normalizeAnswerToken', () => {
  it('ignores case and punctuation when configured', () => {
    const cfg = {
      ...ANSWER_GRADING_BASELINE,
      normalize: {
        ...ANSWER_GRADING_BASELINE.normalize,
        ignore_punctuation: true,
        yo_to_e: true,
      },
      text_match: 'strict' as const,
    }
    expect(normalizeAnswerToken('  Москва!!! ', cfg)).toBe('москва')
    expect(normalizeAnswerToken('Ёлка', cfg)).toBe('елка')
  })
})

describe('gradeUserAnswer', () => {
  it('matches exact answers', () => {
    const result = gradeUserAnswer({
      answerCount: 1,
      correctAnswers: ['Москва'],
      userAnswers: ['москва'],
    })
    expect(result.isCorrect).toBe(true)
    expect(result.matchTier).toBe('exact')
  })

  it('applies fuzzy penalty', () => {
    const result = gradeUserAnswer({
      answerCount: 1,
      correctAnswers: ['кот'],
      userAnswers: ['котик'],
      grading: {
        ...ANSWER_GRADING_BASELINE,
        text_match: 'fuzzy',
        fuzzy: { max_distance_short: 2, short_word_max_len: 8, penalty_percent: 20 },
      },
    })
    expect(result.isCorrect).toBe(true)
    expect(result.matchTier).toBe('fuzzy')
    expect(result.scoreMultiplier).toBe(0.8)
  })

  it('matches regex grading', () => {
    const result = gradeUserAnswer({
      answerCount: 1,
      correctAnswers: ['ignored'],
      userAnswers: ['answer-42'],
      grading: {
        ...ANSWER_GRADING_BASELINE,
        text_match: 'regex',
        regex: { pattern: '^answer-\\d+$', flags: 'i' },
      },
    })
    expect(result.isCorrect).toBe(true)
  })

  it('matches keywords grading', () => {
    const result = gradeUserAnswer({
      answerCount: 1,
      correctAnswers: ['красная площадь москва'],
      userAnswers: ['москва красная'],
      grading: {
        ...ANSWER_GRADING_BASELINE,
        text_match: 'keywords',
        keywords: { min_match: 2 },
      },
    })
    expect(result.isCorrect).toBe(true)
  })
})

describe('levenshteinDistance', () => {
  it('returns edit distance', () => {
    expect(levenshteinDistance('кот', 'котик')).toBe(2)
    expect(extractCorrectAnswers(['A', 'B'])).toEqual(['a', 'b'])
  })
})

describe('validateGradingRegex', () => {
  it('accepts valid pattern and flags', () => {
    expect(validateGradingRegex('^answer-\\d+$', 'i')).toEqual({ ok: true })
  })

  it('rejects empty pattern', () => {
    expect(validateGradingRegex('  ').ok).toBe(false)
  })

  it('rejects invalid flags', () => {
    const result = validateGradingRegex('test', 'x')
    expect(result.ok).toBe(false)
    if (result.ok === false) expect(result.error).toMatch(/флаги/i)
  })

  it('rejects invalid syntax', () => {
    const result = validateGradingRegex('([unclosed')
    expect(result.ok).toBe(false)
  })
})
