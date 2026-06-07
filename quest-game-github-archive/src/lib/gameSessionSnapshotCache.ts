import type { GameSessionSnapshot } from '../components/GameStateManager'

const cache = new Map<string, GameSessionSnapshot>()

const OPTIMISTIC_LOBBY: GameSessionSnapshot = {
  inLobby: true,
  isPaused: false,
  isFinished: false,
  sessionUnknown: false,
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
  return !!(prev && !prev.inLobby && next.inLobby && !next.isFinished)
}

/** Пока game_state не пришёл — удержать последнее известное состояние или лобби при первом входе. */
export function resolveSlowFetchFallback(gameId: string): GameSessionSnapshot {
  const prev = cache.get(gameId)
  if (prev && !prev.inLobby) return prev
  if (prev) return prev
  return OPTIMISTIC_LOBBY
}
