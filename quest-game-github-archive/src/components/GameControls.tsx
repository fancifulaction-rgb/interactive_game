import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  Pause,
  Play,
  AlertCircle,
  Users,
  Rocket,
  Flag,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { fetchGameStateForGame } from '../lib/fetchGameState'
import { deleteGameCompletely } from '../lib/deleteGame'
import { resetGameProgress } from '../lib/resetGameProgress'
import { ADMIN_SESSION_HINT, hasSupabaseAdminSession } from '../lib/adminAuth'
import {
  GAME_STATE_FINISHED,
  GAME_STATE_PLAYING,
  GAME_STATE_WAITING,
  getGameSessionStatus,
  getGameSessionStatusLabel,
  getGameStartedAt,
  type GameStateRow,
} from '../lib/gameSessionState'

interface Game {
  id: string
  title: string
  code: string | null
}

type LobbyTeam = {
  id: string
  team_name: string | null
  name: string | null
  captain_name: string | null
}

export default function GameControls() {
  const [games, setGames] = useState<Game[]>([])
  const [selectedGameId, setSelectedGameId] = useState<string>('')
  const [gameState, setGameState] = useState<GameStateRow | null>(null)
  const [teams, setTeams] = useState<LobbyTeam[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    void loadGames()
  }, [])

  useEffect(() => {
    if (!selectedGameId) return

    void loadGameState()
    void loadTeams()
    const unsubState = subscribeToGameState()
    const unsubTeams = subscribeToTeams()

    return () => {
      unsubState?.()
      unsubTeams?.()
    }
  }, [selectedGameId])

  const loadGames = async () => {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('id, title, code')
        .order('created_at', { ascending: false })

      if (error) throw error
      setGames(data || [])
      if (data && data.length > 0 && !selectedGameId) {
        setSelectedGameId(data[0].id)
      }
    } catch (err: unknown) {
      console.error('Ошибка загрузки игр:', err)
    }
  }

  const loadGameState = async () => {
    try {
      setGameState(await fetchGameStateForGame(selectedGameId))
    } catch (err: unknown) {
      console.error('Ошибка загрузки состояния игры:', err)
    }
  }

  const loadTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('id, team_name, name, captain_name')
        .eq('game_id', selectedGameId)
        .order('registration_time', { ascending: true })

      if (error) throw error
      setTeams(data ?? [])
    } catch (err: unknown) {
      console.error('Ошибка загрузки команд:', err)
    }
  }

  const teamDisplayName = (t: LobbyTeam) => (t.team_name || t.name || 'Команда').trim()

  const subscribeToGameState = () => {
    const channel = supabase
      .channel(`admin-game-state-${selectedGameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_state',
          filter: `game_id=eq.${selectedGameId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setGameState(payload.new as GameStateRow)
          } else if (payload.eventType === 'DELETE') {
            setGameState(null)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const subscribeToTeams = () => {
    const channel = supabase
      .channel(`admin-teams-${selectedGameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teams',
          filter: `game_id=eq.${selectedGameId}`,
        },
        () => {
          void loadTeams()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const upsertGameState = async (patch: Partial<GameStateRow>) => {
    const { data, error } = await supabase
      .from('game_state')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('game_id', selectedGameId)
      .select('id')

    if (error) throw error

    if (!data?.length) {
      const { error: insErr } = await supabase.from('game_state').insert({
        game_id: selectedGameId,
        ...patch,
      })
      if (insErr) throw insErr
    }

    await loadGameState()
  }

  const runAction = async (action: () => Promise<void>) => {
    if (!selectedGameId) return
    setLoading(true)
    try {
      await action()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Ошибка управления игрой:', err)
      alert('Ошибка: ' + msg)
    } finally {
      setLoading(false)
    }
  }

  const startGame = () =>
    runAction(async () => {
      const current = await fetchGameStateForGame(selectedGameId)
      const pd = { ...((current?.player_data as Record<string, unknown>) ?? {}) }
      if (!getGameStartedAt(current)) {
        pd.startedAt = new Date().toISOString()
      }
      await upsertGameState({
        current_state: GAME_STATE_PLAYING,
        is_paused: false,
        paused_at: null,
        paused_by: null,
        player_data: pd,
      })
    })

  const resumeGame = () =>
    runAction(() =>
      upsertGameState({
        current_state: GAME_STATE_PLAYING,
        is_paused: false,
        paused_at: null,
        paused_by: null,
      })
    )

  const pauseGame = () =>
    runAction(async () => {
      const adminUsername = localStorage.getItem('admin_username') || 'Администратор'
      await upsertGameState({
        current_state: GAME_STATE_PLAYING,
        is_paused: true,
        paused_at: new Date().toISOString(),
        paused_by: adminUsername,
      })
    })

  const finishGame = () => {
    if (
      !confirm(
        'Завершить игру для всех участников?\n\nИгроки увидят финальный экран (табло или поздравление). Состояние можно сбросить кнопкой «Запустить заново».'
      )
    ) {
      return
    }
    void runAction(() =>
      upsertGameState({
        current_state: GAME_STATE_FINISHED,
        is_paused: false,
        paused_at: null,
        paused_by: null,
      })
    )
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
      const result = await resetGameProgress(selectedGameId)
      if (!result.success) {
        throw new Error(result.error || 'Не удалось сбросить прогресс')
      }
      const current = await fetchGameStateForGame(selectedGameId)
      const pd = { ...((current?.player_data as Record<string, unknown>) ?? {}) }
      delete pd.startedAt
      await upsertGameState({
        current_state: GAME_STATE_WAITING,
        is_paused: false,
        paused_at: null,
        paused_by: null,
        player_data: pd,
      })
      await loadTeams()
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

    setDeleting(true)
    const snapshot = games
    setGames((prev) => prev.filter((g) => g.id !== selectedGameId))

    try {
      const result = await deleteGameCompletely(selectedGameId)
      if (!result.success) {
        throw new Error(result.error || 'Неизвестная ошибка')
      }
      setSelectedGameId('')
      setGameState(null)
      setTeams([])
      await loadGames()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Ошибка удаления игры:', err)
      setGames(snapshot)
      alert('Ошибка удаления игры: ' + msg)
    } finally {
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
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            {games.length === 0 ? (
              <option value="">Нет игр</option>
            ) : (
              games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.title} ({game.code})
                </option>
              ))
            )}
          </select>
        </div>

        {selectedGame && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
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
