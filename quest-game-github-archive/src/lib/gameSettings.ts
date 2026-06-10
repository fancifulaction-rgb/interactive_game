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
  /** @deprecated Используйте show_total_elapsed / show_total_countdown; синхронизируется при сохранении */
  show_total_timer?: boolean
  /** @deprecated Используйте show_question_elapsed / show_question_countdown */
  show_question_timer?: boolean
  /** Показывать игрокам прошедшее общее время */
  show_total_elapsed?: boolean
  /** Показывать игрокам обратный отсчёт общего времени */
  show_total_countdown?: boolean
  /** Показывать игрокам прошедшее время на текущем вопросе */
  show_question_elapsed?: boolean
  /** Показывать игрокам обратный отсчёт на текущем вопросе */
  show_question_countdown?: boolean
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
  if (s.show_total_elapsed === false) result.show_total_elapsed = false
  if (s.show_total_countdown === false) result.show_total_countdown = false
  if (s.show_question_elapsed === false) result.show_question_elapsed = false
  if (s.show_question_countdown === false) result.show_question_countdown = false
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

function syncLegacyTimerFlags(merged: GameSettingsJson): GameSettingsJson {
  const totalVisible =
    merged.show_total_elapsed !== false || merged.show_total_countdown !== false
  const questionVisible =
    merged.show_question_elapsed !== false || merged.show_question_countdown !== false
  if (!totalVisible) merged.show_total_timer = false
  else delete merged.show_total_timer
  if (!questionVisible) merged.show_question_timer = false
  else delete merged.show_question_timer
  return merged
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
  const timerKeys: (keyof GameSettingsJson)[] = [
    'show_total_elapsed',
    'show_total_countdown',
    'show_question_elapsed',
    'show_question_countdown',
    'show_total_timer',
    'show_question_timer',
  ]
  if (timerKeys.some((k) => k in patch)) {
    return syncLegacyTimerFlags(merged)
  }
  return merged
}
