import { supabase } from './supabase'
import { debugLog } from './debugLog'
import { fetchGameStateForGame } from './fetchGameState'
import { isScoreboardHiddenUntilFinish } from './gameSettings'
import {
  getGameStartedAt,
  isGameFinished,
  isGameInLobby,
} from './gameSessionState'

export const REGISTRATION_MESSAGES = {
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
  invalid_session: 'Сессия команды недействительна. Зарегистрируйтесь для этой игры.',
  late_join: 'Игра уже началась. Вы не успели присоединиться к этой сессии.',
} as const

export function readStoredPlayerSession(gameCode: string): { teamId: string } | null {
  const teamId = localStorage.getItem('team_id')
  const storedCode = (localStorage.getItem('game_code') ?? '').trim().toUpperCase()
  const code = gameCode.trim().toUpperCase()
  if (!teamId || storedCode !== code) return null
  return { teamId }
}

/** Можно ли регистрировать новую команду (только комната ожидания). */
export async function getRegistrationDenial(gameId: string): Promise<string | null> {
  const state = await fetchGameStateForGame(gameId)
  if (isGameFinished(state)) return REGISTRATION_MESSAGES.finished
  if (!isGameInLobby(state)) return REGISTRATION_MESSAGES.started
  return null
}

/** Игрок опоздал: игра уже идёт, а команда зарегистрирована после старта. */
export async function getPlayAccessDenial(
  gameId: string,
  teamId: string
): Promise<string | null> {
  const state = await fetchGameStateForGame(gameId)
  if (isGameInLobby(state)) return null

  const { data: team, error } = await supabase
    .from('teams')
    .select('game_id, registration_time')
    .eq('id', teamId)
    .maybeSingle()

  if (error || !team || team.game_id !== gameId) {
    return PLAY_MESSAGES.invalid_session
  }

  const startedAt = getGameStartedAt(state)
  if (startedAt && team.registration_time) {
    if (new Date(team.registration_time) >= new Date(startedAt)) {
      return PLAY_MESSAGES.late_join
    }
  }

  return null
}

export type FinishAccessOptions = {
  hasFinishNavigation?: boolean
}

/** Доступ к табло / поздравлению только для участников этой сессии. */
export async function verifyFinishPageAccess(
  gameCode: string,
  options?: FinishAccessOptions
): Promise<{ allowed: boolean; message?: string }> {
  const session = readStoredPlayerSession(gameCode)
  if (!session) {
    return { allowed: false, message: FINISH_MESSAGES.no_session }
  }

  const code = gameCode.trim().toUpperCase()
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, settings')
    .eq('code', code)
    .maybeSingle()

  if (gameError || !game) {
    return { allowed: false, message: 'Игра не найдена.' }
  }

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, game_id, registration_time')
    .eq('id', session.teamId)
    .maybeSingle()

  if (teamError || !team || team.game_id !== game.id) {
    return { allowed: false, message: FINISH_MESSAGES.wrong_team }
  }

  const state = await fetchGameStateForGame(game.id)

  const hideUntilFinish = isScoreboardHiddenUntilFinish(game.settings)

  if (options?.hasFinishNavigation && !hideUntilFinish) {
    // #region agent log
    debugLog(
      'participantAccess.ts',
      'finish access via navigation',
      { code, teamId: session.teamId },
      'H3'
    )
    // #endregion
    return { allowed: true }
  }

  if (isGameFinished(state)) {
    const startedAt = getGameStartedAt(state)
    if (
      startedAt &&
      team.registration_time &&
      new Date(team.registration_time) >= new Date(startedAt)
    ) {
      return { allowed: false, message: FINISH_MESSAGES.not_participant }
    }
    return { allowed: true }
  }

  if (hideUntilFinish) {
    // #region agent log
    debugLog(
      'participantAccess.ts',
      'finish blocked hide_until_finish',
      { code, gameFinished: false },
      'H3'
    )
    // #endregion
    return { allowed: false, message: FINISH_MESSAGES.not_yet }
  }

  const { count, error: answersError } = await supabase
    .from('answers')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', session.teamId)

  if (!answersError && (count ?? 0) > 0) {
    return { allowed: true }
  }

  return { allowed: false, message: FINISH_MESSAGES.not_yet }
}
