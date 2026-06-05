const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const CODE_LENGTH = 6

export function generateGameAccessCode(): string {
  let result = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    result += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length))
  }
  return result
}

export function normalizeGameAccessCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
}

export function isValidGameAccessCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code)
}
