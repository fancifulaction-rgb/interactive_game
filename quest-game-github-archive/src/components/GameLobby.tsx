import { useCallback, useEffect, useRef, useState } from 'react'
import { Users, Hourglass } from 'lucide-react'
import { getGamePlayCache, updateTeamsSnapshot } from '../lib/gamePlayCache'
import { attachGameRealtime } from '../lib/gameRealtime'
import { agentDebugLog } from '../lib/debugLog'
import { fetchLobbyTeams } from '../lib/fetchLobbyTeams'

type LobbyTeam = {
  id: string
  team_name: string | null
  name: string | null
  captain_name: string | null
}

interface GameLobbyProps {
  gameId: string
  gameCode?: string
  gameTitle: string
  myTeamName?: string | null
  myTeamId?: string | null
  onMyTeamRemoved?: () => void
}

function lobbyTeamsPollMs(): number {
  if (typeof navigator === 'undefined') return 12000
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 20000 : 12000
}

const LOBBY_RETRY_DELAYS_MS = [600, 1500]

function displayName(t: LobbyTeam) {
  return (t.team_name || t.name || 'Команда').trim()
}

function snapshotToLobbyTeams(
  snapshot: { id: string; team_name: string; captain_name: string }[]
): LobbyTeam[] {
  return snapshot.map((t) => ({
    id: t.id,
    team_name: t.team_name,
    name: t.team_name,
    captain_name: t.captain_name,
  }))
}

function sortLobbyTeams(list: LobbyTeam[]): LobbyTeam[] {
  return [...list].sort((a, b) => displayName(a).localeCompare(displayName(b), 'ru'))
}

type LobbyConnectionState = 'checking' | 'ok' | 'offline'

export default function GameLobby({
  gameId,
  gameCode,
  gameTitle,
  myTeamName,
  myTeamId,
  onMyTeamRemoved,
}: GameLobbyProps) {
  const loadInFlightRef = useRef(false)
  const [connectionState, setConnectionState] = useState<LobbyConnectionState>('checking')
  const [teams, setTeams] = useState<LobbyTeam[]>(() => {
    const code = (gameCode ?? '').trim().toUpperCase()
    if (!code) return []
    const cached = getGamePlayCache(code)
    return cached?.teamsSnapshot?.length
      ? snapshotToLobbyTeams(cached.teamsSnapshot)
      : []
  })

  const loadTeams = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (loadInFlightRef.current) return
    loadInFlightRef.current = true

    const code = (gameCode ?? '').trim().toUpperCase()

    try {
    for (let attempt = 0; attempt < LOBBY_RETRY_DELAYS_MS.length; attempt++) {
      try {
        const data = await fetchLobbyTeams(gameId)
        const next = sortLobbyTeams(data)
        setTeams(next)
        if (myTeamId && !next.some((t) => t.id === myTeamId)) {
          onMyTeamRemoved?.()
        }
        // #region agent log
        agentDebugLog(
          'GameLobby.tsx',
          'loadTeams ok',
          {
            gameId,
            serverCount: data.length,
            mergedCount: next.length,
          },
          'H6'
        )
        // #endregion
        if (code) {
          updateTeamsSnapshot(
            code,
            next.map((t) => ({
              id: t.id,
              team_name: displayName(t),
              captain_name: t.captain_name ?? '',
              avatar_url: null,
              total_score: 0,
            }))
          )
        }
        setConnectionState(typeof navigator !== 'undefined' && navigator.onLine ? 'ok' : 'offline')
        return
      } catch (error) {
        if (attempt < LOBBY_RETRY_DELAYS_MS.length - 1) {
          await new Promise((r) => setTimeout(r, LOBBY_RETRY_DELAYS_MS[attempt]))
        } else {
          console.error('GameLobby: не удалось загрузить команды', error)
          setConnectionState('offline')
        }
      }
    }
    } finally {
      loadInFlightRef.current = false
    }
  }, [gameId, gameCode, myTeamId, onMyTeamRemoved])

  useEffect(() => {
    const onOnline = () => {
      setConnectionState('checking')
      void loadTeams()
    }
    const onOffline = () => setConnectionState('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [loadTeams])

  useEffect(() => {
    void loadTeams()

    const detachRt = attachGameRealtime(gameId, {
      onTeamsChanged: () => {
        void loadTeams()
      },
    })

    const pollTimer = setInterval(() => {
      void loadTeams()
    }, lobbyTeamsPollMs())

    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadTeams()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      detachRt()
      clearInterval(pollTimer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [gameId, loadTeams])

  return (
    <div className="min-h-screen theme-background flex items-center justify-center p-4" style={{
      background: 'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)',
    }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Hourglass className="w-8 h-8 text-purple-600 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">{gameTitle}</h1>
          <p className="text-gray-600">Комната ожидания</p>
          {myTeamName && (
            <p className="text-sm text-purple-700 mt-2 font-medium">Вы: {myTeamName}</p>
          )}
        </div>

        <div className="bg-purple-50 rounded-xl p-4 mb-6 text-center">
          <p className="text-gray-700">
            Ожидайте сигнала ведущего. Игра начнётся, когда администратор нажмёт{' '}
            <span className="font-semibold">«Начать игру»</span>.
          </p>
          <div
            className={`flex items-center justify-center gap-2 mt-3 text-sm font-medium ${
              connectionState === 'offline' ? 'text-amber-800' : 'text-purple-700'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                connectionState === 'offline'
                  ? 'bg-amber-500'
                  : connectionState === 'ok'
                    ? 'bg-purple-600 animate-pulse'
                    : 'bg-purple-400 animate-pulse'
              }`}
            />
            <span>
              {connectionState === 'offline'
                ? 'Нет связи с сервером. Включите интернет — обновление продолжится автоматически.'
                : connectionState === 'ok'
                  ? 'Подключение активно'
                  : 'Проверка связи…'}
            </span>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Команды ({teams.length})
          </h2>
          {teams.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">Загрузка списка команд…</p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {teams.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm"
                >
                  <span className="font-medium text-gray-800">{displayName(t)}</span>
                  {t.captain_name && (
                    <span className="text-gray-500 text-xs">{t.captain_name}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
