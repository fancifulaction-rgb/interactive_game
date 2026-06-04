import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ThemeManager from '../components/ThemeManager'
import SettingsManager from '../components/SettingsManager'
import QuestSettingsManager from '../components/QuestSettingsManager'
import PasswordManager from '../components/PasswordManager'
import FinalPageTextsManager from '../components/FinalPageTextsManager'
import GameControls from '../components/GameControls'
import MessagePanel from '../components/MessagePanel'
import TeamManagementManager from '../components/TeamManagementManager'
import CollapsibleSection from '../components/CollapsibleSection'
import {
  LogOut, Plus, Edit, Trash2, Play, Settings,
  Download, Users, Trophy, Palette, FileText, BarChart3, Type, Key, Radio, Calendar
} from 'lucide-react'

interface Game {
  id: string
  title: string
  code: string | null
  theme: string
  mask_board: boolean
  total_time_sec: number
  per_question_time_sec: number
  created_at: string
  scoring: any
}

interface Theme {
  id: string
  name: string
  display_name: string
  colors: {
    primary: string
    secondary: string
    background: string
  }
  effects: Record<string, boolean>
  created_at?: string
}

interface Settings {
  id?: string
  key: string
  value: string
  description: string
  category: string
}

export default function AdminPanel() {
  const navigate = useNavigate()
  const [games, setGames] = useState<Game[]>([])
  const [themes, setThemes] = useState<Theme[]>([])
  const [settings, setSettings] = useState<Settings[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'games' | 'settings'>('games')
  const [showCreateGame, setShowCreateGame] = useState(false)
  const [showCreateTheme, setShowCreateTheme] = useState(false)
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null)

  useEffect(() => {
    const isLoggedIn = localStorage.getItem('admin_logged_in')
    if (!isLoggedIn) {
      navigate('/admin/login')
      return
    }
    if (activeTab === 'games') {
      loadGames()
    } else if (activeTab === 'settings') {
      loadSettings()
      loadThemes() // Загружаем темы для компонента управления темами
    }
  }, [navigate, activeTab])

  const loadGames = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setGames(data || [])
    } catch (err: any) {
      console.error('Ошибка загрузки игр:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadThemes = async () => {
    try {
      const { data, error } = await supabase
        .from('themes')
        .select('*')
        .order('display_name', { ascending: true })

      if (error) throw error
      setThemes(data || [])
    } catch (err: any) {
      console.error('Ошибка загрузки тем:', err)
    }
  }

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .order('category', { ascending: true })

      if (error) throw error
      setSettings(data || [])
    } catch (err: any) {
      console.error('Ошибка загрузки настроек:', err)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('admin_logged_in')
    localStorage.removeItem('admin_username')
    navigate('/admin/login')
  }

  const generateAccessCode = () => {
    // Генерируем 6-значный код из букв и цифр
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const createGame = async () => {
    try {
      const newGame = {
        title: 'Новая игра',
        code: generateAccessCode(),
        theme: 'new-year',
        mask_board: false,
        total_time_sec: 1800,
        per_question_time_sec: 120,
        scoring: {
          p_base: 100,
          k_diff: 1.0,
          k_time: 0.5,
          k_skip: 0.8,
          k_fast: 1.2,
          combo_bonus: 10
        }
      }

      const { data, error } = await supabase
        .from('games')
        .insert(newGame)
        .select()
        .maybeSingle()

      if (error) throw error
      if (data) {
        setGames([data, ...games])
        setShowCreateGame(false)
      }
    } catch (err: any) {
      console.error('Ошибка создания игры:', err)
      alert('Ошибка создания игры: ' + err.message)
    }
  }

  const deleteGame = async (gameId: string) => {
    if (!confirm('Вы уверены, что хотите удалить эту игру? Все связанные данные (вопросы, команды, ответы, медиа файлы) будут удалены безвозвратно.')) {
      return
    }

    try {
      setLoading(true)
      
      // Вызываем функцию комплексного удаления
      const { data, error } = await supabase.functions.invoke('delete-game', {
        body: { gameId }
      })

      if (error) throw error
      
      if (data?.success) {
        setGames(games.filter(g => g.id !== gameId))
        alert(`Игра успешно удалена!\nУдалено: ${data.deleted.questions} вопросов, ${data.deleted.teams} команд, ${data.deleted.answers} ответов, ${data.deleted.mediaFiles} медиа файлов`)
      } else {
        throw new Error(data?.error || 'Неизвестная ошибка')
      }
    } catch (err: any) {
      console.error('Ошибка удаления игры:', err)
      alert('Ошибка удаления игры: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const createTheme = async (themeData: Partial<Theme>) => {
    try {
      const newTheme = {
        name: themeData.name,
        display_name: themeData.display_name,
        colors: themeData.colors,
        effects: themeData.effects || {}
      }

      const { data, error } = await supabase
        .from('themes')
        .insert(newTheme)
        .select()
        .maybeSingle()

      if (error) throw error
      if (data) {
        setThemes([...themes, data])
        setShowCreateTheme(false)
      }
    } catch (err: any) {
      console.error('Ошибка создания темы:', err)
      alert('Ошибка создания темы: ' + err.message)
    }
  }

  const updateTheme = async (themeId: string, themeData: Partial<Theme>) => {
    try {
      const { data, error } = await supabase
        .from('themes')
        .update({
          name: themeData.name,
          display_name: themeData.display_name,
          colors: themeData.colors,
          effects: themeData.effects
        })
        .eq('id', themeId)
        .select()
        .maybeSingle()

      if (error) throw error
      if (data) {
        setThemes(themes.map(theme => theme.id === themeId ? data : theme))
        setEditingTheme(null)
      }
    } catch (err: any) {
      console.error('Ошибка обновления темы:', err)
      alert('Ошибка обновления темы: ' + err.message)
    }
  }

  const deleteTheme = async (themeId: string, themeName: string) => {
    // Проверим, не используется ли тема в играх
    const gamesUsingTheme = games.filter(game => game.theme === themeName)
    if (gamesUsingTheme.length > 0) {
      alert(`Нельзя удалить тему "${themeName}", так как она используется в ${gamesUsingTheme.length} игре(ах). Сначала измените тему в этих играх.`)
      return
    }

    if (!confirm('Вы уверены, что хотите удалить эту тему?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('themes')
        .delete()
        .eq('id', themeId)

      if (error) throw error
      setThemes(themes.filter(theme => theme.id !== themeId))
    } catch (err: any) {
      console.error('Ошибка удаления темы:', err)
      alert('Ошибка удаления темы: ' + err.message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Панель администратора</h1>
            <p className="text-sm text-gray-600">
              {localStorage.getItem('admin_username')}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Выйти
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('games')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'games'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Play className="w-5 h-5 inline-block mr-2" />
            Игры
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'settings'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Settings className="w-5 h-5 inline-block mr-2" />
            Настройки
          </button>
        </div>

        {activeTab === 'games' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">Управление играми</h2>
              <div className="flex gap-2">

                <button
                  onClick={createGame}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Создать игру
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
              </div>
            ) : games.length === 0 ? (
              <div className="bg-white rounded-lg p-12 text-center">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Нет созданных игр</p>
                <button
                  onClick={createGame}
                  className="mt-4 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Создать первую игру
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {games.map((game) => (
                  <div
                    key={game.id}
                    className="bg-white rounded-lg p-4 sm:p-6 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-2 truncate">
                          {game.title}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Код доступа:</span>
                            <p className="font-bold text-purple-600 text-base sm:text-lg">
                              {game.code || 'Не задан'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-600">Тема:</span>
                            <p className="font-semibold text-sm sm:text-base">{game.theme}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Общее время:</span>
                            <p className="font-semibold text-sm sm:text-base">{game.total_time_sec / 60} мин</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Время на вопрос:</span>
                            <p className="font-semibold text-sm sm:text-base">{game.per_question_time_sec} сек</p>
                          </div>
                          <div>
                            <div className="flex items-center gap-1 mb-1">
                              <Calendar className="w-4 h-4 text-gray-500" />
                              <span className="text-gray-600">Создана:</span>
                            </div>
                            <p className="font-semibold text-sm sm:text-base text-gray-800">
                              {formatDate(game.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 sm:gap-2 ml-2 sm:ml-4 flex-shrink-0">
                        <button
                          onClick={() => navigate(`/scoreboard-admin/${game.code}`)}
                          className="p-3 sm:p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
                          title="Табло"
                        >
                          <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                        <button
                          onClick={() => navigate(`/scoreboard-detailed/${game.code}`)}
                          className="p-3 sm:p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
                          title="Детализированное табло"
                        >
                          <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                        <button
                          onClick={() => navigate(`/admin/game/${game.id}/edit`)}
                          className="p-3 sm:p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
                          title="Редактировать"
                        >
                          <Edit className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                        <button
                          onClick={() => deleteGame(game.id)}
                          className="p-3 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
                          title="Удалить"
                        >
                          <Trash2 className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-800">Настройки системы</h2>
              <p className="text-sm text-gray-600 mt-1">
                Настройте параметры работы системы квеста
              </p>
            </div>

            {/* Раскрывающиеся секции настроек */}
            <CollapsibleSection
              title="Управление игрой"
              icon={<Radio className="w-5 h-5" />}
            >
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Контроль игрового процесса</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Управляйте состоянием игры и отправляйте уведомления игрокам в реальном времени
                  </p>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <GameControls />
                  <MessagePanel />
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Время"
              icon={<Play className="w-5 h-5" />}
            >
              <div className="space-y-4">
                {settings.filter(setting => setting.category === 'Время').map(setting => (
                  <div key={setting.key} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium text-gray-800">{setting.key}</h4>
                        <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          {setting.value}
                        </span>
                        <button
                          onClick={() => {
                            // TODO: добавить функциональность редактирования
                            alert('Редактирование настроек времени скоро будет добавлено')
                          }}
                          className="text-blue-600 hover:text-blue-800"
                          title="Редактировать"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{setting.description}</p>
                    </div>
                  </div>
                ))}
                {settings.filter(setting => setting.category === 'Время').length === 0 && (
                  <p className="text-gray-500 text-sm">Нет настроек в этой категории</p>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Общие"
              icon={<Settings className="w-5 h-5" />}
            >
              <div className="space-y-4">
                {settings.filter(setting => setting.category === 'Общие').map(setting => (
                  <div key={setting.key} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium text-gray-800">{setting.key}</h4>
                        <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          {setting.value}
                        </span>
                        <button
                          onClick={() => {
                            alert('Редактирование общих настроек скоро будет добавлено')
                          }}
                          className="text-blue-600 hover:text-blue-800"
                          title="Редактировать"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{setting.description}</p>
                    </div>
                  </div>
                ))}
                {settings.filter(setting => setting.category === 'Общие').length === 0 && (
                  <p className="text-gray-500 text-sm">Нет настроек в этой категории</p>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Очки"
              icon={<Trophy className="w-5 h-5" />}
            >
              <div className="space-y-4">
                {settings.filter(setting => setting.category === 'Очки').map(setting => (
                  <div key={setting.key} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium text-gray-800">{setting.key}</h4>
                        <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          {setting.value}
                        </span>
                        <button
                          onClick={() => {
                            alert('Редактирование настроек очков скоро будет добавлено')
                          }}
                          className="text-blue-600 hover:text-blue-800"
                          title="Редактировать"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{setting.description}</p>
                    </div>
                  </div>
                ))}
                {settings.filter(setting => setting.category === 'Очки').length === 0 && (
                  <p className="text-gray-500 text-sm">Нет настроек в этой категории</p>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Интерфейс"
              icon={<FileText className="w-5 h-5" />}
            >
              <div className="space-y-4">
                {settings.filter(setting => setting.category === 'Интерфейс').map(setting => (
                  <div key={setting.key} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium text-gray-800">{setting.key}</h4>
                        <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          {setting.value}
                        </span>
                        <button
                          onClick={() => {
                            alert('Редактирование настроек интерфейса скоро будет добавлено')
                          }}
                          className="text-blue-600 hover:text-blue-800"
                          title="Редактировать"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{setting.description}</p>
                    </div>
                  </div>
                ))}
                {settings.filter(setting => setting.category === 'Интерфейс').length === 0 && (
                  <p className="text-gray-500 text-sm">Нет настроек в этой категории</p>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Темы"
              icon={<Palette className="w-5 h-5" />}
            >
              <ThemeManager 
                themes={themes}
                games={games}
                onCreateTheme={createTheme}
                onUpdateTheme={updateTheme}
                onDeleteTheme={deleteTheme}
                onToggleCreate={() => setShowCreateTheme(!showCreateTheme)}
                editingTheme={editingTheme}
                setEditingTheme={setEditingTheme}
                showCreate={showCreateTheme}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Квест"
              icon={<Type className="w-5 h-5" />}
            >
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Настройки главной страницы</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Настройте название квеста и текст приветствия на главной странице
                </p>
                <QuestSettingsManager />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Тексты финальных страниц"
              icon={<FileText className="w-5 h-5" />}
            >
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Настройка текстов поздравлений</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Измените все тексты на финальных страницах квеста для двух вариантов отображения
                </p>
                <FinalPageTextsManager />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Пароль"
              icon={<Key className="w-5 h-5" />}
            >
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Управление паролем</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Измените пароль администратора для повышения безопасности
                </p>
                <PasswordManager />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Управление командами"
              icon={<Users className="w-5 h-5" />}
            >
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Удаление команд из табло</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Управляйте командами в играх: удаляйте все команды или выбранные команды для очистки табло результатов
                </p>
                <TeamManagementManager />
              </div>
            </CollapsibleSection>
          </div>
        )}
      </div>
    </div>
  )
}
