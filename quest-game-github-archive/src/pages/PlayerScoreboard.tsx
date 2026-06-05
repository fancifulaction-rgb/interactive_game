import { useEffect, useState, useRef } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getGamePlayCache, updateTeamsSnapshot } from '../lib/gamePlayCache'
import type { TeamSnapshot } from '../lib/gamePlayCache'
import type { FinishNavigateState } from '../lib/finishNavigation'
import { fetchTeamsForScoreboard } from '../lib/loadScoreboardTeams'
import { tryUploadAvatarAfterGame } from '../lib/avatarAfterGame'
import { Trophy, Medal, Award } from 'lucide-react'
import AccessDeniedScreen from '../components/AccessDeniedScreen'
import { verifyFinishPageAccess } from '../lib/participantAccess'

const GAME_SELECT = 'id, code, title, mask_board'

export default function PlayerScoreboard() {
  const { gameCode } = useParams()
  const location = useLocation()
  const finishState = location.state as FinishNavigateState | null

  const [teams, setTeams] = useState<TeamSnapshot[]>([])
  const [game, setGame] = useState<{
    id: string
    code?: string
    title?: string
    mask_board?: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const realtimeEnabledRef = useRef(false)

  useEffect(() => {
    const code = (gameCode ?? '').trim().toUpperCase()
    if (!code) return

    let cancelled = false
    setAccessDenied(null)
    setLoading(true)

    void (async () => {
      const access = await verifyFinishPageAccess(code, {
        hasFinishNavigation: !!finishState?.game,
      })
      if (cancelled) return
      if (!access.allowed) {
        setAccessDenied(access.message ?? 'Доступ закрыт')
        setLoading(false)
        return
      }

      if (finishState?.game) {
        const g = finishState.game as { id: string; title?: string; mask_board?: boolean }
        setGame({ id: g.id, title: g.title, mask_board: g.mask_board })
        if (finishState.teamsPreview?.length) {
          setTeams(finishState.teamsPreview)
        }
      } else {
        const cached = getGamePlayCache(code)
        if (cached?.game?.id) {
          const g = cached.game as { id: string; code?: string; title?: string; mask_board?: boolean }
          setGame({
            id: g.id,
            code: g.code as string,
            title: g.title as string,
            mask_board: g.mask_board as boolean,
          })
          if (cached.teamsSnapshot?.length) {
            setTeams(cached.teamsSnapshot)
          }
        }
      }

      tryUploadAvatarAfterGame(localStorage.getItem('team_id'))

      try {
        let gameId =
          finishState?.gameId ??
          (finishState?.game?.id as string | undefined) ??
          (getGamePlayCache(code)?.game?.id as string | undefined)
        if (!gameId) {
          const { data: gameData, error: gameError } = await supabase
            .from('games')
            .select(GAME_SELECT)
            .eq('code', code)
            .maybeSingle()
          if (gameError) throw gameError
          if (!gameData || cancelled) return
          gameId = gameData.id
          if (!cancelled) setGame(gameData)
        }

        if (!gameId || cancelled) return

        const freshTeams = await fetchTeamsForScoreboard(gameId as string)
        if (!cancelled) {
          setTeams(freshTeams)
          updateTeamsSnapshot(code, freshTeams)
        }
      } catch (err) {
        console.error('Ошибка загрузки табло:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [gameCode, finishState])

  useEffect(() => {
    if (!game?.id || realtimeEnabledRef.current) return

    const timer = window.setTimeout(() => {
      if (realtimeEnabledRef.current) return
      realtimeEnabledRef.current = true

      const channel = supabase
        .channel(`teams-scoreboard-${game.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'teams',
            filter: `game_id=eq.${game.id}`,
          },
          () => {
            void fetchTeamsForScoreboard(game.id).then((data) => {
              setTeams(data)
              const code = (gameCode ?? '').trim().toUpperCase()
              if (code) updateTeamsSnapshot(code, data)
            })
          }
        )
        .subscribe()

      channelRef.current = channel
    }, 8000)

    return () => window.clearTimeout(timer)
  }, [game?.id, gameCode])

  const getMedalIcon = (position: number) => {
    if (position === 0) return <Trophy className="w-8 h-8 text-yellow-500" />
    if (position === 1) return <Medal className="w-8 h-8 text-gray-400" />
    if (position === 2) return <Award className="w-8 h-8 text-amber-700" />
    return null
  }

  if (accessDenied) {
    return <AccessDeniedScreen message={accessDenied} />
  }

  if (loading && teams.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
        <div className="text-white text-xl">Загрузка табло...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-pink-600 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white text-center">Табло результатов</h1>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">{game?.title || 'Игра'}</h2>
            <p className="text-white/80">
              Код игры: {gameCode} • {teams.length} команд участвует
            </p>
          </div>

          <div className="p-6">
            {teams.length === 0 ? (
              <div className="text-center py-12">
                <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">Пока нет зарегистрированных команд</p>
              </div>
            ) : (
              <div className="space-y-4">
                {teams.map((team, index) => (
                  <div
                    key={team.id}
                    className={`rounded-xl p-6 transition-all ${
                      index === 0
                        ? 'bg-gradient-to-r from-yellow-100 to-yellow-50 border-2 border-yellow-400 shadow-lg scale-105'
                        : index === 1
                          ? 'bg-gradient-to-r from-gray-100 to-gray-50 border-2 border-gray-400'
                          : index === 2
                            ? 'bg-gradient-to-r from-orange-100 to-orange-50 border-2 border-orange-400'
                            : 'bg-white border-2 border-gray-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                      <div className="flex items-center gap-4 sm:gap-6 flex-1 min-w-0">
                        <div className="flex-shrink-0 w-12 sm:w-16 text-center">
                          {getMedalIcon(index) || (
                            <span className="text-2xl sm:text-3xl font-bold text-gray-500">
                              {index + 1}
                            </span>
                          )}
                        </div>

                        {team.avatar_url && !game?.mask_board && (
                          <img
                            src={team.avatar_url}
                            alt={team.team_name}
                            className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover border-2 sm:border-4 border-white shadow-md flex-shrink-0"
                          />
                        )}

                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg sm:text-2xl font-bold text-gray-800 truncate">
                            {game?.mask_board ? '***' : team.team_name}
                          </h3>
                          <p className="text-sm sm:text-base text-gray-600 truncate">
                            Капитан: {game?.mask_board ? '***' : team.captain_name}
                          </p>
                        </div>
                      </div>

                      <div className="text-center sm:text-right flex-shrink-0">
                        <div className="text-3xl sm:text-4xl font-bold text-purple-600">
                          {team.total_score}
                        </div>
                        <p className="text-xs sm:text-sm text-gray-600">очков</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
