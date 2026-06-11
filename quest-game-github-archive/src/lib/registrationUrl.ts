import { normalizeGameAccessCode } from './gameAccessCode'
import { normalizeJoinToken } from './joinToken'
import { getPublicAppOrigin } from './publicAppOrigin'

/** Ручной ввод кода игры (legacy deep link). */
export const REGISTRATION_CODE_PARAM = 'code'

/** Секретная ссылка регистрации (QR, копирование). */
export const REGISTRATION_JOIN_PARAM = 'join'

function registrationBase(origin?: string): string {
  return (origin ?? getPublicAppOrigin()).replace(/\/$/, '')
}

/** QR и «копировать ссылку» — только join-токен, без короткого code в URL. */
export function buildTeamRegistrationJoinUrl(joinToken: string, origin?: string): string {
  const params = new URLSearchParams({
    [REGISTRATION_JOIN_PARAM]: normalizeJoinToken(joinToken),
  })
  return `${registrationBase(origin)}/team/register?${params.toString()}`
}

/** @deprecated Используйте buildTeamRegistrationJoinUrl для QR. Оставлено для совместимости. */
export function buildTeamRegistrationUrl(gameCode: string, origin?: string): string {
  const normalized = normalizeGameAccessCode(gameCode)
  const params = new URLSearchParams({ [REGISTRATION_CODE_PARAM]: normalized })
  return `${registrationBase(origin)}/team/register?${params.toString()}`
}

export function readRegistrationJoinFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const raw = params.get(REGISTRATION_JOIN_PARAM)
  return raw ? normalizeJoinToken(raw) : ''
}

export function readRegistrationCodeFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const raw = params.get(REGISTRATION_CODE_PARAM)
  return raw ? normalizeGameAccessCode(raw) : ''
}
