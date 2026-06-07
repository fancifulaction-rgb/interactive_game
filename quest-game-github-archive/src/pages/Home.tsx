import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Users, Shield, Image as ImageIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { enqueueBackground } from '../lib/requestQueue'

interface QuestSettings {
  quest_title: string
  quest_subtitle: string
  quest_logo_url?: string
}

/** StrictMode в dev монтирует дважды — один fetch логотипа на вкладку. */
let questLogoFetch: Promise<string | null> | null = null

async function fetchQuestLogoFromDb(): Promise<string | null> {
  if (!questLogoFetch) {
    questLogoFetch = enqueueBackground(async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'quest_logo_url')
        .maybeSingle()
      if (error) throw error
      return data?.value ?? null
    }).catch((err) => {
      questLogoFetch = null
      throw err
    })
  }
  return questLogoFetch
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
    let alive = true
    void loadQuestSettings(() => alive)

    const handleStorageChange = () => {
      questLogoFetch = null
      sessionStorage.removeItem('quest_logo_url')
      void loadQuestSettings()
    }

    window.addEventListener('storage', handleStorageChange)
    return () => {
      alive = false
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  const loadQuestSettings = async (isAlive: () => boolean = () => true) => {
    try {
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

      const cachedLogo = sessionStorage.getItem('quest_logo_url')
      if (cachedLogo) {
        parsedSettings.quest_logo_url = cachedLogo
      }

      setSettings(parsedSettings)
      setLogoLoaded(true)

      if (cachedLogo) return

      void fetchQuestLogoFromDb()
        .then((logoUrl) => {
          if (!isAlive() || !logoUrl) return
          sessionStorage.setItem('quest_logo_url', logoUrl)
          setSettings((prev) => ({ ...prev, quest_logo_url: logoUrl }))
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          console.warn('Настройки с сервера недоступны, используем локальные:', error)
        })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.warn('Настройки с сервера недоступны, используем локальные:', error)
      if (isAlive()) setLogoLoaded(true)
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
