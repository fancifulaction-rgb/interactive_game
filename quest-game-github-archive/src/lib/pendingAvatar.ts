import { uploadTeamAvatarInBackground } from './storageUpload'
import { debugLog } from './debugLog'
import { isAnswerSaveInFlight } from './networkMutex'

let pending: { teamId: string; gameId: string; file: File } | null = null

export function hasPendingAvatar() {
  return pending !== null
}

/** Сохраняет аватар в памяти до успешной загрузки (без параллельного Storage при регистрации). */
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
  const snapshot = pending
  pending = null
  debugLog('pendingAvatar.ts', 'flush start', { teamId: snapshot.teamId }, 'B')
  try {
    await uploadTeamAvatarInBackground(snapshot.teamId, snapshot.file, snapshot.gameId)
  } catch {
    pending = snapshot
  } finally {
    avatarFlushQueued = false
    if (pending) {
      window.setTimeout(() => flushPendingAvatarWhenIdle(), 8000)
    }
  }
}

/** Отложить аватар до первого ответа или долгого простоя (см. rescheduleAvatarAfterAnswer). */
export function postponeAvatarUntilAfterAnswer() {
  avatarFlushQueued = false
}
