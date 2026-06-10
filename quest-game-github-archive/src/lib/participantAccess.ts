import { supabase } from './supabase'
import { readFinishNavigateState } from './finishNavigation'
import { fetchGameStateForGame, invalidateGameStateCache } from './fetchGameState'
import { isTransientNetworkError } from './teamRegister'
import { getTeamSessionToken } from './teamSession'
import { isScoreboardHiddenUntilFinish } from './gameSettings'
import {
  getGameStartedAt,
  isGameClosed,
  isGameFinished,
  isGameInLobby,
  type GameStateRow,
} from './gameSessionState'

export const REGISTRATION_MESSAGES = {
  closed: 'Игра пока закрыта. Дождитесь объявления ведущего.',
  unknown: 'Не удалось проверить состояние игры. Попробуйте позже.',
  finished: 'Эта игра уже завершена. Регистрация новых команд закрыта.',
  started: 'Игра уже началась. Присоединиться к этой сессии больше нельзя.',
} as const

export const FINISH_MESSAGES = {
  no_session:
    'Доступ к результатам только для участников, зарегистрированных в этой игре до её завершения.',
  wrong_team: 'Ваша команда не участвовала в этой игре.',
  not_participant: 'Эта игра уже завершена. Вы не участвовали в этой сессии.',
  not_yet: 'Результаты будут доступны после завершения игры.',
} as const

export const PLAY_MESSAGES = {
  closed: 'Игра пока закрыта. Дождитесь объявления ведущего.',
  invalid_session: 'Сессия команды недействительна. Зарегистрируйтесь для этой игры.',
  late_join: 'Игра уже началась. Вы не успели присоединиться к этой сессии.',
  access_check_failed: 'Не удалось проверить доступ. Проверьте сеть и повторите попытку.',
} as const

import { readStoredTeamIdForGame } from './playerSession'

export function readStoredPlayerSession(gameCode: string): { teamId: string } | null {
  const teamId = readStoredTeamIdForGame(gameCode)
  if (!teamId) return null
  return { teamId }
}

/** Можно ли регистрировать новую команду (только комната ожидания). */
export function getRegistrationDenialFromState(
  state: GameStateRow | null | undefined,
  options?: { stateFetchFailed?: boolean }
): string | null {
  if (!state) {
    return options?.stateFetchFailed ? REGISTRATION_MESSAGES.unknown : REGISTRATION_MESSAGES.closed
  }
  if (isGameClosed(state)) return REGISTRATION_MESSAGES.closed
  if (isGameFinished(state)) return REGISTRATION_MESSAGES.finished
  if (!isGameInLobby(state)) return REGISTRATION_MESSAGES.started
  return null
}

export async function getRegistrationDenial(gameId: string): Promise<string | null> {
  const state = await fetchGameStateForGame(gameId)
  return getRegistrationDenialFromState(state)
}

/** Игрок опоздал: игра уже идёт, а команда зарегистрирована после старта. */
/** Допуск на гонку «старт» vs «insert» на медленной сети (мс). */
const LATE_JOIN_GRACE_MS = 2000

async function fetchPlayAccessState(gameId: string): Promise<GameStateRow | null> {
  invalidateGameStateCache(gameId)
  return fetchGameStateForGame(gameId, { force: true })
}

export async function getPlayAccessDenial(
  gameId: string,
  teamId: string
): Promise<string | null> {
  const state = await fetchPlayAccessState(gameId)
  if (!state) return PLAY_MESSAGES.invalid_session
  if (isGameClosed(state)) return PLAY_MESSAGES.closed

  try {
    const exists = await teamExistsInGame(gameId, teamId)
    if (!exists) return PLAY_MESSAGES.invalid_session
  } catch (err) {
    if (isTransientNetworkError(err)) throw err
    return PLAY_MESSAGES.access_check_failed
  }

  if (isGameInLobby(state)) return null

  const { data: team, error } = await supabase
    .from('teams')
    .select('game_id, registration_time')
    .eq('id', teamId)
    .maybeSingle()

  if (error) {
    if (isTransientNetworkError(error)) throw error
    return PLAY_MESSAGES.invalid_session
  }
  if (!team || team.game_id !== gameId) {
    return PLAY_MESSAGES.invalid_session
  }

  const startedAt = getGameStartedAt(state)
  if (startedAt && team.registration_time) {
    const regMs = new Date(team.registration_time).getTime()
    const startMs = new Date(startedAt).getTime()
    if (Number.isFinite(regMs) && Number.isFinite(startMs) && regMs > startMs + LATE_JOIN_GRACE_MS) {
      return PLAY_MESSAGES.late_join
    }
  }

  return null
}

export type FinishAccessOptions = {
  hasFinishNavigation?: boolean
}

export type FinishAccessResult = {
  allowed: boolean
  message?: string
  /** Игра ещё идёт, но команда уже прошла свои вопросы — ждём финиша ведущего. */
  waitingForFinish?: boolean
  /** Показывать очки на player scoreboard (после финиша или если табло не скрыто). */
  showScores?: boolean
  gameId?: string
}

async function teamExistsInGame(gameId: string, teamId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('teams')
    .select('id')
    .eq('id', teamId)
    .eq('game_id', gameId)
    .maybeSingle()

  if (error) {
    if (isTransientNetworkError(error)) throw error
    return false
  }
  return !!data
}

/** Команда ещё зарегистрирована в этой игре (не удалена админом). */
export async function isTeamStillRegistered(gameId: string, teamId: string): Promise<boolean> {
  return teamExistsInGame(gameId, teamId)
}

/** Доступ к табло / поздравлению только для участников этой сессии. */
export async function verifyFinishPageAccess(
  gameCode: string,
  options?: FinishAccessOptions
): Promise<FinishAccessResult> {
  const session = readStoredPlayerSession(gameCode)
  if (!session) {
    return { allowed: false, message: FINISH_MESSAGES.no_session }
  }

  const code = gameCode.trim().toUpperCase()
  const persistedFinish = readFinishNavigateState(code)
  const hasFinishNavigation =
    !!options?.hasFinishNavigation || !!persistedFinish?.game

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, settings')
    .eq('code', code)
    .maybeSingle()

  if (gameError || !game) {
    if (hasFinishNavigation && (gameError ? isTransientNetworkError(gameError) : persistedFinish)) {
      return { allowed: true, showScores: false, waitingForFinish: true }
    }
    return { allowed: false, message: 'Игра не найдена.' }
  }

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, game_id, registration_time')
    .eq('id', session.teamId)
    .maybeSingle()

  if (teamError || !team || team.game_id !== game.id) {
    if (hasFinishNavigation && teamError && isTransientNetworkError(teamError)) {
      return {
        allowed: true,
        showScores: false,
        waitingForFinish: true,
        gameId: game.id,
      }
    }
    return { allowed: false, message: FINISH_MESSAGES.wrong_team }
  }

  let state: GameStateRow | null = null
  try {
    state = await fetchGameStateForGame(game.id)
  } catch (err) {
    if (hasFinishNavigation && isTransientNetworkError(err)) {
      return {
        allowed: true,
        showScores: false,
        waitingForFinish: true,
        gameId: game.id,
      }
    }
    return { allowed: false, message: 'Не удалось проверить состояние игры.' }
  }

  const hideUntilFinish = isScoreboardHiddenUntilFinish(game.settings)
  const gameFinished = isGameFinished(state)

  if (gameFinished) {
    const startedAt = getGameStartedAt(state)
    if (
      startedAt &&
      team.registration_time &&
      new Date(team.registration_time) >= new Date(startedAt)
    ) {
      return { allowed: false, message: FINISH_MESSAGES.not_participant }
    }
    return { allowed: true, showScores: true, gameId: game.id }
  }

  if (hideUntilFinish) {
    if (hasFinishNavigation) {
      return {
        allowed: true,
        waitingForFinish: true,
        showScores: false,
        gameId: game.id,
      }
    }
    return { allowed: false, message: FINISH_MESSAGES.not_yet }
  }

  if (hasFinishNavigation) {
    return { allowed: true, showScores: true, gameId: game.id }
  }

  const sessionToken = getTeamSessionToken(session.teamId)
  if (sessionToken && game?.id) {
    const { data: hasAnswers, error: answersError } = await supabase.rpc('team_has_answers', {
      p_team_id: session.teamId,
      p_game_id: game.id,
      p_session_token: sessionToken,
    })
    if (!answersError && hasAnswers === true) {
      return { allowed: true, showScores: true, gameId: game.id }
    }
  }

  return { allowed: false, message: FINISH_MESSAGES.not_yet }
}
