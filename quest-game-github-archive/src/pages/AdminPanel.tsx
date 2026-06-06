import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { deleteGameCompletely } from '../lib/deleteGame'
import { cloneGame } from '../lib/cloneGame'
import { createNewGame } from '../lib/createGame'
import { formatErrorMessage } from '../lib/errorMessage'
import { debugLog } from '../lib/debugLog'
import { ADMIN_SESSION_HINT, getAdminDisplayName, hasSupabaseAdminSession } from '../lib/adminAuth'
import {
  generateGameAccessCode,
  isValidGameAccessCode,
  normalizeGameAccessCode,
} from '../lib/gameAccessCode'
import ThemeManager from '../components/ThemeManager'
import SettingsManager from '../components/SettingsManager'
import QuestSettingsManager from '../components/QuestSettingsManager'
import PasswordManager from '../components/PasswordManager'
import FinalPageTextsManager from '../components/FinalPageTextsManager'
import GameControls from '../components/GameControls'
import MessagePanel from '../components/MessagePanel'
import TeamManagementManager from '../components/TeamManagementManager'
import CollapsibleSection from '../components/CollapsibleSection'
import EventArchiveModal from '../components/EventArchiveModal'
import {
  LogOut, Plus, Edit, Trash2, Play, Settings,
  Download, Users, Trophy, Palette, FileText, BarChart3, Type, Key, Radio, Calendar, Copy, X,
  Presentation, History,
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
  const [gamesLoading, setGamesLoading] = useState(true)
  const [gamesError, setGamesError] = useState('')
  const [creatingGame, setCreatingGame] = useState(false)
  const [deletingGameIds, setDeletingGameIds] = useState<Set<string>>(new Set())
  const [adminSessionOk, setAdminSessionOk] = useState<boolean | null>(null)
  const [activeTab, setActiveTab] = useState<'games' | 'settings'>('games')
  const gamesLoadSeq = useRef(0)
  const createInFlight = useRef(false)
  const [showCreateGame, setShowCreateGame] = useState(false)
  const [showCreateTheme, setShowCreateTheme] = useState(false)
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null)
  const [cloneSource, setCloneSource] = useState<Game | null>(null)
  const [cloneTitle, setCloneTitle] = useState('')
  const [cloneCode, setCloneCode] = useState('')
  const [cloneTheme, setCloneTheme] = useState('')
  const [cloneBusy, setCloneBusy] = useState(false)
  const [archiveGame, setArchiveGame] = useState<{ id: string; title: string } | null>(null)

  const refreshAdminSession = useCallback(async () => {
    setAdminSessionOk(await hasSupabaseAdminSession())
  }, [])

  const loadGames = useCallback(async () => {
    const seq = ++gamesLoadSeq.current
    setGamesLoading(true)
    setGamesError('')
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      if (seq !== gamesLoadSeq.current) return
      setGames(data || [])
    } catch (err: unknown) {
      if (seq !== gamesLoadSeq.current) return
      const msg = formatErrorMessage(err)
      // #region agent log
      debugLog('AdminPanel.tsx', 'loadGames failed', { msg }, 'H6')
      // #endregion
      console.error('Ошибка загрузки игр:', err)
      setGamesError(msg)
    } finally {
      if (seq === gamesLoadSeq.current) {
        setGamesLoading(false)
      }
    }
  }, [])

  const refreshGamesList = useCallback(() => {
    void loadGames()
  }, [loadGames])

  useEffect(() => {
    const isLoggedIn = localStorage.getItem('admin_logged_in')
    if (!isLoggedIn) {
      navigate('/admin/login')
      return
    }
    void refreshAdminSession()
    if (activeTab === 'games') {
      void loadGames()
    } else if (activeTab === 'settings') {
      void loadGames()
      loadSettings()
      loadThemes()
    }
  }, [navigate, activeTab, refreshAdminSession, loadGames])

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
    if (createInFlight.current || creatingGame) return

    if (!(await hasSupabaseAdminSession())) {
      alert(ADMIN_SESSION_HINT)
      setAdminSessionOk(false)
      return
    }

    createInFlight.current = true
    setCreatingGame(true)
    try {
      const data = await createNewGame()
      setGames((prev) => [data as Game, ...prev])
      setShowCreateGame(false)
      setGamesError('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Ошибка создания игры:', err)
      alert('Ошибка создания игры: ' + msg)
    } finally {
      createInFlight.current = false
      setCreatingGame(false)
    }
  }

  const openCloneModal = (game: Game) => {
    setCloneSource(game)
    setCloneTitle(`Копия: ${game.title}`)
    setCloneCode(generateGameAccessCode())
    setCloneTheme(game.theme || 'new-year')
    if (themes.length === 0) {
      void loadThemes()
    }
  }

  const closeCloneModal = () => {
    if (cloneBusy) return
    setCloneSource(null)
  }

  const handleCloneGame = async () => {
    if (!cloneSource) return

    if (!(await hasSupabaseAdminSession())) {
      alert(ADMIN_SESSION_HINT)
      setAdminSessionOk(false)
      return
    }

    const title = cloneTitle.trim()
    const code = normalizeGameAccessCode(cloneCode)

    if (!title) {
      alert('Укажите название игры')
      return
    }
    if (!isValidGameAccessCode(code)) {
      alert('Код доступа: ровно 6 символов (латинские буквы A–Z и цифры 0–9)')
      return
    }

    setCloneBusy(true)
    try {
      const newGame = await cloneGame({
        sourceGameId: cloneSource.id,
        title,
        code,
        theme: cloneTheme,
      })

      const { data: fullGame, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', newGame.id)
        .maybeSingle()

      if (error) throw error

      if (fullGame) {
        setGames([fullGame as Game, ...games])
      } else {
        await loadGames()
      }

      setCloneSource(null)
      alert(
        `Игра скопирована.\n\nНазвание: ${newGame.title}\nНовый код для регистрации: ${newGame.code}\n\nКоманды и ответы не переносятся — новый заезд с чистого листа.`
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Ошибка клонирования:', err)
      alert('Ошибка клонирования: ' + msg)
    } finally {
      setCloneBusy(false)
    }
  }

  const deleteGame = async (gameId: string) => {
    if (deletingGameIds.has(gameId)) return

    if (!(await hasSupabaseAdminSession())) {
      alert(ADMIN_SESSION_HINT)
      setAdminSessionOk(false)
      return
    }

    if (!confirm('Вы уверены, что хотите удалить эту игру? Все связанные данные (вопросы, команды, ответы, медиа файлы) будут удалены безвозвратно.')) {
      return
    }

    setDeletingGameIds((prev) => new Set(prev).add(gameId))
    const snapshot = games.find((g) => g.id === gameId)

    setGames((prev) => prev.filter((g) => g.id !== gameId))

    try {
      const result = await deleteGameCompletely(gameId)
      if (!result.success) {
        throw new Error(result.error || 'Неизвестная ошибка')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Ошибка удаления игры:', err)
      if (snapshot) {
        setGames((prev) => [snapshot, ...prev])
      }
      alert('Ошибка удаления игры: ' + msg)
    } finally {
      setDeletingGameIds((prev) => {
        const next = new Set(prev)
        next.delete(gameId)
        return next
      })
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
              {getAdminDisplayName()}
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
            {adminSessionOk === false && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {ADMIN_SESSION_HINT}
              </div>
            )}

            {gamesError && (
              <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex flex-wrap items-center justify-between gap-2">
                <span>Не удалось загрузить список игр: {gamesError}</span>
                <button
                  type="button"
                  onClick={() => void loadGames()}
                  className="px-3 py-1 rounded bg-red-100 hover:bg-red-200 text-red-900 font-medium"
                >
                  Повторить
                </button>
              </div>
            )}

            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">Управление играми</h2>
              <div className="flex gap-2">

                <button
                  type="button"
                  onClick={() => void createGame()}
                  disabled={creatingGame || gamesLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-5 h-5" />
                  {creatingGame ? 'Создание…' : 'Создать игру'}
                </button>
              </div>
            </div>

            {gamesLoading && games.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                <p className="text-sm text-gray-500 mt-4">Загрузка списка игр…</p>
              </div>
            ) : games.length === 0 ? (
              <div className="bg-white rounded-lg p-12 text-center">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">
                  {gamesError ? 'Список игр недоступен' : 'Нет созданных игр'}
                </p>
                <button
                  type="button"
                  onClick={() => void createGame()}
                  disabled={creatingGame}
                  className="mt-4 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {creatingGame ? 'Создание…' : 'Создать первую игру'}
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
                        {game.code && (
                          <button
                            onClick={() => navigate(`/host/${game.code}`)}
                            className="p-3 sm:p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
                            title="Экран ведущего (проектор)"
                          >
                            <Presentation className="w-5 h-5 sm:w-6 sm:h-6" />
                          </button>
                        )}
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
                          onClick={() => openCloneModal(game)}
                          className="p-3 sm:p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
                          title="Клонировать игру (новый заезд)"
                        >
                          <Copy className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                        <button
                          onClick={() => navigate(`/admin/game/${game.id}/edit`)}
                          className="p-3 sm:p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
                          title="Редактировать"
                        >
                          <Edit className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setArchiveGame({ id: game.id, title: game.title })}
                          className="p-3 sm:p-2 text-amber-700 hover:bg-amber-50 rounded-lg transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
                          title="История заездов (архив CSV)"
                        >
                          <History className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteGame(game.id)}
                          disabled={deletingGameIds.has(game.id)}
                          className="p-3 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center disabled:opacity-40"
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
              onOpen={refreshGamesList}
            >
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Контроль игрового процесса</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Управляйте состоянием игры и отправляйте уведомления игрокам в реальном времени
                  </p>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <GameControls
                    games={games}
                    gamesLoading={gamesLoading}
                    gamesError={gamesError}
                    onRefreshGames={refreshGamesList}
                  />
                  <MessagePanel
                    games={games}
                    gamesLoading={gamesLoading}
                    gamesError={gamesError}
                    onRefreshGames={refreshGamesList}
                  />
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
                <TeamManagementManager
                  games={games}
                  gamesLoading={gamesLoading}
                  gamesError={gamesError}
                  onRefreshGames={refreshGamesList}
                />
              </div>
            </CollapsibleSection>
          </div>
        )}
      </div>

      {cloneSource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeCloneModal}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Клонировать игру</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Новый заезд: вопросы и настройки копируются, команды и ответы — нет.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCloneModal}
                disabled={cloneBusy}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              Источник: <span className="font-medium text-gray-700">{cloneSource.title}</span>
              {cloneSource.code ? ` (${cloneSource.code})` : ''}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
                <input
                  type="text"
                  value={cloneTitle}
                  onChange={(e) => setCloneTitle(e.target.value)}
                  disabled={cloneBusy}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Код доступа (6 символов)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cloneCode}
                    onChange={(e) => setCloneCode(normalizeGameAccessCode(e.target.value))}
                    maxLength={6}
                    disabled={cloneBusy}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-mono text-lg tracking-widest uppercase focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setCloneCode(generateGameAccessCode())}
                    disabled={cloneBusy}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
                  >
                    Сгенерировать
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тема оформления</label>
                {themes.length > 0 ? (
                  <select
                    value={cloneTheme}
                    onChange={(e) => setCloneTheme(e.target.value)}
                    disabled={cloneBusy}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    {themes.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.display_name || t.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={cloneTheme}
                    onChange={(e) => setCloneTheme(e.target.value)}
                    disabled={cloneBusy}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={closeCloneModal}
                disabled={cloneBusy}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void handleCloneGame()}
                disabled={cloneBusy}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold"
              >
                {cloneBusy ? 'Копирование…' : 'Создать копию'}
              </button>
            </div>
          </div>
        </div>
      )}

      {archiveGame && (
        <EventArchiveModal
          gameId={archiveGame.id}
          gameTitle={archiveGame.title}
          onClose={() => setArchiveGame(null)}
        />
      )}
    </div>
  )
}
