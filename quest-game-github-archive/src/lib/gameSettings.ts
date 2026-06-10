import {
  type AnswerGradingConfig,
  parseAnswerGradingFromSettings,
} from './answerGradingConfig'

export type { AnswerGradingConfig } from './answerGradingConfig'
export {
  ANSWER_GRADING_BASELINE,
  ANSWER_GRADING_PRESETS,
  detectAnswerGradingPreset,
  parseAnswerGrading,
  parseAnswerGradingFromSettings,
  presetAnswerGrading,
  resolveAnswerGrading,
} from './answerGradingConfig'

/** Поля в колонке games.settings (JSONB). */
export type GameSettingsJson = {
  /** IMP-UX-005: игроки не видят табло до статуса finished */
  hide_scoreboard_until_finish?: boolean
  /** IMP-LOG-022: режимы проверки ответов */
  answer_grading?: AnswerGradingConfig
}

export function parseGameSettings(raw: unknown): GameSettingsJson {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const s = raw as Record<string, unknown>
  const result: GameSettingsJson = {
    hide_scoreboard_until_finish: s.hide_scoreboard_until_finish === true,
  }
  if (s.answer_grading !== undefined) {
    result.answer_grading = parseAnswerGradingFromSettings(s)
  }
  return result
}

export function isScoreboardHiddenUntilFinish(raw: unknown): boolean {
  return parseGameSettings(raw).hide_scoreboard_until_finish === true
}

export function mergeGameSettings(
  raw: unknown,
  patch: Partial<GameSettingsJson>
): GameSettingsJson {
  const current = parseGameSettings(raw)
  const merged: GameSettingsJson = { ...current, ...patch }
  if ('answer_grading' in patch && patch.answer_grading === undefined) {
    delete merged.answer_grading
  }
  return merged
}
