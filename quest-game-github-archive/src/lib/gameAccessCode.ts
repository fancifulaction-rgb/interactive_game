import { supabase } from './supabase'

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export const GAME_ACCESS_CODE_MIN = 3
export const GAME_ACCESS_CODE_MAX = 10
export const GAME_ACCESS_CODE_DEFAULT_LENGTH = 6
export const GAME_ACCESS_CODE_SETTING_KEY = 'game_access_code_length'

export function clampGameAccessCodeLength(value: number): number {
  if (!Number.isFinite(value)) return GAME_ACCESS_CODE_DEFAULT_LENGTH
  return Math.min(GAME_ACCESS_CODE_MAX, Math.max(GAME_ACCESS_CODE_MIN, Math.round(value)))
}

export function gameAccessCodeRangeLabel(): string {
  return `${GAME_ACCESS_CODE_MIN}–${GAME_ACCESS_CODE_MAX}`
}

export function normalizeGameAccessCode(
  raw: string,
  maxLength: number = GAME_ACCESS_CODE_MAX
): string {
  const limit = clampGameAccessCodeLength(maxLength)
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, limit)
}

export function isValidGameAccessCode(code: string): boolean {
  const normalized = normalizeGameAccessCode(code)
  if (normalized !== code) return false
  return (
    normalized.length >= GAME_ACCESS_CODE_MIN &&
    normalized.length <= GAME_ACCESS_CODE_MAX &&
    /^[A-Z0-9]+$/.test(normalized)
  )
}

export function gameAccessCodeValidationMessage(code: string): string | null {
  const normalized = normalizeGameAccessCode(code)
  if (!normalized) {
    return `Укажите код доступа (${gameAccessCodeRangeLabel()} латинских букв или цифр)`
  }
  if (normalized.length < GAME_ACCESS_CODE_MIN) {
    return `Код слишком короткий: минимум ${GAME_ACCESS_CODE_MIN} символа`
  }
  if (normalized.length > GAME_ACCESS_CODE_MAX) {
    return `Код слишком длинный: максимум ${GAME_ACCESS_CODE_MAX} символов`
  }
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    return 'Код может содержать только латинские буквы A–Z и цифры 0–9'
  }
  return null
}

export function generateGameAccessCode(length: number = GAME_ACCESS_CODE_DEFAULT_LENGTH): string {
  const size = clampGameAccessCodeLength(length)
  let result = ''
  for (let i = 0; i < size; i++) {
    result += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length))
  }
  return result
}

export async function assertGameAccessCodeAvailable(
  code: string,
  excludeGameId?: string
): Promise<void> {
  const normalized = normalizeGameAccessCode(code)
  if (!isValidGameAccessCode(normalized)) {
    throw new Error(gameAccessCodeValidationMessage(normalized) ?? 'Некорректный код доступа')
  }

  let query = supabase.from('games').select('id, title').eq('code', normalized)
  if (excludeGameId) {
    query = query.neq('id', excludeGameId)
  }

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  if (data) {
    throw new Error(`Код «${normalized}» уже занят игрой «${data.title}». Выберите другой код.`)
  }
}
