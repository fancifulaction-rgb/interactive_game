import { supabase } from './supabase'
import {
  GAME_MEDIA_BUCKETS,
  collectPathsByBucket,
  type GameMediaBucket,
} from './storagePaths'

async function listGamePrefixPaths(bucket: GameMediaBucket, gameId: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(gameId, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  })
  if (error || !data?.length) return []
  return data.map((f) => `${gameId}/${f.name}`)
}

/**
 * Best-effort очистка Storage при client fallback (IMP-DATA-003).
 * Требует authenticated admin + политику DELETE на storage.objects.
 */
export async function deleteGameStorageBestEffort(
  gameId: string,
  mediaUrls: (string | null | undefined)[]
): Promise<number> {
  const fromUrls = collectPathsByBucket(mediaUrls)
  let removed = 0

  for (const bucket of GAME_MEDIA_BUCKETS) {
    const prefixPaths = await listGamePrefixPaths(bucket, gameId)
    const urlPaths = fromUrls.get(bucket) ?? []
    const paths = [...new Set([...prefixPaths, ...urlPaths])]
    if (!paths.length) continue

    const { data, error } = await supabase.storage.from(bucket).remove(paths)
    if (error) {
      console.warn(`Storage cleanup ${bucket}:`, error.message)
      continue
    }
    removed += data?.length ?? paths.length
  }

  return removed
}
