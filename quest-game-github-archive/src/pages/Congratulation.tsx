import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Trophy, Star, ArrowRight } from 'lucide-react'

export default function Congratulation() {
  const { gameCode } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [finalTexts, setFinalTexts] = useState<Record<string, string>>({})

  useEffect(() => {
    loadGameData()
    loadFinalTexts()
  }, [gameCode])

  const loadGameData = async () => {
    try {
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

      setGame(gameData)
    } catch (err: any) {
      console.error('Ошибка загрузки игры:', err)
      alert('Ошибка загрузки игры')
      navigate('/')
    } finally {
      setLoading(false)
    }
  }

  const loadFinalTexts = async () => {
    try {
      const { data, error } = await supabase
        .from('final_page_texts')
        .select('text_key, current_value, default_value')
        .eq('page_type', 'simple')

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
    <div className="min-h-screen theme-background flex items-center justify-center p-4" style={{
      background: 'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)'
    }}>
      <div className="max-w-2xl mx-auto text-center">
        {/* Основной блок поздравления */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 mb-8">
          <div className="flex justify-center mb-6">
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full p-4">
              <Trophy className="w-16 h-16 text-white" />
            </div>
          </div>
          
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">
            {getText('main_title', 'Поздравляем!')}
          </h1>
          
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-700 mb-6">
            {game?.title}
          </h2>
          
          <p className="text-lg text-gray-600 mb-8 leading-relaxed">
            {getText('description', 'Вы успешно завершили квест! Все ваши ответы сохранены в системе. Данные команды и набранные очки отображаются в таблице результатов.')}
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
          {getText('game_code_label', 'Код игры:')} <span className="font-mono font-bold">{gameCode}</span>
        </p>
      </div>
    </div>
  )
}
