import { supabase } from './supabase'
import {
  clampGameAccessCodeLength,
  GAME_ACCESS_CODE_DEFAULT_LENGTH,
  GAME_ACCESS_CODE_SETTING_KEY,
} from './gameAccessCode'

let cachedDefaultLength = GAME_ACCESS_CODE_DEFAULT_LENGTH

export function getCachedGameAccessCodeDefaultLength(): number {
  return cachedDefaultLength
}

export async function fetchGameAccessCodeDefaultLength(): Promise<number> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', GAME_ACCESS_CODE_SETTING_KEY)
    .maybeSingle()

  if (error) throw error

  if (data?.value) {
    cachedDefaultLength = clampGameAccessCodeLength(Number.parseInt(data.value, 10))
  }

  return cachedDefaultLength
}

export async function saveGameAccessCodeDefaultLength(length: number): Promise<number> {
  const value = clampGameAccessCodeLength(length)

  const { error } = await supabase.from('settings').upsert(
    {
      key: GAME_ACCESS_CODE_SETTING_KEY,
      value: String(value),
      description: 'Длина автоматически создаваемых кодов игры (3–10 символов)',
      category: 'Общие',
    },
    { onConflict: 'key' }
  )

  if (error) throw error

  cachedDefaultLength = value
  return value
}
