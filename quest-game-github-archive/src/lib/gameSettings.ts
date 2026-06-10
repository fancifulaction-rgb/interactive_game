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
  /** Автофиниш сессии, когда все команды прошли квест */
  auto_finish_when_all_teams_done?: boolean
  /** IMP-LOG-022: режимы проверки ответов */
  answer_grading?: AnswerGradingConfig
  /** Показывать общий таймер игрокам */
  show_total_timer?: boolean
  /** Показывать таймер вопроса игрокам */
  show_question_timer?: boolean
}

export function parseGameSettings(raw: unknown): GameSettingsJson {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const s = raw as Record<string, unknown>
  const result: GameSettingsJson = {
    hide_scoreboard_until_finish: s.hide_scoreboard_until_finish === true,
    auto_finish_when_all_teams_done: s.auto_finish_when_all_teams_done === true,
  }
  if (s.show_total_timer === false) result.show_total_timer = false
  if (s.show_question_timer === false) result.show_question_timer = false
  if (s.answer_grading !== undefined) {
    result.answer_grading = parseAnswerGradingFromSettings(s)
  }
  return result
}

export function isScoreboardHiddenUntilFinish(raw: unknown): boolean {
  return parseGameSettings(raw).hide_scoreboard_until_finish === true
}

export function isAutoFinishWhenAllTeamsDone(raw: unknown): boolean {
  return parseGameSettings(raw).auto_finish_when_all_teams_done === true
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
