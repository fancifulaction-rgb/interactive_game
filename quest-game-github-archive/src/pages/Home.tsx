import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Users, Shield, Image as ImageIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface QuestSettings {
  quest_title: string
  quest_subtitle: string
  quest_logo_url?: string
}

export default function Home() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<QuestSettings>({
    quest_title: 'Интерактивный Квест',
    quest_subtitle: 'Выберите режим для начала',
    quest_logo_url: ''
  })
  const [logoLoaded, setLogoLoaded] = useState(false)

  useEffect(() => {
    loadQuestSettings()

    // Подписываемся на изменения настроек
    const handleStorageChange = () => {
      loadQuestSettings()
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  const loadQuestSettings = async () => {
    try {
      // Загружаем настройки из localStorage
      let parsedSettings = {
        quest_title: 'Интерактивный Квест',
        quest_subtitle: 'Выберите режим для начала',
        quest_logo_url: ''
      }
      
      const savedSettings = localStorage.getItem('quest_settings')
      if (savedSettings) {
        try {
          parsedSettings = { ...parsedSettings, ...JSON.parse(savedSettings) }
        } catch (error) {
          console.error('Ошибка загрузки настроек из localStorage:', error)
        }
      }

      // Проверяем настройки в базе данных
      const { data: dbSettings } = await supabase
        .from('settings')
        .select('key, value')
        .eq('key', 'quest_logo_url')
        .single()

      if (dbSettings && dbSettings.value) {
        parsedSettings.quest_logo_url = dbSettings.value
      }

      setSettings(parsedSettings)
    } catch (error) {
      console.error('Ошибка загрузки настроек:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          {settings.quest_logo_url ? (
            <img 
              src={settings.quest_logo_url} 
              alt="Логотип квеста" 
              className={`w-24 h-24 object-contain mx-auto mb-6 bg-white rounded-2xl p-3 shadow-lg transition-opacity duration-300 ${
                logoLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setLogoLoaded(true)}
              onError={() => setLogoLoaded(true)}
            />
          ) : (
            <div className={`w-24 h-24 mx-auto mb-6 bg-white/20 rounded-2xl flex items-center justify-center transition-opacity duration-300 ${
              logoLoaded ? 'opacity-100' : 'opacity-0'
            }`}>
              <ImageIcon className="w-12 h-12 text-white/60" />
            </div>
          )}
          
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4">
            {settings.quest_title}
          </h1>
          <p className="text-xl text-white/90">
            {settings.quest_subtitle}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <button
            onClick={() => navigate('/team/register')}
            className="bg-white rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-105 group"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Я игрок</h2>
              <p className="text-gray-600 text-center">
                Зарегистрировать команду и начать игру
              </p>
            </div>
          </button>

          <button
            onClick={() => navigate('/admin/login')}
            className="bg-white rounded-2xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-105 group"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                <Shield className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Я администратор</h2>
              <p className="text-gray-600 text-center">
                Управление играми и настройками
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
