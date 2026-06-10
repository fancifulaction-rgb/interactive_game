/** Состояние сессии игры (поле game_state.current_state). */

export const GAME_STATE_CLOSED = 'closed'
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

/** Монотонный счётчик «начать заново» в лобби (player_data.lobbyEpoch). */
export function getLobbyEpoch(state: GameStateRow | null | undefined): number {
  const raw = state?.player_data?.lobbyEpoch
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

export type GameSessionStatus = 'closed' | 'waiting' | 'playing' | 'paused' | 'finished'

function normalizedState(state: GameStateRow | null | undefined): string {
  return (state?.current_state ?? '').toLowerCase()
}

export function isGameClosed(state: GameStateRow | null | undefined): boolean {
  if (!state) return false
  return normalizedState(state) === GAME_STATE_CLOSED
}

export function isGameFinished(state: GameStateRow | null | undefined): boolean {
  const s = normalizedState(state)
  return s === GAME_STATE_FINISHED || s === 'ended' || s === 'completed'
}

/** Состояние сессии ещё не загружено (не трактовать как лобби). */
export function isGameSessionUnknown(state: GameStateRow | null | undefined): boolean {
  return state == null
}

/** Игра в комнате ожидания (лобби открыто админом). */
export function isGameInLobby(state: GameStateRow | null | undefined): boolean {
  if (!state) return false
  if (isGameFinished(state) || isGameClosed(state)) return false
  const s = normalizedState(state)
  return s === GAME_STATE_WAITING
}

export function isGamePausedDuringPlay(state: GameStateRow | null | undefined): boolean {
  if (!state || isGameInLobby(state) || isGameFinished(state) || isGameClosed(state)) return false
  return !!state.is_paused
}

export function getGameSessionStatus(state: GameStateRow | null | undefined): GameSessionStatus {
  if (state == null) return 'closed'
  if (isGameClosed(state)) return 'closed'
  if (isGameFinished(state)) return 'finished'
  if (isGameInLobby(state)) return 'waiting'
  const s = normalizedState(state)
  if (s === GAME_STATE_PLAYING || s === 'active') {
    return state.is_paused ? 'paused' : 'playing'
  }
  // Неизвестное/устаревшее значение current_state — не считать игру идущей.
  return 'closed'
}

export function gameStateUpdatedAtMs(state: GameStateRow | null | undefined): number {
  if (!state?.updated_at) return 0
  const t = new Date(state.updated_at).getTime()
  return Number.isFinite(t) ? t : 0
}

/** closed < waiting < playing < finished — не откатывать сессию при гонке poll/broadcast. */
function gameStateProgressRank(state: GameStateRow | null | undefined): number {
  if (!state) return 0
  if (isGameFinished(state)) return 4
  const s = normalizedState(state)
  if (s === GAME_STATE_PLAYING || s === 'active') return 3
  if (s === GAME_STATE_WAITING) return 2
  if (s === GAME_STATE_CLOSED) return 1
  return 1
}

/** Не применять устаревший poll/broadcast поверх более свежего состояния (гонка на iOS). */
/** Скрытие/показ вопросов в редакторе — только до старта заезда. */
export function canToggleQuestionHidden(state: GameStateRow | null | undefined): boolean {
  if (state == null) return true
  const s = normalizedState(state)
  return s === GAME_STATE_CLOSED || s === GAME_STATE_WAITING || s === 'lobby'
}

export function isGameStateRowNewer(
  incoming: GameStateRow | null | undefined,
  current: GameStateRow | null | undefined
): boolean {
  if (!incoming) return false
  if (!current) return true
  const inc = gameStateUpdatedAtMs(incoming)
  const cur = gameStateUpdatedAtMs(current)
  if (inc !== cur) return inc > cur
  return gameStateProgressRank(incoming) >= gameStateProgressRank(current)
}

export function getGameSessionStatusLabel(status: GameSessionStatus): string {
  switch (status) {
    case 'closed':
      return 'Закрыта'
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

/** Приоритет для списка игр в админке: live → лобби → завершена → закрыта. */
export function getGameSessionAdminListSortRank(status: GameSessionStatus): number {
  switch (status) {
    case 'playing':
    case 'paused':
      return 4
    case 'waiting':
      return 3
    case 'finished':
      return 2
    case 'closed':
      return 1
  }
}

export function sortGamesBySessionStatus<T extends { id: string; created_at: string }>(
  games: T[],
  stateByGameId: Readonly<Record<string, GameStateRow | null | undefined>>
): T[] {
  const stateFor = (id: string) => stateByGameId[id] ?? null

  return [...games].sort((a, b) => {
    const ra = getGameSessionAdminListSortRank(getGameSessionStatus(stateFor(a.id)))
    const rb = getGameSessionAdminListSortRank(getGameSessionStatus(stateFor(b.id)))
    if (ra !== rb) return rb - ra
    const ua = gameStateUpdatedAtMs(stateFor(a.id))
    const ub = gameStateUpdatedAtMs(stateFor(b.id))
    if (ua !== ub) return ub - ua
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

export function getGameSessionStatusBadgeClasses(status: GameSessionStatus): string {
  switch (status) {
    case 'playing':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'paused':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'waiting':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'finished':
      return 'bg-gray-100 text-gray-600 border-gray-200'
    case 'closed':
      return 'bg-gray-50 text-gray-500 border-gray-200'
  }
}

export function getGameSessionStatusCardBorderClasses(status: GameSessionStatus): string {
  switch (status) {
    case 'playing':
      return 'border-l-4 border-l-green-500'
    case 'paused':
      return 'border-l-4 border-l-amber-500'
    case 'waiting':
      return 'border-l-4 border-l-blue-500'
    default:
      return ''
  }
}
