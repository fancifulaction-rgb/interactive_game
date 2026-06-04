import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Trophy, Star, Users, Target, ArrowRight, User, Crown } from 'lucide-react'

interface Team {
  id: string
  name: string
  captain_name?: string
  players?: string[]
  total_score?: number
  answers_count?: number
}

export default function CongratulationWithStats() {
  const { gameCode } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState<any>(null)
  const [team, setTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)
  const [finalTexts, setFinalTexts] = useState<Record<string, string>>({})

  useEffect(() => {
    loadGameData()
    loadFinalTexts()
  }, [gameCode])

  const loadGameData = async () => {
    try {
      console.log('🎯 Загрузка данных для игры:', gameCode)
      
      // Получаем данные игры
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('code', gameCode)
        .maybeSingle()

      if (gameError) throw gameError
      if (!gameData) {
        alert('Игра не найдена')
        navigate('/')
        return
      }

      console.log('✅ Игра загружена:', gameData)
      setGame(gameData)

      // Получаем данные команды игрока (используем localStorage для сохранения информации о команде)
      const teamInfo = localStorage.getItem('current_team')
      console.log('📦 localStorage team_info:', teamInfo)
      
      if (teamInfo) {
        const parsedTeam = JSON.parse(teamInfo)
        console.log('🏷️ Парсим team_info:', parsedTeam)
        
        // Ищем данные команды в game_state таблице по ID игры
        const { data: gameStateData, error: gameStateError } = await supabase
          .from('game_state')
          .select('*')
          .eq('game_id', gameData.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        console.log('🏆 Данные game_state:', { gameStateData, gameStateError })

        if (gameStateData) {
          // Если есть данные в game_state, используем их
          const finalTeam = {
            id: gameStateData.id || parsedTeam.id,
            name: gameStateData.team_name || parsedTeam.name || 'Команда',
            captain_name: gameStateData.player_name || parsedTeam.captain_name || 'Капитан',
            players: parsedTeam.players || [parsedTeam.captain_name] || ['Капитан'],
            total_score: gameStateData.score || 0,
            answers_count: parsedTeam.answers_count || 0
          }
          
          console.log('🎉 Финальные данные команды из game_state:', finalTeam)
          setTeam(finalTeam)
        } else {
          console.log('⚠️ Нет данных в game_state, используем localStorage данные')
          // Если нет данных в БД, используем сохраненные данные
          setTeam({
            id: parsedTeam.id,
            name: parsedTeam.name || 'Команда',
            captain_name: parsedTeam.captain_name || 'Капитан',
            players: parsedTeam.players || [parsedTeam.captain_name] || ['Капитан'],
            total_score: parsedTeam.total_score || 0,
            answers_count: parsedTeam.answers_count || 0
          })
        }
      } else {
        console.log('❌ Не найден team_info в localStorage')
      }
    } catch (err: any) {
      console.error('❌ Ошибка загрузки данных:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadFinalTexts = async () => {
    try {
      const { data, error } = await supabase
        .from('final_page_texts')
        .select('text_key, current_value, default_value')
        .eq('page_type', 'with_stats')

      if (!error && data) {
        const texts: Record<string, string> = {}
        data.forEach(item => {
          texts[item.text_key] = item.current_value || item.default_value
        })
        setFinalTexts(texts)
      }
    } catch (err: any) {
      console.error('Ошибка загрузки текстов финальной страницы:', err)
      // Продолжаем работу с дефолтными текстами
    }
  }

  const getText = (key: string, defaultValue: string) => {
    return finalTexts[key] || defaultValue
  }



  if (loading) {
    return (
      <div className="min-h-screen theme-background flex items-center justify-center" style={{
        background: 'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)'
      }}>
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen theme-background flex items-center justify-center p-4 relative overflow-hidden" style={{
      background: 'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)'
    }}>
      {/* Декоративные элементы конфетти */}
      <div className="absolute top-10 left-10 w-3 h-3 bg-pink-300 rounded-full opacity-70"></div>
      <div className="absolute top-20 right-20 w-2 h-2 bg-blue-300 rounded-full opacity-70"></div>
      <div className="absolute bottom-20 left-20 w-4 h-4 bg-yellow-300 rounded-full opacity-70"></div>
      <div className="absolute bottom-10 right-10 w-3 h-3 bg-green-300 rounded-full opacity-70"></div>
      <div className="absolute top-1/2 left-5 w-2 h-6 bg-purple-300 rounded opacity-70 transform rotate-45"></div>
      <div className="absolute top-1/3 right-5 w-2 h-6 bg-orange-300 rounded opacity-70 transform rotate-45"></div>
      
      <div className="max-w-2xl mx-auto text-center relative z-10">
        {/* Основной блок поздравления */}
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
            {game?.code || 'Квест'}
          </h2>
          
          <p className="text-base text-gray-600 mb-6 leading-relaxed">
            {getText('description', 'Вы успешно завершили квест! Все ваши ответы сохранены в системе.')}
          </p>

          {/* Минималистичная карточка участника */}
          {team && (
            <div className="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-2xl p-6 mb-8 border border-orange-100 shadow-lg">
              {/* Верхняя часть: номер команды и капитан */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-orange-100 rounded-full p-2">
                    <Crown className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-800">{team.name || 'Команда'}</div>
                    <div className="text-sm text-gray-600">
                      {getText('captain_label', 'Капитан:')} {team.captain_name}
                    </div>
                  </div>
                </div>
              </div>

              {/* Нижняя часть: результат */}
              <div className="text-center bg-white rounded-xl p-4 shadow-sm">
                <div className="text-4xl font-bold text-orange-600">{team.total_score}</div>
                <div className="text-sm text-gray-600">{getText('points_label', 'очков')}</div>
              </div>
            </div>
          )}

          <div className="bg-gradient-to-r from-green-100 to-blue-100 rounded-xl p-4 mb-8">
            <div className="text-center">
              <span className="text-lg font-semibold text-gray-700">
                {getText('quest_completed', 'Квест пройден!')}
              </span>
            </div>
          </div>
        </div>


        
        <p className="text-white/80 text-sm mt-4">
          {getText('game_code_label', 'Код игры:')} <span className="font-mono font-bold">{gameCode}</span>
        </p>
      </div>
    </div>
  )
}
