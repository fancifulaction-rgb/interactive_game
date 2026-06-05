/** Buckets с медиа, привязанным к игре (IMP-ST-003). */
export const GAME_MEDIA_BUCKETS = ['answer-media', 'avatars', 'question-media'] as const

export type GameMediaBucket = (typeof GAME_MEDIA_BUCKETS)[number]

export function buildGameScopedFileName(gameId: string, prefix: string, file: File): string {
  const safe = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
  return `${gameId}/${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`
}

/** Парсит public URL Supabase Storage → bucket + path (может содержать game_id/…). */
export function parseStoragePublicUrl(url: string | null | undefined): { bucket: string; path: string } | null {
  if (!url) return null
  const marker = '/storage/v1/object/public/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  const rest = url.slice(idx + marker.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  return {
    bucket: rest.slice(0, slash),
    path: decodeURIComponent(rest.slice(slash + 1)),
  }
}

export function collectPathsByBucket(urls: (string | null | undefined)[]): Map<string, string[]> {
  const byBucket = new Map<string, string[]>()
  for (const url of urls) {
    const parsed = parseStoragePublicUrl(url)
    if (!parsed) continue
    const list = byBucket.get(parsed.bucket) ?? []
    if (!list.includes(parsed.path)) list.push(parsed.path)
    byBucket.set(parsed.bucket, list)
  }
  return byBucket
}

export function extractMediaUrlsFromAnswers(
  rows: { media_urls?: unknown; media_url?: string | null }[]
): string[] {
  const urls: string[] = []
  for (const row of rows) {
    if (typeof row.media_url === 'string') urls.push(row.media_url)
    const raw = row.media_urls
    if (Array.isArray(raw)) {
      for (const u of raw) {
        if (typeof u === 'string') urls.push(u)
      }
    }
  }
  return urls
}
