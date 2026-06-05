import { uploadTeamAvatarInBackground } from './storageUpload'
import { debugLog } from './debugLog'
import { isAnswerSaveInFlight } from './networkMutex'

let pending: { teamId: string; gameId: string; file: File } | null = null

export function hasPendingAvatar() {
  return pending !== null
}

/** Сохраняет аватар в памяти до успешной загрузки GamePlay (без параллельного Storage). */
export function schedulePendingAvatar(teamId: string, gameId: string, file: File) {
  pending = { teamId, gameId, file }
  debugLog('pendingAvatar.ts', 'scheduled', { teamId, size: file.size }, 'B')
}

let avatarFlushQueued = false

/** Запускает загрузку аватара, когда сеть не занята загрузкой игры. */
export function flushPendingAvatarWhenIdle() {
  if (!pending || avatarFlushQueued) return
  if (isAnswerSaveInFlight()) return
  void runPendingAvatarUpload()
}

export async function runPendingAvatarUpload() {
  if (!pending || avatarFlushQueued) return
  avatarFlushQueued = true
  const { teamId, gameId, file } = pending
  pending = null
  debugLog('pendingAvatar.ts', 'flush start', { teamId }, 'B')
  try {
    await uploadTeamAvatarInBackground(teamId, file, gameId)
  } finally {
    avatarFlushQueued = false
  }
}

/** Отложить аватар до первого ответа или долгого простоя (см. rescheduleAvatarAfterAnswer). */
export function postponeAvatarUntilAfterAnswer() {
  avatarFlushQueued = false
}

