import { supabase } from './supabase'
import { generateGameAccessCode } from './gameAccessCode'
import { fetchGameAccessCodeDefaultLength } from './gameAccessCodeSettings'
import { enqueueCritical } from './requestQueue'

const DEFAULT_SCORING = {
  p_base: 100,
  k_diff: 1.0,
  k_time: 0.5,
  k_skip: 0.8,
  k_fast: 1.2,
  combo_bonus: 10,
}

export type CreatedGameRow = {
  id: string
  title: string
  code: string | null
  theme: string
  mask_board: boolean
  total_time_sec: number
  per_question_time_sec: number
  created_at: string
  scoring: unknown
}

export async function createNewGame(title = 'Новая игра'): Promise<CreatedGameRow> {
  const base = {
    title,
    theme: 'new-year',
    mask_board: false,
    total_time_sec: 1800,
    per_question_time_sec: 120,
    scoring: DEFAULT_SCORING,
  }

  let lastError: Error | null = null
  const codeLength = await fetchGameAccessCodeDefaultLength()

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateGameAccessCode(codeLength)
    const { data, error } = await supabase
      .from('games')
      .insert({ ...base, code })
      .select('id, title, code, theme, mask_board, total_time_sec, per_question_time_sec, created_at, scoring')
      .maybeSingle()

    if (!error && data) {
      await enqueueCritical(async () => {
        const { error: stateError } = await supabase.from('game_state').insert({
          game_id: data.id,
          current_state: 'closed',
          is_paused: false,
        })
        if (stateError) {
          await supabase.from('games').delete().eq('id', data.id)
          throw new Error(`Не удалось создать состояние игры: ${stateError.message}`)
        }
      })
      return data as CreatedGameRow
    }

    if (error?.code === '23505') {
      lastError = new Error(error.message)
      continue
    }

    throw new Error(error?.message ?? 'Не удалось создать игру')
  }

  throw lastError ?? new Error('Не удалось подобрать уникальный код игры')
}
