/** Поля в колонке games.settings (JSONB). */
export type GameSettingsJson = {
  /** IMP-UX-005: игроки не видят табло до статуса finished */
  hide_scoreboard_until_finish?: boolean
}

export function parseGameSettings(raw: unknown): GameSettingsJson {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const s = raw as Record<string, unknown>
  return {
    hide_scoreboard_until_finish: s.hide_scoreboard_until_finish === true,
  }
}

export function isScoreboardHiddenUntilFinish(raw: unknown): boolean {
  return parseGameSettings(raw).hide_scoreboard_until_finish === true
}

export function mergeGameSettings(
  raw: unknown,
  patch: Partial<GameSettingsJson>
): GameSettingsJson {
  const current = parseGameSettings(raw)
  return { ...current, ...patch }
}
