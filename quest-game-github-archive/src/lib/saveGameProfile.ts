import { supabase } from './supabase'
import {
  assertGameAccessCodeAvailable,
  normalizeGameAccessCode,
  gameAccessCodeValidationMessage,
} from './gameAccessCode'
import { mergeGameSettings, parseGameSettings } from './gameSettings'
import { enqueueCritical } from './requestQueue'

export type GameProfileDraft = {
  title: string
  code: string
  theme: string
  finish_page_type: string
  mask_board: boolean
  hide_scoreboard_until_finish: boolean
}

export const GAME_PROFILE_SELECT =
  'id, title, code, theme, finish_page_type, mask_board, settings'

export const GAME_THEME_OPTIONS = [
  { value: 'default', label: 'Стандартная' },
  { value: 'new-year', label: 'Новый год' },
  { value: 'feb-23', label: '23 февраля' },
  { value: 'march-8', label: '8 марта' },
  { value: 'easter', label: 'Пасха' },
  { value: 'wedding', label: 'Свадьба' },
  { value: 'corporate', label: 'Корпоратив' },
] as const

export const GAME_FINISH_PAGE_OPTIONS = [
  { value: 'congratulation', label: 'Поздравление (только текст)' },
  { value: 'congratulation_stats', label: 'Поздравление + статистика игрока' },
  { value: 'scoreboard', label: 'Переход к табло результатов' },
] as const

export function gameProfileFromRow(row: {
  title?: string | null
  code?: string | null
  theme?: string | null
  finish_page_type?: string | null
  mask_board?: boolean | null
  settings?: unknown
}): GameProfileDraft {
  return {
    title: row.title || '',
    code: row.code || '',
    theme: row.theme || 'default',
    finish_page_type: row.finish_page_type || 'scoreboard',
    mask_board: !!row.mask_board,
    hide_scoreboard_until_finish: parseGameSettings(row.settings)
      .hide_scoreboard_until_finish,
  }
}

export async function saveGameProfile(
  gameId: string,
  draft: GameProfileDraft,
  existingSettings?: unknown
): Promise<void> {
  const code = normalizeGameAccessCode(draft.code)
  const codeError = gameAccessCodeValidationMessage(code)
  if (codeError) {
    throw new Error(codeError)
  }

  await assertGameAccessCodeAvailable(code, gameId)

  const { error } = await enqueueCritical(async () =>
    supabase
      .from('games')
      .update({
        title: draft.title.trim() || '',
        code,
        theme: draft.theme || 'default',
        finish_page_type: draft.finish_page_type || 'scoreboard',
        mask_board: draft.mask_board,
        settings: mergeGameSettings(existingSettings, {
          hide_scoreboard_until_finish: draft.hide_scoreboard_until_finish,
        }),
      })
      .eq('id', gameId)
  )

  if (error) throw error
}
