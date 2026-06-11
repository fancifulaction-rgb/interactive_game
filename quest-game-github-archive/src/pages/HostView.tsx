import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'react-qr-code'
import {
  Flag,
  Pause,
  Play,
  Presentation,
  Rocket,
  RotateCcw,
  Trophy,
  Users,
  DoorOpen,
  Lock,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchGameStateForGame } from '../lib/fetchGameState'
import { attachGameRealtime, SCOREBOARD_POLL_FALLBACK_MS } from '../lib/gameRealtime'
import { hasSupabaseAdminSession } from '../lib/adminAuth'
import { normalizeGameAccessCode } from '../lib/gameAccessCode'
import {
  closeGameSession,
  finishGameSession,
  openLobbySession,
  pauseGameSession,
  restartGameSessionToLobby,
  resumeGameSession,
  startGameSession,
  type SessionActionResult,
} from '../lib/gameSessionControl'
import {
  getGameSessionStatus,
  getGameSessionStatusLabel,
  type GameStateRow,
} from '../lib/gameSessionState'
import { buildTeamRegistrationJoinUrl } from '../lib/registrationUrl'
import { clearAdminFetchBoost, markAdminFetchBoost } from '../lib/adminFetchBoost'
import { useTeamProgress } from '../hooks/useTeamProgress'
import { countFinishedTeams, teamProgressMap } from '../lib/teamProgress'
import TeamProgressBadge from '../components/TeamProgressBadge'

type HostTeam = {
  id: string
  team_name: string | null
  name: string | null
  captain_name: string | null
}

type HostGame = {
  id: string
  title: string
  code: string
  theme: string | null
  join_token: string | null
}

export default function HostView() {
  const { gameCode: rawCode } = useParams()
  const navigate = useNavigate()
  const gameCode = normalizeGameAccessCode(rawCode ?? '')

  const [game, setGame] = useState<HostGame | null>(null)
  const [gameState, setGameState] = useState<GameStateRow | null>(null)
  const [teams, setTeams] = useState<HostTeam[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [canControl, setCanControl] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const loadGame = useCallback(async () => {
    if (!gameCode) {
      setNotFound(true)
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('games')
      .select('id, title, code, theme, join_token')
      .eq('code', gameCode)
      .maybeSingle()

    if (error) throw error
    if (!data?.code) {
      setNotFound(true)
      setGame(null)
      return
    }
    setNotFound(false)
    setGame(data as HostGame)
    return data.id as string
  }, [gameCode])

  const loadTeams = useCallback(async (gameId: string) => {
    const { data, error } = await supabase
      .from('teams')
      .select('id, team_name, name, captain_name')
      .eq('game_id', gameId)
      .order('registration_time', { ascending: true })
    if (error) throw error
    setTeams(data ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      setLoading(true)
      try {
        const gameId = await loadGame()
        if (cancelled || !gameId) return
        setGameState(await fetchGameStateForGame(gameId))
        await loadTeams(gameId)
        setCanControl(await hasSupabaseAdminSession())
      } catch (err) {
        console.error('HostView init:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [loadGame, loadTeams])

  useEffect(() => {
    if (!game?.id) return

    const gameId = game.id
    let rtConnected = true

    const poll = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void loadTeams(gameId)
      if (!rtConnected) {
        void fetchGameStateForGame(gameId).then(setGameState).catch(() => {})
      }
    }, SCOREBOARD_POLL_FALLBACK_MS)

    const detach = attachGameRealtime(gameId, {
      onSessionChanged: () => {
        void fetchGameStateForGame(gameId).then(setGameState).catch(() => {})
      },
      onGameStateChanged: (row) => setGameState(row),
      onTeamsChanged: () => {
        void loadTeams(gameId)
      },
    })

    const stateChannel = supabase.channel(`host-rt-ping-${gameId}`)
    stateChannel.subscribe((status) => {
      rtConnected = status === 'SUBSCRIBED'
    })

    return () => {
      window.clearInterval(poll)
      detach()
      supabase.removeChannel(stateChannel)
    }
  }, [game?.id, loadTeams])

  const runAction = async (action: () => Promise<SessionActionResult>) => {
    if (!game?.id || !canControl) return
    setActionLoading(true)
    markAdminFetchBoost()
    try {
      const result = await action()
      setGameState(result.gameState)
      if (result.teamsDeleted !== undefined && result.teamsDeleted > 0) {
        setTeams([])
      } else if (!result.skipReload) {
        await loadTeams(game.id)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      alert('Ошибка: ' + msg)
    } finally {
      clearAdminFetchBoost()
      setActionLoading(false)
    }
  }

  const teamName = (t: HostTeam) => (t.team_name || t.name || 'Команда').trim()
  const status = getGameSessionStatus(gameState)
  const statusLabel = getGameSessionStatusLabel(status)
  const showTeamProgress =
    status === 'playing' || status === 'paused' || status === 'finished'
  const { rows: progressRows } = useTeamProgress(
    game?.id ?? '',
    showTeamProgress && !!game?.id
  )
  const progressByTeam = teamProgressMap(progressRows)
  const finishedTeamCount = countFinishedTeams(progressRows)
  const registrationUrl = game?.join_token ? buildTeamRegistrationJoinUrl(game.join_token) : ''

  const statusBadgeClass =
    status === 'closed'
      ? 'bg-slate-500/20 text-slate-200 border-slate-400/40'
      : status === 'waiting'
      ? 'bg-purple-500/20 text-purple-100 border-purple-400/40'
      : status === 'paused'
        ? 'bg-orange-500/20 text-orange-100 border-orange-400/40'
        : status === 'finished'
          ? 'bg-gray-500/20 text-gray-200 border-gray-400/40'
          : 'bg-green-500/20 text-green-100 border-green-400/40'

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="animate-pulse text-xl">Загрузка экрана ведущего…</div>
      </div>
    )
  }

  if (notFound || !game) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-8 text-center">
        <Presentation className="w-16 h-16 text-slate-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Игра не найдена</h1>
        <p className="text-slate-400 mb-6">Код «{gameCode || '—'}» не существует в системе.</p>
        <button
          type="button"
          onClick={() => navigate('/admin/panel')}
          className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 font-medium"
        >
          В админ-панель
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white">
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <Presentation className="w-8 h-8 text-indigo-300 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{game.title}</h1>
            {game.theme && <p className="text-sm text-slate-400 truncate">{game.theme}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border ${statusBadgeClass}`}
          >
            {statusLabel}
          </span>
          <Link
            to={`/scoreboard-admin/${game.code}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm"
          >
            <Trophy className="w-4 h-4" />
            Табло
          </Link>
        </div>
      </header>

      <main className="p-6 lg:p-10 grid lg:grid-cols-2 gap-10 max-w-7xl mx-auto">
        <section className="flex flex-col items-center justify-center text-center space-y-6">
          <p className="text-slate-400 text-lg uppercase tracking-widest">Код игры</p>
          <p className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-[0.2em] text-white">
            {game.code}
          </p>
          <p className="text-slate-300 text-lg">Сканируйте QR или введите код на телефоне</p>
          <div className="bg-white p-4 rounded-2xl shadow-2xl">
            <QRCode value={registrationUrl} size={240} level="M" />
          </div>
          <p className="text-xs text-slate-500 max-w-md break-all">{registrationUrl}</p>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-indigo-300" />
              <h2 className="text-2xl font-bold">
                Команды <span className="text-indigo-300">({teams.length})</span>
              </h2>
            </div>
            {showTeamProgress && teams.length > 0 && (
              <p className="text-sm text-slate-400">
                {finishedTeamCount} / {teams.length} прошли квест
              </p>
            )}
          </div>
          {teams.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 p-12 text-center text-slate-400 text-lg">
              Ожидаем регистрацию команд…
            </div>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-3 max-h-[28rem] overflow-y-auto pr-1">
              {teams.map((t, i) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10"
                >
                  <span className="w-8 h-8 rounded-full bg-indigo-600/40 flex items-center justify-center text-sm font-bold shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="font-semibold truncate">{teamName(t)}</p>
                    {t.captain_name && (
                      <p className="text-xs text-slate-400 truncate">{t.captain_name}</p>
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
        </section>
      </main>

      {canControl ? (
        <footer className="sticky bottom-0 border-t border-white/10 bg-slate-950/90 backdrop-blur px-6 py-4">
          <div className="max-w-4xl mx-auto flex flex-wrap gap-3 justify-center">
            {(status === 'closed' || status === 'finished') && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => void runAction(() => openLobbySession(game.id))}
                className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 font-bold disabled:opacity-50"
              >
                <DoorOpen className="w-5 h-5" />
                Открыть лобби
              </button>
            )}
            {status === 'waiting' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => void runAction(() => startGameSession(game.id))}
                className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-green-600 hover:bg-green-500 font-bold disabled:opacity-50"
              >
                <Rocket className="w-5 h-5" />
                Начать игру
              </button>
            )}
            {status === 'playing' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => void runAction(() => pauseGameSession(game.id))}
                className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 font-bold disabled:opacity-50"
              >
                <Pause className="w-5 h-5" />
                Пауза
              </button>
            )}
            {status === 'paused' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => void runAction(() => resumeGameSession(game.id))}
                className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-green-600 hover:bg-green-500 font-bold disabled:opacity-50"
              >
                <Play className="w-5 h-5" />
                Продолжить
              </button>
            )}
            {(status === 'playing' || status === 'paused') && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => {
                  if (
                    confirm(
                      'Завершить игру для всех участников? Игроки увидят финальный экран.'
                    )
                  ) {
                    void runAction(() => finishGameSession(game.id))
                  }
                }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/20 hover:bg-white/10 disabled:opacity-50"
              >
                <Flag className="w-5 h-5" />
                Завершить
              </button>
            )}
            {status !== 'waiting' && status !== 'closed' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => {
                  if (
                    confirm(
                      'Запустить заново? Ответы и очки сбросятся, команды останутся в лобби.'
                    )
                  ) {
                    void runAction(() => restartGameSessionToLobby(game.id))
                  }
                }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-purple-400/40 text-purple-200 hover:bg-purple-900/30 disabled:opacity-50"
              >
                <RotateCcw className="w-5 h-5" />
                Запустить заново
              </button>
            )}
            {status !== 'closed' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => {
                  if (
                    confirm(
                      'Закрыть игру? Участники не смогут войти по коду, пока лобби снова не откроют.'
                    )
                  ) {
                    void runAction(() => closeGameSession(game.id))
                  }
                }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/20 hover:bg-white/10 disabled:opacity-50"
              >
                <Lock className="w-5 h-5" />
                Закрыть игру
              </button>
            )}
          </div>
        </footer>
      ) : (
        <footer className="px-6 py-4 text-center text-sm text-slate-500 border-t border-white/5">
          Управление (старт, пауза) доступно после{' '}
          <Link to="/admin/login" className="text-indigo-300 hover:underline">
            входа администратора
          </Link>{' '}
          на этом устройстве. Табло и QR видны всем.
        </footer>
      )}
    </div>
  )
}
