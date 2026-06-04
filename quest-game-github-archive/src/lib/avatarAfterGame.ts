import { hasPendingAvatar, runPendingAvatarUpload } from './pendingAvatar'
import { enqueueBackground } from './requestQueue'

/** Разнести пики Storage, когда много команд заканчивают игру одновременно (до ~15 с). */
function staggerMsForTeam(teamId: string, maxMs = 15_000): number {
  let hash = 0
  for (let i = 0; i < teamId.length; i++) {
    hash = (hash * 31 + teamId.charCodeAt(i)) >>> 0
  }
  return hash % maxMs
}

/** Загрузка аватара один раз после окончания игры (табло / поздравление). */
export function tryUploadAvatarAfterGame(teamId?: string | null) {
  if (!hasPendingAvatar()) return

  const delay = teamId ? staggerMsForTeam(teamId) : 0

  window.setTimeout(() => {
    void enqueueBackground(() => runPendingAvatarUpload())
  }, delay)
}
