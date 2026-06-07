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

/** Не откатывать игрока в лобби из-за медленного poll после старта игры. */
export function shouldBlockLobbyRegression(
  prev: GameSessionSnapshot | undefined,
  next: GameSessionSnapshot
): boolean {
  if (prev?.sessionUnknown) return false
  return !!(prev && !prev.inLobby && next.inLobby && !next.isFinished)
}

/** Пока game_state не пришёл — удержать последнее известное состояние или «неизвестно». */
export function resolveSlowFetchFallback(gameId: string): GameSessionSnapshot {
  const prev = cache.get(gameId)
  if (prev && !prev.inLobby) return prev
  if (prev) return prev
  return OPTIMISTIC_UNKNOWN
}
