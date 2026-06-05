import { supabase } from './supabase'
import { debugLog } from './debugLog'
import { enqueueCritical, enqueueBackground } from './requestQueue'

const UPLOAD_TIMEOUT_MS = 90_000
const UPLOAD_RETRIES = 3

let activeUpload: AbortController | null = null

/** Освобождает HTTP-соединение для ответа игрока (отменяет фоновый аватар и т.п.). */
export function cancelActiveStorageUpload() {
  if (activeUpload) {
    activeUpload.abort()
    activeUpload = null
    debugLog('storageUpload.ts', 'upload cancelled', {}, 'H')
  }
}

function buildFileName(file: File, prefix: string): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
}

async function uploadViaEdgeFunction(
  bucket: string,
  file: File,
  fileName: string
): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)

  const { data, error } = await supabase.functions.invoke('player-upload', {
    body: {
      file: base64,
      bucket,
      fileName,
      mimeType: file.type || 'application/octet-stream',
    },
  })

  if (error) throw error
  const errMsg =
    typeof data?.error === 'object' && data.error?.message
      ? String(data.error.message)
      : typeof data?.error === 'string'
        ? data.error
        : null
  if (errMsg || !data?.success || !data?.url) {
    throw new Error(errMsg || 'player-upload failed')
  }

  debugLog('storageUpload.ts', 'edge upload ok', { fileName }, 'B')
  return data.url as string
}

async function uploadOnce(
  bucket: string,
  file: File,
  prefix: string
): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase не настроен')
  }

  const fileName = buildFileName(file, prefix)
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${fileName}`

  cancelActiveStorageUpload()
  const controller = new AbortController()
  activeUpload = controller
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)

  debugLog('storageUpload.ts', 'upload start', { bucket, fileName, size: file.size }, 'B')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'false',
      },
      body: file,
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      debugLog('storageUpload.ts', 'upload http error', { status: res.status, text: text.slice(0, 200) }, 'B')
      if (res.status === 401 || res.status === 403 || res.status === 400) {
        return uploadViaEdgeFunction(bucket, file, fileName)
      }
      throw new Error(`Storage ${res.status}: ${text || res.statusText}`)
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${fileName}`
    debugLog('storageUpload.ts', 'upload ok', { fileName }, 'B')
    return publicUrl
  } finally {
    clearTimeout(timer)
    if (activeUpload === controller) activeUpload = null
  }
}

async function uploadWithRetry(bucket: string, file: File, prefix: string): Promise<string> {
  let lastErr: unknown
  for (let attempt = 0; attempt < UPLOAD_RETRIES; attempt++) {
    try {
      return await uploadOnce(bucket, file, prefix)
    } catch (err) {
      lastErr = err
      debugLog('storageUpload.ts', 'upload retry', {
        attempt,
        msg: err instanceof Error ? err.message : String(err),
      }, 'B')
      if (attempt < UPLOAD_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/**
 * Загрузка медиа к ответу — в critical-очереди (не конкурирует с insert в той же вкладке).
 */
export function uploadAnswerMediaQueued(file: File): Promise<string> {
  return enqueueCritical(() => uploadWithRetry('answer-media', file, 'answer-'))
}

/**
 * Загрузка аватара — в background-очереди (после игры, с разнесением пиков).
 */
export function uploadAvatarQueued(file: File): Promise<string> {
  return enqueueBackground(() => uploadWithRetry('avatars', file, 'team-'))
}

/** @deprecated Используйте uploadAnswerMediaQueued / uploadAvatarQueued */
export async function uploadToPublicBucket(
  bucket: string,
  file: File,
  prefix = ''
): Promise<string> {
  if (bucket === 'answer-media') {
    return uploadAnswerMediaQueued(file)
  }
  return uploadAvatarQueued(file)
}

/** Загрузка аватара после окончания игры; ошибки не блокируют UI. */
export async function uploadTeamAvatarInBackground(teamId: string, file: File) {
  try {
    const avatarUrl = await uploadAvatarQueued(file)
    await enqueueCritical(async () => {
      const { error } = await supabase
        .from('teams')
        .update({ avatar_url: avatarUrl, avatar: avatarUrl })
        .eq('id', teamId)
      if (error) throw error
    })
    debugLog('storageUpload.ts', 'avatar background ok', { teamId }, 'B')
  } catch (err) {
    debugLog('storageUpload.ts', 'avatar background fail', {
      err: err instanceof Error ? err.message : String(err),
    }, 'B')
  }
}
