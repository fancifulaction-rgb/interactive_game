import { parseGameSettings } from './gameSettings'

export const DEFAULT_TOTAL_TIME_SEC = 1200
export const DEFAULT_QUESTION_TIME_SEC = 120

/** `0` в БД = без лимита */
export function isTotalTimeUnlimited(sec: number | null | undefined): boolean {
  return sec === 0
}

/** Вопрос с `per_question_time_sec === 0` переопределяет лимит игры */
export function isQuestionTimeUnlimited(
  gameSec: number | null | undefined,
  questionSec?: number | null
): boolean {
  return effectiveQuestionTimeSec(gameSec, questionSec) === null
}

export function effectiveQuestionTimeSec(
  gameSec: number | null | undefined,
  questionSec?: number | null
): number | null {
  if (questionSec === 0) return null
  if (questionSec != null && questionSec > 0) return questionSec
  if (gameSec === 0) return null
  if (gameSec != null && gameSec > 0) return gameSec
  return DEFAULT_QUESTION_TIME_SEC
}

export function normalizeTotalTimeSec(sec: number | null | undefined): number {
  if (sec === 0) return 0
  return sec ?? DEFAULT_TOTAL_TIME_SEC
}

export function normalizeQuestionTimeSec(sec: number | null | undefined): number {
  if (sec === 0) return 0
  return sec ?? DEFAULT_QUESTION_TIME_SEC
}

export function effectiveTotalTimeSec(sec: number | null | undefined): number | null {
  if (sec === 0) return null
  if (sec != null && sec > 0) return sec
  return DEFAULT_TOTAL_TIME_SEC
}

export function shouldShowTotalElapsed(rawSettings: unknown): boolean {
  const s = parseGameSettings(rawSettings)
  if (s.show_total_timer === false) return false
  return s.show_total_elapsed !== false
}

export function shouldShowTotalCountdown(rawSettings: unknown): boolean {
  const s = parseGameSettings(rawSettings)
  if (s.show_total_timer === false) return false
  return s.show_total_countdown !== false
}

export function shouldShowQuestionElapsed(rawSettings: unknown): boolean {
  const s = parseGameSettings(rawSettings)
  if (s.show_question_timer === false) return false
  return s.show_question_elapsed !== false
}

export function shouldShowQuestionCountdown(rawSettings: unknown): boolean {
  const s = parseGameSettings(rawSettings)
  if (s.show_question_timer === false) return false
  return s.show_question_countdown !== false
}

export function showTotalTimer(rawSettings: unknown): boolean {
  return shouldShowTotalElapsed(rawSettings) || shouldShowTotalCountdown(rawSettings)
}

export function showQuestionTimer(rawSettings: unknown): boolean {
  return shouldShowQuestionElapsed(rawSettings) || shouldShowQuestionCountdown(rawSettings)
}

export function formatTimeLimitLabel(sec: number | null | undefined): string {
  if (sec === 0) return 'без лимита'
  if (sec == null) return '—'
  if (sec >= 60 && sec % 60 === 0) return `${sec / 60} мин`
  return `${sec} сек`
}

export function formatCountdownMmSs(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
