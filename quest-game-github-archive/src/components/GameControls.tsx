import { useEffect, useState, type ReactNode } from 'react'
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
  DoorOpen,
  Lock,
  QrCode,
  ClipboardCheck,
  CalendarClock,
} from 'lucide-react'
import { deleteGameCompletely } from '../lib/deleteGame'
import { countQuestionsForGame } from '../lib/prefetchGameQuestions'
import { ADMIN_SESSION_HINT, hasSupabaseAdminSession } from '../lib/adminAuth'
import { clearAdminFetchBoost, markAdminFetchBoost } from '../lib/adminFetchBoost'
import { formatErrorMessage } from '../lib/errorMessage'
import { logAdminAction, nextAdminActionId } from '../lib/adminActionLog'
import { enqueueCritical } from '../lib/requestQueue'
import { agentDebugLog } from '../lib/debugLog'
import {
  closeGameSession,
  finishGameSession,
  openLobbySession,
  pauseGameSession,
  restartGameSessionFromScratch,
  restartGameSessionToLobby,
  resumeGameSession,
  startGameSession,
  type SessionActionResult,
} from '../lib/gameSessionControl'
import {
  getGameSessionStatus,
  getGameSessionStatusLabel,
  getGameStartedAt,
} from '../lib/gameSessionState'
import { useGameSessionAdminContext } from '../contexts/GameSessionAdminContext'
import { useTeamProgress } from '../hooks/useTeamProgress'
import { countFinishedTeams, teamProgressMap } from '../lib/teamProgress'
import RegistrationQrCard from './RegistrationQrCard'
import AnswerModerationPanel from './AnswerModerationPanel'
import TeamProgressBadge from './TeamProgressBadge'
import GameSchedulePanel from './GameSchedulePanel'
import { useNavigate } from 'react-router-dom'

export interface GameControlsGame {
  id: string
  title: string
  code: string | null
  join_token: string | null
}

interface GameControlsProps {
  games: GameControlsGame[]
  selectedGameId: string
  onSelectedGameIdChange: (gameId: string) => void
  gamesLoading?: boolean
  gamesError?: string
  onRefreshGames?: () => void
  hideGameSelector?: boolean
}

type LobbyTeam = {
  id: string
  team_name: string | null
  name: string | null
  captain_name: string | null
}

function ManageSectionCard({
  id,
  title,
  icon: Icon,
  iconClassName = 'text-purple-600',
  children,
}: {
  id?: string
  title: string
  icon: typeof AlertCircle
  iconClassName?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Icon className={`w-5 h-5 ${iconClassName}`} />
        {title}
      </h3>
      {children}
    </section>
  )
}

export default function GameControls({
  games,
  selectedGameId,
  onSelectedGameIdChange,
  gamesLoading = false,
  gamesError = '',
  onRefreshGames,
  hideGameSelector = false,
}: GameControlsProps) {
  const navigate = useNavigate()
  const session = useGameSessionAdminContext()
  const [loading, setLoading] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [questionCount, setQuestionCount] = useState<number | null>(null)

  const gameState = session?.gameState ?? null
  const teams = (session?.teams ?? []) as LobbyTeam[]
  const dataLoading = session?.dataLoading ?? false

  useEffect(() => {
    if (!selectedGameId) {
      setQuestionCount(null)
      return
    }
    let cancelled = false
    void countQuestionsForGame(selectedGameId)
      .then((count) => {
        if (!cancelled) setQuestionCount(count)
      })
      .catch(() => {
        if (!cancelled) setQuestionCount(null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedGameId, gameState?.updated_at])

  const applyActionResult = async (result: SessionActionResult) => {
    if (!session) return
    session.applyOptimisticState(result.gameState)
    if (result.teamsDeleted !== undefined && result.teamsDeleted >= 0) {
      session.setTeamsDirect([])
    }
    if (result.skipReload) {
      logAdminAction(nextAdminActionId('apply'), 'reload_skipped', {
        state: result.gameState.current_state,
      })
      return
    }
    await Promise.all([session.refreshGameState(true), session.refreshTeams(true, true)])
  }

  const runAction = async (
    action: () => Promise<SessionActionResult>,
    label = 'Выполняем операцию…'
  ) => {
    if (!selectedGameId || !session) return
    const actionId = nextAdminActionId(label)
    session.setAdminBusy(true)
    setLoading(true)
    setLoadingLabel(label)
    markAdminFetchBoost()
    logAdminAction(actionId, 'start', { gameId: selectedGameId, label })
    try {
      const result = await enqueueCritical(action)
      logAdminAction(actionId, 'rpc_done', { state: result.gameState.current_state })
      setLoadingLabel('Обновляем состояние…')
      await applyActionResult(result)
      if (result.archive) {
        if (result.archive.success) {
          console.info('Архив заезда сохранён:', result.archive.archiveId)
        } else {
          alert(
            `Игра завершена, но архив не сохранён: ${result.archive.error ?? 'неизвестная ошибка'}.\n\nПроверьте миграцию 014 (event_archive) и права доступа.`
          )
        }
      }
      logAdminAction(actionId, 'done', {})
    } catch (err: unknown) {
      console.error('Ошибка управления игрой:', err)
      logAdminAction(actionId, 'error', { msg: formatErrorMessage(err).slice(0, 160) })
      agentDebugLog(
        'GameControls.tsx',
        'runAction error',
        { msg: formatErrorMessage(err).slice(0, 120) },
        'H21'
      )
      alert('Ошибка: ' + formatErrorMessage(err))
    } finally {
      clearAdminFetchBoost()
      session.setAdminBusy(false)
      setLoading(false)
      setLoadingLabel('')
    }
  }

  const startGame = async () => {
    if (!selectedGameId) return
    let count = questionCount
    if (count === null) {
      try {
        count = await countQuestionsForGame(selectedGameId)
        setQuestionCount(count)
      } catch {
        alert('Не удалось проверить список вопросов. Попробуйте снова.')
        return
      }
    }
    if (count < 1) {
      alert(
        'Нельзя начать игру без вопросов.\n\nОткройте редактор (карандаш), добавьте вопросы и нажмите «Сохранить вопросы», затем снова «Начать игру».'
      )
      return
    }
    void runAction(() => startGameSession(selectedGameId))
  }
  const openLobby = () => runAction(() => openLobbySession(selectedGameId), 'Открываем лобби…')
  const resumeGame = () => runAction(() => resumeGameSession(selectedGameId))
  const pauseGame = () => runAction(() => pauseGameSession(selectedGameId))

  const closeGame = () => {
    if (
      !confirm(
        'Закрыть игру?\n\nУчастники не смогут зарегистрироваться и войти по коде, пока вы снова не откроете лобби.'
      )
    ) {
      return
    }
    void runAction(() => closeGameSession(selectedGameId), 'Закрываем игру…')
  }

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
    void runAction(() => restartGameSessionToLobby(selectedGameId))
  }

  const restartFromScratch = async () => {
    if (!(await hasSupabaseAdminSession())) {
      alert(ADMIN_SESSION_HINT)
      return
    }
    if (
      !confirm(
        'Начать с нуля?\n\nБудут удалены ВСЕ зарегистрированные команды, ответы и очки. Игра будет закрыта — участникам нужно дождаться открытия лобби администратором.\n\nЭто действие нельзя отменить.'
      )
    ) {
      return
    }
    void runAction(
      () => restartGameSessionFromScratch(selectedGameId),
      'Сброс прогресса и удаление команд…'
    )
  }

  const deleteSelectedGame = async () => {
    if (!selectedGameId || deleting || !session) return

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

    session.setAdminBusy(true)
    setDeleting(true)
    try {
      const result = await enqueueCritical(() => deleteGameCompletely(selectedGameId))
      if (!result.success) {
        throw new Error(result.error || 'Неизвестная ошибка')
      }
      session.setTeamsDirect([])
      session.applyOptimisticState({
        current_state: 'closed',
        is_paused: false,
        paused_at: null,
        paused_by: null,
        player_data: {},
      })
      onSelectedGameIdChange('')
      onRefreshGames?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Ошибка удаления игры:', err)
      alert('Ошибка удаления игры: ' + msg)
    } finally {
      session.setAdminBusy(false)
      setDeleting(false)
    }
  }

  const selectedGame = games.find((g) => g.id === selectedGameId)
  const statusKnown = !dataLoading
  const status = statusKnown ? getGameSessionStatus(gameState) : null
  const statusLabel = statusKnown && status ? getGameSessionStatusLabel(status) : 'Загрузка…'
  const missingStartedAt =
    statusKnown &&
    status != null &&
    (status === 'playing' || status === 'paused') &&
    !getGameStartedAt(gameState)

  const teamDisplayName = (t: LobbyTeam) => (t.team_name || t.name || 'Команда').trim()

  const showTeamProgress =
    status === 'playing' || status === 'paused' || status === 'finished'
  const { rows: progressRows } = useTeamProgress(
    selectedGameId,
    showTeamProgress && !!selectedGameId
  )
  const progressByTeam = teamProgressMap(progressRows)
  const finishedTeamCount = countFinishedTeams(progressRows)

  const statusColor =
    !statusKnown || !status
      ? 'text-gray-400'
      : status === 'closed'
        ? 'text-gray-500'
        : status === 'waiting'
          ? 'text-purple-600'
          : status === 'paused'
            ? 'text-orange-600'
            : status === 'finished'
              ? 'text-gray-600'
              : 'text-green-600'

  if (!session && selectedGameId) {
    return (
      <div className="space-y-4" id="game-controls">
        <ManageSectionCard title="Загрузка…" icon={AlertCircle}>
          <p className="text-sm text-gray-500">Загрузка контекста управления игрой…</p>
        </ManageSectionCard>
      </div>
    )
  }

  return (
    <div className="space-y-4" id="game-controls">
      {!hideGameSelector && (
        <ManageSectionCard title="Выбор игры" icon={AlertCircle}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Выберите игру</label>
            <select
              value={selectedGameId}
              onChange={(e) => onSelectedGameIdChange(e.target.value)}
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
          </div>
        </ManageSectionCard>
      )}

      {selectedGame && (
        <>
          <ManageSectionCard
            id="game-registration"
            title="QR для регистрации команд"
            icon={QrCode}
            iconClassName="text-indigo-600"
          >
            {dataLoading && !gameState && (
              <p className="text-sm text-gray-500 text-center py-2">Загрузка данных игры…</p>
            )}
            {!selectedGame.join_token ? (
              <p className="text-sm text-gray-500">
                Нет ссылки регистрации. Примените миграцию 032 (join_token) и обновите список игр.
              </p>
            ) : status === 'waiting' ? (
              <div className="space-y-3">
                <RegistrationQrCard
                  joinToken={selectedGame.join_token}
                  gameCode={selectedGame.code}
                  gameTitle={selectedGame.title}
                />
                <button
                  type="button"
                  onClick={() => navigate(`/host/${selectedGame.code}`)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-sm font-medium"
                >
                  <Presentation className="w-4 h-4" />
                  Открыть экран ведущего (проектор)
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                <p>
                  {status === 'closed'
                    ? 'Лобби закрыто. Откройте лобби, чтобы показать QR и принимать команды.'
                    : 'QR и регистрация доступны только в комнате ожидания. Экран ведущего:'}
                </p>
                {status !== 'closed' && (
                  <button
                    type="button"
                    onClick={() => navigate(`/host/${selectedGame.code}`)}
                    className="mt-2 inline-flex items-center gap-2 text-indigo-700 hover:underline text-sm font-medium"
                  >
                    <Presentation className="w-4 h-4" />
                    /host/{selectedGame.code}
                  </button>
                )}
              </div>
            )}
          </ManageSectionCard>

          <ManageSectionCard
            id="game-lobby"
            title="Комната ожидания"
            icon={DoorOpen}
            iconClassName="text-purple-600"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Статус</p>
                  <p className={`text-lg font-bold ${statusColor}`}>{statusLabel}</p>
                </div>
                <div className="text-right flex flex-col items-end gap-0.5 text-gray-700">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span className="font-semibold">{teams.length}</span>
                    <span className="text-sm text-gray-500">команд</span>
                  </div>
                  {showTeamProgress && teams.length > 0 && (
                    <span className="text-xs text-gray-500">
                      {finishedTeamCount} / {teams.length} прошли квест
                    </span>
                  )}
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
                  <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                    {teams.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-gray-800">{teamDisplayName(t)}</span>
                          {t.captain_name && (
                            <span className="text-gray-500 text-xs ml-2 truncate">{t.captain_name}</span>
                          )}
                        </div>
                        {showTeamProgress && (
                          <TeamProgressBadge
                            sessionStatus={status}
                            progress={progressByTeam.get(t.id)}
                            detailed
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {status === 'waiting' && teams.length === 0 && (
                <p className="text-xs text-amber-700 text-center">
                  Команды ещё не зарегистрировались — можно начать, когда будете готовы.
                </p>
              )}
            </div>
          </ManageSectionCard>

          <ManageSectionCard
            id="game-schedule"
            title="Формат игры"
            icon={CalendarClock}
            iconClassName="text-indigo-600"
          >
            <GameSchedulePanel
              gameId={selectedGameId}
              onScheduleChanged={() => {
                void session?.refreshGameState(true)
              }}
            />
          </ManageSectionCard>

          <ManageSectionCard
            id="game-session-control"
            title="Управление игрой"
            icon={AlertCircle}
          >
            <div className="space-y-3">
              {missingStartedAt && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-medium mb-1">Совет: время старта сессии не зафиксировано</p>
                  <p className="text-amber-800">
                    Если эта игра уже шла до обновления системы, метка{' '}
                    <span className="font-medium">startedAt</span> могла не записаться. Один раз нажмите{' '}
                    <span className="font-medium">«Запустить заново»</span>, затем{' '}
                    <span className="font-medium">«Начать игру»</span>.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {statusKnown && status && (
                  <>
                    {(status === 'closed' || status === 'finished') && (
                      <button
                        type="button"
                        onClick={openLobby}
                        disabled={loading || deleting}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <DoorOpen className="w-5 h-5" />
                        Открыть лобби
                      </button>
                    )}

                    {status === 'waiting' && questionCount === 0 && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <p className="font-medium mb-1">Нет сохранённых вопросов</p>
                        <p className="mb-2">
                          Игра не может начаться, пока в редакторе не добавлены и сохранены вопросы
                          («Сохранить вопросы»).
                        </p>
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/game/${selectedGameId}/edit`)}
                          className="text-purple-700 font-semibold hover:underline"
                        >
                          Открыть редактор →
                        </button>
                      </div>
                    )}

                    {status === 'waiting' && (
                      <button
                        type="button"
                        onClick={() => void startGame()}
                        disabled={loading || deleting || questionCount === 0}
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

                    {status !== 'waiting' && status !== 'closed' && (
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

                    {status !== 'closed' && (
                      <button
                        type="button"
                        onClick={closeGame}
                        disabled={loading || deleting}
                        className="w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-medium border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Lock className="w-4 h-4" />
                        Закрыть игру
                      </button>
                    )}
                  </>
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

              {loading && loadingLabel && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                  {loadingLabel}
                </p>
              )}

              {status === 'paused' && gameState?.paused_at && (
                <p className="text-xs text-gray-500 text-center">
                  Приостановлена {new Date(gameState.paused_at).toLocaleString('ru-RU')}
                  {gameState.paused_by ? ` · ${gameState.paused_by}` : ''}
                </p>
              )}

              {status === 'finished' && (
                <p className="text-xs text-gray-500 text-center">
                  Игроки перенаправлены на финальный экран. «Открыть лобби» — новый заезд; «Закрыть
                  игру» — доступ по коду будет недоступен.
                </p>
              )}

              {status === 'closed' && (
                <p className="text-xs text-gray-500 text-center">
                  Игра закрыта. Участники не могут войти по коду, пока вы не нажмёте «Открыть лобби».
                </p>
              )}
            </div>
          </ManageSectionCard>

          {selectedGameId && (
            <ManageSectionCard
              id="game-answer-moderation"
              title="Модерация ответов"
              icon={ClipboardCheck}
              iconClassName="text-indigo-600"
            >
              <AnswerModerationPanel gameId={selectedGameId} embedded />
            </ManageSectionCard>
          )}
        </>
      )}
    </div>
  )
}
