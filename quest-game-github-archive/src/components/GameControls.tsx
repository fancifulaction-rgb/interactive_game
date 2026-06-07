import { useState, useEffect, useRef } from 'react'
import {
  Pause,
  Play,
  AlertCircle,
  Users,
  Rocket,
  Flag,
  RotateCcw,
  Trash2,
  Presentation,
  Eraser,
} from 'lucide-react'
import { fetchGameStateForGame } from '../lib/fetchGameState'
import { deleteGameCompletely } from '../lib/deleteGame'
import { ADMIN_SESSION_HINT, hasSupabaseAdminSession } from '../lib/adminAuth'
import { formatErrorMessage } from '../lib/errorMessage'
import { enqueueCritical } from '../lib/requestQueue'
import { attachGameRealtime } from '../lib/gameRealtime'
import { fetchLobbyTeams, invalidateLobbyTeamsCache } from '../lib/fetchLobbyTeams'
import { agentDebugLog } from '../lib/debugLog'
import {
  finishGameSession,
  pauseGameSession,
  restartGameSessionFromScratch,
  restartGameSessionToLobby,
  resumeGameSession,
  startGameSession,
} from '../lib/gameSessionControl'
import {
  getGameSessionStatus,
  getGameSessionStatusLabel,
  getGameStartedAt,
  type GameStateRow,
} from '../lib/gameSessionState'
import RegistrationQrCard from './RegistrationQrCard'
import { useNavigate } from 'react-router-dom'

export interface GameControlsGame {
  id: string
  title: string
  code: string | null
}

interface GameControlsProps {
  games: GameControlsGame[]
  gamesLoading?: boolean
  gamesError?: string
  onRefreshGames?: () => void
}

type LobbyTeam = {
  id: string
  team_name: string | null
  name: string | null
  captain_name: string | null
}

export default function GameControls({
  games,
  gamesLoading = false,
  gamesError = '',
  onRefreshGames,
}: GameControlsProps) {
  const navigate = useNavigate()
  const [selectedGameId, setSelectedGameId] = useState<string>('')
  const [gameState, setGameState] = useState<GameStateRow | null>(null)
  const [teams, setTeams] = useState<LobbyTeam[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const teamsLoadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const adminBusyRef = useRef(false)

  useEffect(() => {
    setSelectedGameId((current) => {
      if (games.length === 0) return ''
      if (games.some((g) => g.id === current)) return current
      return games[0].id
    })
  }, [games])

  useEffect(() => {
    if (!selectedGameId) return

    void loadGameState()
    void loadTeams(true)
    const unsubRt = subscribeToRealtime()

    return () => {
      if (teamsLoadTimer.current) clearTimeout(teamsLoadTimer.current)
      unsubRt()
    }
  }, [selectedGameId])

  const loadGameState = async () => {
    try {
      setGameState(await fetchGameStateForGame(selectedGameId))
    } catch (err: unknown) {
      console.error('Ошибка загрузки состояния игры:', err)
    }
  }

  const loadTeams = async (force = false, acceptEmpty = false) => {
    try {
      const data = await fetchLobbyTeams(selectedGameId, { force })
      setTeams((prev) => {
        const next = acceptEmpty
          ? data
          : data.length > 0
            ? data
            : prev.length > 0
              ? prev
              : data
        // #region agent log
        agentDebugLog(
          'GameControls.tsx',
          'teams updated',
          {
            gameId: selectedGameId,
            serverCount: data.length,
            prevCount: prev.length,
            force,
            acceptEmpty,
          },
          'H6'
        )
        if (!acceptEmpty && data.length === 0 && prev.length > 0) {
          agentDebugLog(
            'GameControls.tsx',
            'empty teams fetch kept prev',
            { gameId: selectedGameId, prevCount: prev.length },
            'H6'
          )
        }
        // #endregion
        return next
      })
    } catch (err: unknown) {
      console.error('Ошибка загрузки команд:', err)
    }
  }

  const teamDisplayName = (t: LobbyTeam) => (t.team_name || t.name || 'Команда').trim()

  const scheduleTeamsReload = () => {
    if (adminBusyRef.current) return
    if (teamsLoadTimer.current) clearTimeout(teamsLoadTimer.current)
    teamsLoadTimer.current = setTimeout(() => {
      teamsLoadTimer.current = null
      if (adminBusyRef.current) return
      void loadTeams(true)
    }, 300)
  }

  const subscribeToRealtime = () => {
    const detachRt = attachGameRealtime(selectedGameId, {
      onSessionChanged: () => {
        void loadGameState()
      },
      onTeamsChanged: scheduleTeamsReload,
    })

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !adminBusyRef.current) {
        void loadGameState()
        void loadTeams(true)
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    const pollTimer = setInterval(() => {
      if (document.hidden || adminBusyRef.current) return
      void loadGameState()
      void loadTeams(false)
    }, 30000)

    return () => {
      clearInterval(pollTimer)
      document.removeEventListener('visibilitychange', onVisible)
      detachRt()
    }
  }

  const runAction = async (action: () => Promise<void>) => {
    if (!selectedGameId) return
    adminBusyRef.current = true
    setLoading(true)
    try {
      await enqueueCritical(async () => {
        await action()
        await loadGameState()
        await loadTeams(true, true)
      })
    } catch (err: unknown) {
      console.error('Ошибка управления игрой:', err)
      agentDebugLog(
        'GameControls.tsx',
        'runAction error',
        { msg: formatErrorMessage(err).slice(0, 120) },
        'H21'
      )
      alert('Ошибка: ' + formatErrorMessage(err))
    } finally {
      adminBusyRef.current = false
      setLoading(false)
    }
  }

  const startGame = () => runAction(() => startGameSession(selectedGameId))

  const resumeGame = () => runAction(() => resumeGameSession(selectedGameId))

  const pauseGame = () => runAction(() => pauseGameSession(selectedGameId))

  const finishGame = () => {
    if (
      !confirm(
        'Завершить игру для всех участников?\n\nИгроки увидят финальный экран (табло или поздравление). Состояние можно сбросить кнопкой «Запустить заново».'
      )
    ) {
      return
    }
    void runAction(() => finishGameSession(selectedGameId))
  }

  const restartToLobby = () => {
    if (
      !confirm(
        'Запустить игру заново?\n\nКоманды останутся зарегистрированными, но все ответы и очки будут сброшены, табло очистится. Игра вернётся в комнату ожидания — затем нажмите «Начать игру».'
      )
    ) {
      return
    }
    void runAction(async () => {
      await restartGameSessionToLobby(selectedGameId)
      await loadTeams(true)
    })
  }

  const restartFromScratch = async () => {
    if (!(await hasSupabaseAdminSession())) {
      alert(ADMIN_SESSION_HINT)
      return
    }
    if (
      !confirm(
        'Начать с нуля?\n\nБудут удалены ВСЕ зарегистрированные команды, ответы и очки. Игра вернётся в пустую комнату ожидания — участникам нужно зарегистрироваться заново.\n\nЭто действие нельзя отменить.'
      )
    ) {
      return
    }
    void runAction(async () => {
      invalidateLobbyTeamsCache(selectedGameId)
      await restartGameSessionFromScratch(selectedGameId)
      setTeams([])
    })
  }

  const deleteSelectedGame = async () => {
    if (!selectedGameId || deleting) return

    if (!(await hasSupabaseAdminSession())) {
      alert(ADMIN_SESSION_HINT)
      return
    }

    const game = games.find((g) => g.id === selectedGameId)
    const label = game ? `${game.title} (${game.code})` : 'эту игру'

    if (
      !confirm(
        `Удалить ${label}?\n\nВсе вопросы, команды, ответы и медиафайлы будут удалены безвозвратно.`
      )
    ) {
      return
    }

    adminBusyRef.current = true
    setDeleting(true)
    try {
      const result = await enqueueCritical(() => deleteGameCompletely(selectedGameId))
      if (!result.success) {
        throw new Error(result.error || 'Неизвестная ошибка')
      }
      setSelectedGameId('')
      setGameState(null)
      setTeams([])
      onRefreshGames?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Ошибка удаления игры:', err)
      alert('Ошибка удаления игры: ' + msg)
    } finally {
      adminBusyRef.current = false
      setDeleting(false)
    }
  }

  const selectedGame = games.find((g) => g.id === selectedGameId)
  const status = getGameSessionStatus(gameState)
  const statusLabel = getGameSessionStatusLabel(status)
  const missingStartedAt = status !== 'waiting' && !getGameStartedAt(gameState)

  const statusColor =
    status === 'waiting'
      ? 'text-purple-600'
      : status === 'paused'
        ? 'text-orange-600'
        : status === 'finished'
          ? 'text-gray-600'
          : 'text-green-600'

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
        <AlertCircle className="w-5 h-5" />
        Управление игрой
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Выберите игру
          </label>
          <select
            value={selectedGameId}
            onChange={(e) => setSelectedGameId(e.target.value)}
            disabled={gamesLoading && games.length === 0}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-60"
          >
            {gamesLoading && games.length === 0 ? (
              <option value="">Загрузка игр…</option>
            ) : games.length === 0 ? (
              <option value="">Нет игр</option>
            ) : (
              games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.title} ({game.code})
                </option>
              ))
            )}
          </select>
          {gamesError && (
            <p className="mt-2 text-sm text-red-600">
              {gamesError}{' '}
              {onRefreshGames && (
                <button
                  type="button"
                  onClick={onRefreshGames}
                  className="underline hover:text-red-800"
                >
                  Повторить
                </button>
              )}
            </p>
          )}
          {!gamesError && games.length === 0 && !gamesLoading && onRefreshGames && (
            <p className="mt-2 text-sm text-gray-500">
              Список пуст.{' '}
              <button type="button" onClick={onRefreshGames} className="text-purple-600 underline">
                Обновить
              </button>
            </p>
          )}
        </div>

        {selectedGame && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            {selectedGame.code && (
              <>
                <RegistrationQrCard gameCode={selectedGame.code} gameTitle={selectedGame.title} />
                <button
                  type="button"
                  onClick={() => navigate(`/host/${selectedGame.code}`)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-sm font-medium"
                >
                  <Presentation className="w-4 h-4" />
                  Открыть экран ведущего (проектор)
                </button>
              </>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Статус</p>
                <p className={`text-lg font-bold ${statusColor}`}>{statusLabel}</p>
              </div>
              <div className="text-right flex items-center gap-2 text-gray-700">
                <Users className="w-4 h-4" />
                <span className="font-semibold">{teams.length}</span>
                <span className="text-sm text-gray-500">команд</span>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Зарегистрированные команды ({teams.length})
              </p>
              {teams.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">Пока никто не зарегистрировался</p>
              ) : (
                <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                  {teams.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                    >
                      <span className="font-medium text-gray-800">{teamDisplayName(t)}</span>
                      {t.captain_name && (
                        <span className="text-gray-500 text-xs ml-2 truncate">{t.captain_name}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {missingStartedAt && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-medium mb-1">Совет: время старта сессии не зафиксировано</p>
                <p className="text-amber-800">
                  Если эта игра уже шла до обновления системы, метка{' '}
                  <span className="font-medium">startedAt</span> могла не записаться. Тогда
                  ограничение «опоздавшие не присоединяются» работает неполностью. Один раз нажмите{' '}
                  <span className="font-medium">«Запустить заново»</span>, затем{' '}
                  <span className="font-medium">«Начать игру»</span> — время старта сохранится.
                  Блокировка новой регистрации после старта и завершения действует сразу.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {status === 'waiting' && (
                <button
                  type="button"
                  onClick={startGame}
                  disabled={loading || deleting}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Rocket className="w-5 h-5" />
                  Начать игру
                </button>
              )}

              {status === 'playing' && (
                <button
                  type="button"
                  onClick={pauseGame}
                  disabled={loading || deleting}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Pause className="w-5 h-5" />
                  Приостановить
                </button>
              )}

              {status === 'paused' && (
                <button
                  type="button"
                  onClick={resumeGame}
                  disabled={loading || deleting}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-5 h-5" />
                  Продолжить игру
                </button>
              )}

              {(status === 'playing' || status === 'paused') && (
                <button
                  type="button"
                  onClick={finishGame}
                  disabled={loading || deleting}
                  className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-medium border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Flag className="w-4 h-4" />
                  Завершить игру
                </button>
              )}

              {status !== 'waiting' && (
                <button
                  type="button"
                  onClick={restartToLobby}
                  disabled={loading || deleting}
                  className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-medium border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-4 h-4" />
                  Запустить заново (сброс очков и ответов)
                </button>
              )}

              <button
                type="button"
                onClick={() => void restartFromScratch()}
                disabled={loading || deleting}
                className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-medium border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Eraser className="w-4 h-4" />
                Начать с нуля (удалить все команды)
              </button>

              <button
                type="button"
                onClick={() => void deleteSelectedGame()}
                disabled={loading || deleting}
                className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-medium border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Удаление…' : 'Удалить игру'}
              </button>
            </div>

            {status === 'paused' && gameState?.paused_at && (
              <p className="text-xs text-gray-500 text-center">
                Приостановлена {new Date(gameState.paused_at).toLocaleString('ru-RU')}
                {gameState.paused_by ? ` · ${gameState.paused_by}` : ''}
              </p>
            )}

            {status === 'finished' && (
              <p className="text-xs text-gray-500 text-center">
                Игроки перенаправлены на финальный экран. «Запустить заново» сбросит ответы и очки,
                вернёт команды в лобби — затем «Начать игру».
              </p>
            )}

            {status === 'waiting' && teams.length === 0 && (
              <p className="text-xs text-amber-700 text-center">
                Команды ещё не зарегистрировались — можно начать, когда будете готовы.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
