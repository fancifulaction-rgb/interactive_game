import { normalizeGameAccessCode } from './gameAccessCode'

/** Query param for deep link to team registration (IMP-UX-002). */
export const REGISTRATION_CODE_PARAM = 'code'

export function buildTeamRegistrationUrl(gameCode: string, origin?: string): string {
  const base = (origin ?? (typeof window !== 'undefined' ? window.location.origin : '')).replace(
    /\/$/,
    ''
  )
  const normalized = normalizeGameAccessCode(gameCode)
  const params = new URLSearchParams({ [REGISTRATION_CODE_PARAM]: normalized })
  return `${base}/team/register?${params.toString()}`
}

export function readRegistrationCodeFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const raw = params.get(REGISTRATION_CODE_PARAM)
  return raw ? normalizeGameAccessCode(raw) : ''
}
