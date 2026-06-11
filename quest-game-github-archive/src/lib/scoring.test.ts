import { describe, expect, it } from 'vitest'
import { calculateQuestionScore } from './scoring'

describe('calculateQuestionScore', () => {
  it('returns 0 for incorrect answers', () => {
    expect(
      calculateQuestionScore({
        basePoints: 100,
        difficulty: 'Средний',
        timeTaken: 5,
        maxTime: 30,
        hintsUsed: 0,
        hintPenalties: [],
        isCorrect: false,
      })
    ).toBe(0)
  })

  it('applies difficulty and time bonus for a correct fast answer', () => {
    const score = calculateQuestionScore({
      basePoints: 100,
      difficulty: 'Сложный',
      timeTaken: 3,
      maxTime: 30,
      hintsUsed: 0,
      hintPenalties: [],
      isCorrect: true,
      scoring: { k_diff: 1, k_time: 0.5, k_fast: 1.2 },
    })
    expect(score).toBeGreaterThan(100)
  })

  it('subtracts hint penalties', () => {
    const withoutHints = calculateQuestionScore({
      basePoints: 100,
      difficulty: 'Средний',
      timeTaken: 10,
      maxTime: 30,
      hintsUsed: 0,
      hintPenalties: [15, 25],
      isCorrect: true,
    })
    const withHints = calculateQuestionScore({
      basePoints: 100,
      difficulty: 'Средний',
      timeTaken: 10,
      maxTime: 30,
      hintsUsed: 2,
      hintPenalties: [15, 25],
      isCorrect: true,
    })
    expect(withHints).toBe(withoutHints - 40)
  })

  it('enforces minimum score of 1 for correct partial answers', () => {
    expect(
      calculateQuestionScore({
        basePoints: 100,
        difficulty: 'Легкий',
        timeTaken: 29,
        maxTime: 30,
        hintsUsed: 3,
        hintPenalties: [50, 50, 50],
        isCorrect: true,
        partialMultiplier: 0.01,
      })
    ).toBe(1)
  })
})
