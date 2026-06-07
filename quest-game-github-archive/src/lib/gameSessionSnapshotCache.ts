import type { GameSessionSnapshot } from '../components/GameStateManager'

const cache = new Map<string, GameSessionSnapshot>()

const OPTIMISTIC_UNKNOWN: GameSessionSnapshot = {
  inLobby: true,
  isPaused: false,
  isFinished: false,
  isClosed: false,
  sessionUnknown: true,
}

export function rememberSessionSnapshot(gameId: string, snap: GameSessionSnapshot) {
  if (!gameId || snap.sessionUnknown) return
  cache.set(gameId, snap)
}

export function getCachedSessionSnapshot(gameId: string): GameSessionSnapshot | undefined {
  return cache.get(gameId)
}

/** Не откатывать игрока в лобби из-за устаревшего poll после старта игры. */
export function shouldBlockLobbyRegression(
  prev: GameSessionSnapshot | undefined,
  next: GameSessionSnapshot
): boolean {
  if (prev?.sessionUnknown) return false
  if (!prev || prev.inLobby || !next.inLobby || next.isFinished) return false

  const prevEpoch = prev.lobbyEpoch ?? 0
  const nextEpoch = next.lobbyEpoch ?? 0
  if (nextEpoch > prevEpoch) return false

  const prevAt = prev.updatedAtMs ?? 0
  const nextAt = next.updatedAtMs ?? 0
  if (nextAt > prevAt) return false

  return true
}

/** Пока game_state не пришёл — удержать последнее известное состояние или «неизвестно». */
export function resolveSlowFetchFallback(gameId: string): GameSessionSnapshot {
  const prev = cache.get(gameId)
  if (prev && !prev.inLobby) return prev
  if (prev) return prev
  return OPTIMISTIC_UNKNOWN
}
