import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getGamePlayCache } from '../lib/gamePlayCache'
import { readFinishNavigateState, type FinishNavigateState } from '../lib/finishNavigation'
import { tryUploadAvatarAfterGame } from '../lib/avatarAfterGame'
import { Trophy, Crown } from 'lucide-react'
import AccessDeniedScreen from '../components/AccessDeniedScreen'
import { verifyFinishPageAccess } from '../lib/participantAccess'
import { useGameFinishedRedirect } from '../lib/useGameFinishedRedirect'

interface Team {
  id: string
  name: string
  captain_name?: string
  total_score?: number
}

const GAME_SELECT = 'id, code, title'

export default function CongratulationWithStats() {
  const { gameCode } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const codeFromParams = (gameCode ?? '').trim().toUpperCase()
  const finishState =
    (location.state as FinishNavigateState | null) ??
    (codeFromParams ? readFinishNavigateState(codeFromParams) : null)

  const [game, setGame] = useState<{ code?: string; title?: string } | null>(null)
  const [team, setTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState<string | null>(null)
  const [waitingForFinish, setWaitingForFinish] = useState(false)
  const [accessGameId, setAccessGameId] = useState<string | undefined>()
  const [finalTexts, setFinalTexts] = useState<Record<string, string>>({})

  useGameFinishedRedirect(gameCode, accessGameId, waitingForFinish)

  useEffect(() => {
    const code = (gameCode ?? '').trim().toUpperCase()
    if (!code) return

    setAccessDenied(null)
    setLoading(true)

    void (async () => {
      const access = await verifyFinishPageAccess(code, {
        hasFinishNavigation: !!finishState?.game,
      })
      if (!access.allowed) {
        setAccessDenied(access.message ?? 'Доступ закрыт')
        setWaitingForFinish(false)
        setLoading(false)
        return
      }

      setWaitingForFinish(!!access.waitingForFinish)
      setAccessGameId(access.gameId)

      if (finishState?.game) {
        setGame({
          code: finishState.game.code as string,
          title: finishState.game.title as string,
        })
      } else {
        const cached = getGamePlayCache(code)
        if (cached?.game) {
          setGame({
            code: cached.game.code as string,
            title: cached.game.title as string,
          })
        }
      }

      const teamInfo = localStorage.getItem('current_team')
      if (teamInfo) {
        try {
          const parsed = JSON.parse(teamInfo)
          setTeam({
            id: parsed.id,
            name: parsed.name || 'Команда',
            captain_name: parsed.captain_name || 'Капитан',
            total_score: Number(parsed.total_score) || 0,
          })
        } catch {
          /* ignore */
        }
      }

      tryUploadAvatarAfterGame(localStorage.getItem('team_id'))

      try {
        if (!finishState?.game && !getGamePlayCache(code)) {
          const { data, error } = await supabase
            .from('games')
            .select(GAME_SELECT)
            .eq('code', code)
            .maybeSingle()
          if (error) throw error
          if (!data) {
            navigate('/')
            return
          }
          setGame({ code: data.code, title: data.title })
        }

        const { data: texts, error } = await supabase
          .from('final_page_texts')
          .select('text_key, current_value, default_value')
          .eq('page_type', 'with_stats')

        if (!error && texts) {
          const map: Record<string, string> = {}
          texts.forEach((item) => {
            map[item.text_key] = item.current_value || item.default_value
          })
          setFinalTexts(map)
        }
      } catch (err) {
        console.error('Ошибка загрузки статистики:', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [gameCode, navigate, finishState])

  const getText = (key: string, defaultValue: string) => finalTexts[key] || defaultValue

  if (accessDenied) {
    return <AccessDeniedScreen message={accessDenied} />
  }

  if (loading && !game) {
    return (
      <div
        className="min-h-screen theme-background flex items-center justify-center"
        style={{
          background:
            'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)',
        }}
      >
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    )
  }

  if (waitingForFinish) {
    return (
      <div
        className="min-h-screen theme-background flex items-center justify-center p-4"
        style={{
          background:
            'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)',
        }}
      >
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">{game?.title || 'Игра'}</h1>
          <p className="text-gray-600">
            Квест пройден! Статистика и табло откроются, когда ведущий завершит игру.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen theme-background flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)',
      }}
    >
      <div className="max-w-2xl mx-auto text-center relative z-10">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 mb-6 max-w-lg mx-auto">
          <div className="flex justify-center mb-6">
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full p-4">
              <Trophy className="w-16 h-16 text-white" />
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-3">
            {getText('main_title', 'Поздравляем!')}
          </h1>

          <h2 className="text-xl sm:text-2xl font-semibold text-gray-700 mb-6">
            {game?.title || game?.code || 'Квест'}
          </h2>

          <p className="text-base text-gray-600 mb-6 leading-relaxed">
            {getText('description', 'Вы успешно завершили квест!')}
          </p>

          {team && (
            <div className="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-2xl p-6 mb-8 border border-orange-100 shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-orange-100 rounded-full p-2">
                  <Crown className="w-6 h-6 text-orange-600" />
                </div>
                <div className="text-left">
                  <div className="text-2xl font-bold text-gray-800">{team.name}</div>
                  <div className="text-sm text-gray-600">
                    {getText('captain_label', 'Капитан:')} {team.captain_name}
                  </div>
                </div>
              </div>
              <div className="text-center bg-white rounded-xl p-4 shadow-sm">
                <p className="text-sm text-gray-600">
                  Итоговые очки доступны организатору на admin scoreboard.
                </p>
              </div>
            </div>
          )}
        </div>

        <p className="text-white/80 text-sm mt-4">
          {getText('game_code_label', 'Код игры:')}{' '}
          <span className="font-mono font-bold">{gameCode}</span>
        </p>
      </div>
    </div>
  )
}
