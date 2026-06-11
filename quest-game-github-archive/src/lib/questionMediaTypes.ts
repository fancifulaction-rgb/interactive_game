export type MediaKind = 'image' | 'video' | 'audio'

export type QuestionMediaItem = {
  id: string
  kind: MediaKind
  url: string
  order: number
  label?: string
  bytes?: number
  layout?: { x: number; y: number; w: number; h: number; zIndex?: number }
  playback?: {
    trigger: 'onLoad' | 'manual' | 'afterMs' | 'withBlock'
    delayMs?: number
    parallelGroup?: string
  }
}

export type QuestionHint = {
  text: string
  penalty: number
  media_items?: QuestionMediaItem[]
}

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif']
const VIDEO_EXT = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv']
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a']

export function inferMediaKind(fileName: string, mime?: string): MediaKind {
  if (mime?.startsWith('video/')) return 'video'
  if (mime?.startsWith('audio/')) return 'audio'
  if (mime?.startsWith('image/')) return 'image'
  const ext = fileName.toLowerCase().split('.').pop() || ''
  if (VIDEO_EXT.includes(ext)) return 'video'
  if (AUDIO_EXT.includes(ext)) return 'audio'
  return 'image'
}

function inferKindFromUrl(url: string): MediaKind {
  try {
    const path = new URL(url).pathname
    return inferMediaKind(path)
  } catch {
    return inferMediaKind(url)
  }
}

function parseMediaItem(raw: unknown, fallbackOrder: number): QuestionMediaItem | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const url = typeof o.url === 'string' ? o.url : ''
  if (!url) return null
  const kind =
    o.kind === 'video' || o.kind === 'audio' || o.kind === 'image'
      ? o.kind
      : inferKindFromUrl(url)
  return {
    id: typeof o.id === 'string' && o.id ? o.id : crypto.randomUUID(),
    kind,
    url,
    order: typeof o.order === 'number' ? o.order : fallbackOrder,
    label: typeof o.label === 'string' ? o.label : undefined,
    bytes: typeof o.bytes === 'number' ? o.bytes : undefined,
    layout: o.layout as QuestionMediaItem['layout'],
    playback: o.playback as QuestionMediaItem['playback'],
  }
}

function parseMediaItemsArray(raw: unknown): QuestionMediaItem[] {
  if (!Array.isArray(raw)) return []
  const items = raw
    .map((entry, i) => parseMediaItem(entry, i))
    .filter((x): x is QuestionMediaItem => x !== null)
  return reindexMediaItems(items)
}

function parseHint(raw: unknown, fallbackPenalty: number): QuestionHint | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const text = typeof o.text === 'string' ? o.text : ''
  const penalty = typeof o.penalty === 'number' ? o.penalty : fallbackPenalty
  const media_items = Array.isArray(o.media_items)
    ? parseMediaItemsArray(o.media_items)
    : []
  return { text, penalty, media_items }
}

/** Чтение media_items с synthetic fallback из media_url + type. */
export function normalizeMediaItemsFromRow(row: Record<string, unknown>): QuestionMediaItem[] {
  const parsed = parseMediaItemsArray(row.media_items)
  if (parsed.length > 0) return parsed

  const url = row.media_url
  if (typeof url === 'string' && url.trim()) {
    const type = row.type ?? row.question_type
    let kind: MediaKind = 'image'
    if (type === 'video' || type === 'audio' || type === 'image') {
      kind = type
    } else {
      kind = inferKindFromUrl(url)
    }
    return [{ id: crypto.randomUUID(), kind, url, order: 0 }]
  }
  return []
}

/** Чтение hints с fallback из hint_levels + hint_penalties. */
export function normalizeHintsFromRow(row: Record<string, unknown>): QuestionHint[] {
  const raw = row.hints
  if (Array.isArray(raw) && raw.length > 0) {
    const hints = raw
      .map((entry, i) => {
        const penalties = row.hint_penalties
        const fallback =
          Array.isArray(penalties) && typeof penalties[i] === 'number' ? penalties[i] : 10
        return parseHint(entry, fallback)
      })
      .filter((x): x is QuestionHint => x !== null)
    if (hints.length > 0) return hints
  }

  const levels = row.hint_levels
  const penalties = row.hint_penalties
  if (!Array.isArray(levels) || levels.length === 0) return []

  return levels.map((text, i) => ({
    text: typeof text === 'string' ? text : String(text ?? ''),
    penalty:
      Array.isArray(penalties) && typeof penalties[i] === 'number' ? penalties[i] : 10,
    media_items: [],
  }))
}

export function legacyHintArraysFromHints(hints: QuestionHint[]): {
  hint_levels: string[]
  hint_penalties: number[]
} {
  return {
    hint_levels: hints.map((h) => h.text),
    hint_penalties: hints.map((h) => h.penalty),
  }
}

export function legacyMediaFromItems(items: QuestionMediaItem[]): {
  media_url: string | null
  type: string
} {
  if (!items.length) return { media_url: null, type: 'text' }
  const sorted = [...items].sort((a, b) => a.order - b.order)
  const first = sorted[0]
  return { media_url: first.url, type: first.kind }
}

export function reindexMediaItems(items: QuestionMediaItem[]): QuestionMediaItem[] {
  return [...items]
    .sort((a, b) => a.order - b.order)
    .map((item, order) => ({ ...item, order }))
}

export function createMediaItem(kind: MediaKind, url: string, order: number, bytes?: number): QuestionMediaItem {
  return {
    id: crypto.randomUUID(),
    kind,
    url,
    order,
    bytes,
  }
}

export function moveMediaItem(items: QuestionMediaItem[], index: number, direction: -1 | 1): QuestionMediaItem[] {
  const sorted = reindexMediaItems(items)
  const target = index + direction
  if (target < 0 || target >= sorted.length) return sorted
  const next = [...sorted]
  ;[next[index], next[target]] = [next[target], next[index]]
  return reindexMediaItems(next)
}

export function removeMediaItemAt(items: QuestionMediaItem[], index: number): QuestionMediaItem[] {
  return reindexMediaItems(items.filter((_, i) => i !== index))
}

export function collectQuestionMediaUrls(
  rows: {
    media_url?: string | null
    media_items?: QuestionMediaItem[] | unknown
    hints?: QuestionHint[] | unknown
  }[]
): string[] {
  const urls: string[] = []
  const push = (url: string | null | undefined) => {
    if (url && !urls.includes(url)) urls.push(url)
  }

  for (const row of rows) {
    push(row.media_url)
    const items = Array.isArray(row.media_items)
      ? (row.media_items as QuestionMediaItem[])
      : normalizeMediaItemsFromRow(row as Record<string, unknown>)
    for (const item of items) push(item.url)

    const hints = Array.isArray(row.hints)
      ? (row.hints as QuestionHint[])
      : normalizeHintsFromRow(row as Record<string, unknown>)
    for (const hint of hints) {
      for (const item of hint.media_items ?? []) push(item.url)
    }
  }
  return urls
}

export function hintsForPlay(row: Record<string, unknown>): QuestionHint[] {
  return normalizeHintsFromRow(row)
}

export function mediaItemsForPlay(row: Record<string, unknown>): QuestionMediaItem[] {
  return normalizeMediaItemsFromRow(row)
}
