import { ensureAuthenticatedSessionForWrite } from './adminAuth'
import { supabase } from './supabase'
import { debugLog } from './debugLog'
import { enqueueCritical, enqueueBackground } from './requestQueue'
import { buildGameScopedFileName } from './storagePaths'
import { getTeamSessionToken } from './teamSession'
import { assertUploadAllowed } from './uploadFileGuard'
import { broadcastTeamsChanged } from './gameRealtime'
import { compressQuestionMedia, type CompressProgressFn } from './compressQuestionMedia'
import { isAdminRoute } from './adminFetchBoost'

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

function uploadTimeoutMs(sizeBytes: number): number {
  return Math.min(300_000, Math.max(UPLOAD_TIMEOUT_MS, Math.ceil(sizeBytes / (50 * 1024)) * 1000))
}

async function uploadViaEdgeFunction(
  bucket: string,
  file: File,
  fileName: string,
  gameId: string,
  teamId?: string
): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)

  const sessionToken = getTeamSessionToken(teamId ?? localStorage.getItem('team_id'))
  const { data, error } = await supabase.functions.invoke('player-upload', {
    body: {
      file: base64,
      bucket,
      fileName,
      mimeType: file.type || 'application/octet-stream',
      gameId,
      teamId: teamId ?? localStorage.getItem('team_id'),
      sessionToken,
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

const ADMIN_UPLOAD_BUCKETS = new Set(['question-media', 'quest-logos'])

async function storageAuthHeaders(requireUserJwt = false): Promise<{ Authorization: string; apikey: string }> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('Supabase не настроен')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (requireUserJwt && !token) {
    throw new Error(
      'Сессия Supabase истекла. Выйдите из админки и войдите снова через email — иначе загрузка медиа отклоняется.'
    )
  }
  return {
    Authorization: `Bearer ${token ?? anonKey}`,
    apikey: anonKey,
  }
}

async function uploadAdminMediaViaClient(
  bucket: string,
  file: File,
  fileName: string
): Promise<string> {
  await ensureAuthenticatedSessionForWrite()
  const { data, error } = await supabase.storage.from(bucket).upload(fileName, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) throw error
  const path = data?.path ?? fileName
  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path)
  if (!publicData?.publicUrl) {
    throw new Error('Storage: не удалось получить публичный URL')
  }
  return publicData.publicUrl
}

async function uploadOnce(
  bucket: string,
  file: File,
  gameId: string,
  prefix: string,
  teamId?: string
): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase не настроен')
  }

  const fileName = buildGameScopedFileName(gameId, prefix, file)

  if (bucket === 'avatars' || bucket === 'answer-media') {
    return uploadViaEdgeFunction(bucket, file, fileName, gameId, teamId)
  }

  if (ADMIN_UPLOAD_BUCKETS.has(bucket)) {
    return uploadAdminMediaViaClient(bucket, file, fileName)
  }

  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${fileName}`

  cancelActiveStorageUpload()
  const controller = new AbortController()
  activeUpload = controller
  const timer = setTimeout(() => controller.abort(), uploadTimeoutMs(file.size))

  debugLog('storageUpload.ts', 'upload start', { bucket, fileName, size: file.size }, 'B')

  try {
    const authHeaders = await storageAuthHeaders(ADMIN_UPLOAD_BUCKETS.has(bucket))
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'false',
      },
      body: file,
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      debugLog('storageUpload.ts', 'upload http error', { status: res.status, text: text.slice(0, 200) }, 'B')
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Загрузка отклонена (${res.status}). Войдите в админку заново — для ${bucket} нужна Supabase-сессия.`
        )
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

async function uploadWithRetry(
  bucket: string,
  file: File,
  gameId: string,
  prefix: string,
  teamId?: string
): Promise<string> {
  await assertUploadAllowed(bucket, file)
  let lastErr: unknown
  for (let attempt = 0; attempt < UPLOAD_RETRIES; attempt++) {
    try {
      return await uploadOnce(bucket, file, gameId, prefix, teamId)
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

export type AnswerMediaUploadOptions = {
  onCompressProgress?: CompressProgressFn
}

async function uploadAnswerMediaInner(
  file: File,
  gameId: string,
  options?: AnswerMediaUploadOptions
): Promise<string> {
  const prepared = await compressQuestionMedia(file, options?.onCompressProgress)
  options?.onCompressProgress?.(100, 'Загружаем в облако…')
  return uploadWithRetry('answer-media', prepared, gameId, 'answer-')
}

export function uploadAnswerMediaQueued(
  file: File,
  gameId: string,
  options?: AnswerMediaUploadOptions
): Promise<string> {
  return enqueueBackground(() => uploadAnswerMediaInner(file, gameId, options))
}

export type QuestionMediaUploadOptions = {
  onCompressProgress?: CompressProgressFn
  skipCompress?: boolean
}

async function uploadQuestionMediaInner(
  file: File,
  gameId: string,
  options?: QuestionMediaUploadOptions
): Promise<string> {
  const prepared = await compressQuestionMedia(
    file,
    options?.onCompressProgress,
    { skipCompress: options?.skipCompress }
  )
  options?.onCompressProgress?.(100, 'Загружаем в облако…')
  return uploadWithRetry('question-media', prepared, gameId, 'q-')
}

export function uploadQuestionMediaQueued(
  file: File,
  gameId: string,
  options?: QuestionMediaUploadOptions
): Promise<string> {
  if (isAdminRoute()) {
    return uploadQuestionMediaInner(file, gameId, options)
  }
  return enqueueCritical(() => uploadQuestionMediaInner(file, gameId, options))
}

export function uploadAvatarQueued(file: File, gameId: string, teamId?: string): Promise<string> {
  return enqueueBackground(() => uploadWithRetry('avatars', file, gameId, 'team-', teamId))
}

/** @deprecated Используйте uploadAnswerMediaQueued / uploadAvatarQueued */
export async function uploadToPublicBucket(
  bucket: string,
  file: File,
  gameId: string,
  prefix = ''
): Promise<string> {
  if (bucket === 'answer-media') {
    return uploadAnswerMediaQueued(file, gameId)
  }
  return uploadAvatarQueued(file, gameId)
}

/** Загрузка аватара после окончания игры; ошибки не блокируют UI. */
export async function uploadTeamAvatarInBackground(teamId: string, file: File, gameId: string) {
  const avatarUrl = await uploadAvatarQueued(file, gameId, teamId)
  const sessionToken = getTeamSessionToken(teamId)
  if (!sessionToken) {
    throw new Error('team session token missing')
  }
  await enqueueCritical(async () => {
    const { error } = await supabase.rpc('update_team_avatar', {
      p_team_id: teamId,
      p_game_id: gameId,
      p_session_token: sessionToken,
      p_avatar_url: avatarUrl,
    })
    if (error) throw error
  })
  void broadcastTeamsChanged(gameId)
  debugLog('storageUpload.ts', 'avatar background ok', { teamId, avatarUrl }, 'B')
}
