/** Состояние сессии игры (поле game_state.current_state). */

export const GAME_STATE_WAITING = 'waiting'
export const GAME_STATE_PLAYING = 'playing'
export const GAME_STATE_FINISHED = 'finished'

export type GameStateRow = {
  id?: number
  game_id: string
  current_state?: string | null
  is_paused?: boolean
  paused_at?: string | null
  paused_by?: string | null
  updated_at?: string | null
  player_data?: Record<string, unknown> | null
}

/** Время первого старта сессии (хранится в game_state.player_data.startedAt). */
export function getGameStartedAt(state: GameStateRow | null | undefined): string | null {
  const raw = state?.player_data?.startedAt
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

export type GameSessionStatus = 'waiting' | 'playing' | 'paused' | 'finished'

function normalizedState(state: GameStateRow | null | undefined): string {
  return (state?.current_state ?? '').toLowerCase()
}

export function isGameFinished(state: GameStateRow | null | undefined): boolean {
  const s = normalizedState(state)
  return s === GAME_STATE_FINISHED || s === 'ended' || s === 'completed'
}

/** Игра в комнате ожидания до нажатия «Начать» ведущим. */
export function isGameInLobby(state: GameStateRow | null | undefined): boolean {
  if (!state) return true
  if (isGameFinished(state)) return false
  const s = normalizedState(state)
  if (s === GAME_STATE_PLAYING || s === 'active') return false
  return true
}

export function isGamePausedDuringPlay(state: GameStateRow | null | undefined): boolean {
  if (!state || isGameInLobby(state) || isGameFinished(state)) return false
  return !!state.is_paused
}

export function getGameSessionStatus(state: GameStateRow | null | undefined): GameSessionStatus {
  if (isGameFinished(state)) return 'finished'
  if (isGameInLobby(state)) return 'waiting'
  if (state?.is_paused) return 'paused'
  return 'playing'
}

export function getGameSessionStatusLabel(status: GameSessionStatus): string {
  switch (status) {
    case 'waiting':
      return 'Комната ожидания'
    case 'playing':
      return 'Идёт игра'
    case 'paused':
      return 'На паузе'
    case 'finished':
      return 'Завершена'
  }
}
