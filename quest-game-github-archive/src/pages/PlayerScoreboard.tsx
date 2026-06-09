import { useEffect, useState } from 'react'

import { useParams, useLocation } from 'react-router-dom'

import { supabase } from '../lib/supabase'

import {

  applyScoreBroadcastToTeams,

  attachGameRealtime,

  SCOREBOARD_POLL_FALLBACK_MS,

} from '../lib/gameRealtime'

import { getGamePlayCache, updateTeamsSnapshot } from '../lib/gamePlayCache'

import type { TeamSnapshot } from '../lib/gamePlayCache'

import { readFinishNavigateState, type FinishNavigateState } from '../lib/finishNavigation'

import { fetchTeamsForScoreboard } from '../lib/loadScoreboardTeams'

import { tryUploadAvatarAfterGame } from '../lib/avatarAfterGame'

import { Trophy, Medal, Award, Hourglass } from 'lucide-react'

import AccessDeniedScreen from '../components/AccessDeniedScreen'

import { verifyFinishPageAccess } from '../lib/participantAccess'

import { useGameFinishedRedirect } from '../lib/useGameFinishedRedirect'

import { fetchGameStateForGame } from '../lib/fetchGameState'

import { isGameFinished } from '../lib/gameSessionState'



const GAME_SELECT = 'id, code, title, mask_board'



export default function PlayerScoreboard() {

  const { gameCode } = useParams()

  const location = useLocation()

  const codeFromParams = (gameCode ?? '').trim().toUpperCase()

  const finishState =

    (location.state as FinishNavigateState | null) ??

    (codeFromParams ? readFinishNavigateState(codeFromParams) : null)



  const [teams, setTeams] = useState<TeamSnapshot[]>([])

  const [game, setGame] = useState<{

    id: string

    code?: string

    title?: string

    mask_board?: boolean

  } | null>(null)

  const [loading, setLoading] = useState(true)

  const [accessDenied, setAccessDenied] = useState<string | null>(null)

  const [waitingForFinish, setWaitingForFinish] = useState(false)

  const [showScores, setShowScores] = useState(false)

  const [accessGameId, setAccessGameId] = useState<string | undefined>()



  useGameFinishedRedirect(gameCode, accessGameId ?? game?.id, waitingForFinish)



  useEffect(() => {

    const code = (gameCode ?? '').trim().toUpperCase()

    const gameId = accessGameId ?? game?.id

    if (!waitingForFinish || !code || !gameId) return



    let cancelled = false



    const unlockResults = async () => {

      const access = await verifyFinishPageAccess(code, {

        hasFinishNavigation: !!finishState?.game,

      })

      if (cancelled || !access.allowed || access.waitingForFinish) return

      setWaitingForFinish(false)

      setShowScores(!!access.showScores)

      const freshTeams = await fetchTeamsForScoreboard(gameId)

      if (!cancelled) {

        setTeams(freshTeams)

        updateTeamsSnapshot(code, freshTeams)

      }

    }



    void unlockResults()



    const detach = attachGameRealtime(gameId, {

      onGameStateChanged: (row) => {

        if (isGameFinished(row)) void unlockResults()

      },

    })



    const poll = window.setInterval(() => {

      if (document.hidden) return

      void fetchGameStateForGame(gameId, { force: true }).then((state) => {

        if (isGameFinished(state)) void unlockResults()

      })

    }, 5000)



    return () => {

      cancelled = true

      detach()

      window.clearInterval(poll)

    }

  }, [waitingForFinish, gameCode, accessGameId, game?.id, finishState])



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

        setWaitingForFinish(false)

        setShowScores(false)

        setLoading(false)

        return

      }



      setWaitingForFinish(!!access.waitingForFinish)

      setShowScores(!!access.showScores)

      setAccessGameId(access.gameId)



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

          access.gameId ??

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

    }

  }, [gameCode, finishState])



  useEffect(() => {

    if (!game?.id || waitingForFinish) return



    const code = (gameCode ?? '').trim().toUpperCase()

    const reloadTeams = () => {

      void fetchTeamsForScoreboard(game.id).then((data) => {

        setTeams(data)

        if (code) updateTeamsSnapshot(code, data)

      })

    }



    const detach = attachGameRealtime(game.id, {

      onScoreUpdate: (payload) => {

        setTeams((prev) => {

          const next = applyScoreBroadcastToTeams(prev, payload)

          if (code) updateTeamsSnapshot(code, next)

          return next

        })

      },

      onTeamsChanged: reloadTeams,

    })



    const pollTimer = window.setInterval(() => {

      if (typeof document !== 'undefined' && document.hidden) return

      reloadTeams()

    }, SCOREBOARD_POLL_FALLBACK_MS)



    return () => {

      window.clearInterval(pollTimer)

      detach()

    }

  }, [game?.id, gameCode, waitingForFinish])



  const rankedTeams = [...teams].sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0))

  const displayTeams = showScores

    ? rankedTeams

    : [...teams].sort((a, b) => (a.team_name || '').localeCompare(b.team_name || '', 'ru'))



  const getRankIcon = (index: number) => {

    switch (index) {

      case 0:

        return <Trophy className="w-8 h-8 text-yellow-500" />

      case 1:

        return <Medal className="w-8 h-8 text-gray-400" />

      case 2:

        return <Award className="w-8 h-8 text-amber-600" />

      default:

        return (

          <div className="w-8 h-8 flex items-center justify-center text-xl font-bold text-gray-500">

            {index + 1}

          </div>

        )

    }

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



  if (waitingForFinish) {

    return (

      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-pink-600 p-4 flex items-center justify-center">

        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">

          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">

            <Hourglass className="w-8 h-8 text-purple-600 animate-pulse" />

          </div>

          <h1 className="text-2xl font-bold text-gray-800 mb-2">{game?.title || 'Игра'}</h1>

          <p className="text-gray-600 mb-4">

            Вы прошли все вопросы. Результаты появятся, когда ведущий завершит игру для всех

            команд.

          </p>

          <p className="text-sm text-purple-700">Страница обновится автоматически.</p>

        </div>

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

                {displayTeams.map((team, index) => (

                  <div

                    key={team.id}

                    className={`rounded-xl p-6 transition-all ${

                      showScores && index < 3

                        ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300'

                        : 'bg-white border-2 border-gray-200'

                    }`}

                  >

                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">

                      <div className="flex items-center gap-4 sm:gap-6 flex-1 min-w-0">

                        {showScores && getRankIcon(index)}



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



                      {showScores && (

                        <div className="text-left sm:text-right flex-shrink-0">

                          <div className="text-3xl sm:text-4xl font-bold text-purple-600">

                            {team.total_score ?? 0}

                          </div>

                          <div className="text-sm text-gray-500">очков</div>

                        </div>

                      )}

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


