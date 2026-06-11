const ALLOWED_BUCKETS = new Set(['avatars', 'answer-media'])

const BUCKET_MAX_BYTES: Record<string, number> = {
  avatars: 5 * 1024 * 1024,
  'answer-media': 100 * 1024 * 1024,
}

const MIME_PREFIXES: Record<string, string[]> = {
  avatars: ['image/'],
  'answer-media': ['image/', 'video/', 'audio/'],
}

const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  avatars: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  'answer-media': [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
    '.heic',
    '.mp4',
    '.webm',
    '.mov',
    '.mp3',
    '.wav',
    '.m4a',
    '.ogg',
  ],
}

function mimeAllowed(mime: string, prefixes: string[]): boolean {
  const normalized = (mime || '').toLowerCase().trim()
  if (!normalized || normalized === 'application/octet-stream') return false
  return prefixes.some((prefix) => normalized.startsWith(prefix))
}

function extAllowed(name: string, extensions: string[]): boolean {
  const lower = name.toLowerCase()
  return extensions.some((ext) => lower.endsWith(ext))
}

function magicMatchesImage(bytes: Uint8Array): boolean {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return true
  }
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return true
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true
  }
  return false
}

function magicMatchesMedia(bytes: Uint8Array): boolean {
  if (magicMatchesImage(bytes)) return true
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return true
  }
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return true
  }
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return true
  }
  return false
}

function extensionOnlyFallback(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.heic') || lower.endsWith('.m4a')
}

function sniffUploadMagic(fileHead: Uint8Array, bucket: string): boolean {
  if (bucket === 'avatars') return magicMatchesImage(fileHead)
  return magicMatchesMedia(fileHead)
}

export function validateUploadPath(gameId: string, fileName: string): boolean {
  if (!gameId || !fileName) return false
  const prefix = `${gameId}/`
  if (!fileName.startsWith(prefix)) return false
  if (fileName.includes('..')) return false
  return true
}

export async function verifyTeamSession(
  teamId: string,
  gameId: string,
  sessionToken: string
): Promise<boolean> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey || !teamId || !gameId || !sessionToken) return false

  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/verify_team_session`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_team_id: teamId,
      p_game_id: gameId,
      p_session_token: sessionToken,
    }),
  })

  if (!res.ok) return false
  const data = await res.json()
  return data === true
}

export function validatePlayerUploadInput(input: {
  bucket?: string
  fileName?: string
  gameId?: string
  teamId?: string
  sessionToken?: string
  fileByteLength?: number
  mimeType?: string
  fileHead?: Uint8Array
}): string | null {
  if (!input.bucket || !input.fileName || !input.gameId || !input.teamId || !input.sessionToken) {
    return 'Missing required parameters'
  }
  if (!ALLOWED_BUCKETS.has(input.bucket)) {
    return 'Bucket not allowed'
  }
  if (!validateUploadPath(input.gameId, input.fileName)) {
    return 'Invalid upload path'
  }

  const maxBytes = BUCKET_MAX_BYTES[input.bucket] ?? 5 * 1024 * 1024
  if ((input.fileByteLength ?? 0) <= 0) {
    return 'Empty file'
  }
  if ((input.fileByteLength ?? 0) > maxBytes) {
    return 'File too large'
  }

  const prefixes = MIME_PREFIXES[input.bucket] ?? []
  const extensions = ALLOWED_EXTENSIONS[input.bucket] ?? []
  const mimeOk = mimeAllowed(input.mimeType ?? '', prefixes)
  const extOk = extAllowed(input.fileName, extensions)
  if (!mimeOk && !extOk) {
    return 'File type not allowed'
  }

  const head = input.fileHead
  if (head && head.length >= 3) {
    if (!sniffUploadMagic(head, input.bucket) && !(extOk && extensionOnlyFallback(input.fileName))) {
      return 'File content does not match allowed type'
    }
  } else if (input.bucket === 'avatars') {
    return 'Unable to verify file type'
  } else if (!mimeOk && !(extOk && extensionOnlyFallback(input.fileName))) {
    return 'Unable to verify file type'
  }

  return null
}
