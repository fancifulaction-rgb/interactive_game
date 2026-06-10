export type GameScoring = {
  p_base?: number
  k_diff?: number
  k_time?: number
  k_skip?: number
  k_fast?: number
  combo_bonus?: number
}

const DIFFICULTY_FACTOR: Record<string, number> = {
  Легкий: 0.85,
  Средний: 1,
  Сложный: 1.25,
  easy: 0.85,
  medium: 1,
  hard: 1.25,
}

/** Score_q ≈ P_base × K_diff × K_time − штрафы подсказок (из настроек игры). */
export function calculateQuestionScore(params: {
  scoring?: GameScoring | null
  basePoints: number
  difficulty: string
  timeTaken: number
  maxTime: number
  hintsUsed: number
  hintPenalties: number[]
  isCorrect: boolean
  partialMultiplier?: number
}): number {
  if (!params.isCorrect) return 0

  const partial = params.partialMultiplier ?? 1
  if (partial <= 0) return 0

  const s = params.scoring ?? {}
  const pBase = params.basePoints || s.p_base || 100
  const kDiff = (s.k_diff ?? 1) * (DIFFICULTY_FACTOR[params.difficulty] ?? 1)

  const safeMax = params.maxTime <= 0 ? 1 : Math.max(1, params.maxTime)
  const timeLeftRatio =
    params.maxTime <= 0
      ? 1
      : Math.max(0, Math.min(1, (safeMax - params.timeTaken) / safeMax))
  const kTime = 1 + (s.k_time ?? 0.5) * timeLeftRatio
  const kFast = timeLeftRatio >= 0.7 ? (s.k_fast ?? 1) : 1

  let score = pBase * kDiff * kTime * kFast

  for (let i = 0; i < params.hintsUsed && i < params.hintPenalties.length; i++) {
    score -= params.hintPenalties[i] ?? 0
  }

  score = Math.round(score * partial)
  return Math.max(1, score)
}
