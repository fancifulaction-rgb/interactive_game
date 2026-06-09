import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getGamePlayCache } from '../lib/gamePlayCache'
import { readFinishNavigateState, type FinishNavigateState } from '../lib/finishNavigation'
import { tryUploadAvatarAfterGame } from '../lib/avatarAfterGame'
import { Trophy, Star } from 'lucide-react'
import AccessDeniedScreen from '../components/AccessDeniedScreen'
import { verifyFinishPageAccess } from '../lib/participantAccess'
import { useGameFinishedRedirect } from '../lib/useGameFinishedRedirect'

const GAME_SELECT = 'id, code, title, theme, finish_page_type'

export default function Congratulation() {
  const { gameCode } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const codeFromParams = (gameCode ?? '').trim().toUpperCase()
  const finishState =
    (location.state as FinishNavigateState | null) ??
    (codeFromParams ? readFinishNavigateState(codeFromParams) : null)

  const [game, setGame] = useState<{ title?: string } | null>(null)
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
        setGame({ title: finishState.game.title as string })
      } else {
        const cached = getGamePlayCache(code)
        if (cached?.game) {
          setGame({ title: cached.game.title as string })
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
          setGame({ title: data.title })
        }

        const { data: texts, error } = await supabase
          .from('final_page_texts')
          .select('text_key, current_value, default_value')
          .eq('page_type', 'simple')

        if (!error && texts) {
          const map: Record<string, string> = {}
          texts.forEach((item) => {
            map[item.text_key] = item.current_value || item.default_value
          })
          setFinalTexts(map)
        }
      } catch (err) {
        console.error('Ошибка загрузки поздравления:', err)
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
            Квест пройден! Итоговое табло откроется, когда ведущий завершит игру для всех команд.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen theme-background flex items-center justify-center p-4"
      style={{
        background:
          'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)',
      }}
    >
      <div className="max-w-2xl mx-auto text-center">
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 mb-8">
          <div className="flex justify-center mb-6">
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full p-4">
              <Trophy className="w-16 h-16 text-white" />
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">
            {getText('main_title', 'Поздравляем!')}
          </h1>

          <h2 className="text-xl sm:text-2xl font-semibold text-gray-700 mb-6">{game?.title}</h2>

          <p className="text-lg text-gray-600 mb-8 leading-relaxed">
            {getText(
              'description',
              'Вы успешно завершили квест! Все ваши ответы сохранены в системе.'
            )}
          </p>

          <div className="bg-gradient-to-r from-purple-100 to-blue-100 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Star className="w-6 h-6 text-yellow-500" />
              <span className="text-lg font-semibold text-gray-700">
                {getText('quest_completed', 'Квест пройден!')}
              </span>
              <Star className="w-6 h-6 text-yellow-500" />
            </div>
            <p className="text-gray-600">
              {getText('thank_you', 'Спасибо за участие в нашем интеллектуальном приключении!')}
            </p>
          </div>
        </div>

        <p className="text-white/80 text-sm mt-4">
          {getText('game_code_label', 'Код игры:')}{' '}
          <span className="font-mono font-bold">{gameCode}</span>
        </p>
      </div>
    </div>
  )
}
