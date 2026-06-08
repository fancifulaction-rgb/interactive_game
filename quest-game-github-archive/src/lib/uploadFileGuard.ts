export type UploadBucket = 'avatars' | 'answer-media' | 'question-media'

const MB = 1024 * 1024

const BUCKET_RULES: Record<
  UploadBucket,
  { maxBytes: number; mimePrefixes: string[]; extensions: string[] }
> = {
  avatars: {
    maxBytes: 5 * MB,
    mimePrefixes: ['image/'],
    extensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  },
  'answer-media': {
    maxBytes: 50 * MB,
    mimePrefixes: ['image/', 'video/', 'audio/'],
    extensions: [
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
  },
  'question-media': {
    maxBytes: 50 * MB,
    mimePrefixes: ['image/', 'video/', 'audio/'],
    extensions: [
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
  },
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

/** Бросает Error с сообщением для UI, если файл не проходит guard. */
export async function assertUploadAllowed(bucket: string, file: File): Promise<void> {
  const rules = BUCKET_RULES[bucket as UploadBucket]
  if (!rules) {
    throw new Error('Неизвестный bucket для загрузки')
  }
  if (file.size <= 0) {
    throw new Error('Пустой файл')
  }
  if (file.size > rules.maxBytes) {
    const mb = Math.round(rules.maxBytes / MB)
    throw new Error(`Файл слишком большой (макс. ${mb} МБ)`)
  }

  const mimeOk = mimeAllowed(file.type, rules.mimePrefixes)
  const extOk = extAllowed(file.name, rules.extensions)
  if (!mimeOk && !extOk) {
    throw new Error('Недопустимый тип файла')
  }

  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())

  if (bucket === 'avatars') {
    if (!magicMatchesImage(head)) {
      throw new Error('Файл не похож на изображение')
    }
    return
  }

  if (mimeOk || magicMatchesMedia(head) || (extOk && extensionOnlyFallback(file.name))) {
    return
  }

  throw new Error('Не удалось проверить тип файла')
}
