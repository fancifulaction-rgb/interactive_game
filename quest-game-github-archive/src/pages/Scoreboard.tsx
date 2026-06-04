import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Trophy, Medal, Award, Settings, Download, FileText, FileSpreadsheet } from 'lucide-react'
import { exportToExcel, exportToPDF, exportToCSV, exportAllFormats } from '../utils/exportData'

interface TeamScore {
  id: string
  team_name: string
  captain_name: string
  avatar_url: string | null
  total_score: number
  registration_time: string
}

export default function Scoreboard() {
  const { gameCode } = useParams()
  const navigate = useNavigate()
  const [teams, setTeams] = useState<TeamScore[]>([])
  const [game, setGame] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  // Проверяем статус администратора
  useEffect(() => {
    const adminLoggedIn = localStorage.getItem('admin_logged_in')
    setIsAdmin(!!adminLoggedIn)
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [gameCode])

  const loadData = async () => {
    try {
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('code', gameCode)
        .maybeSingle()

      if (gameError) throw gameError
      if (!gameData) return

      setGame(gameData)

      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('*')
        .eq('game_id', gameData.id)
        .order('total_score', { ascending: false })

      if (teamsError) throw teamsError
      setTeams(teamsData || [])
    } catch (err: any) {
      console.error('Ошибка загрузки табло:', err)
    } finally {
      setLoading(false)
    }
  }

  const getMedalIcon = (position: number) => {
    if (position === 0) return <Trophy className="w-8 h-8 text-yellow-500" />
    if (position === 1) return <Medal className="w-8 h-8 text-gray-400" />
    if (position === 2) return <Award className="w-8 h-8 text-amber-700" />
    return null
  }

  const handleExport = async (format: 'excel' | 'pdf' | 'csv' | 'all') => {
    if (!game) return
    
    setExporting(true)
    setShowExportMenu(false)
    
    try {
      switch (format) {
        case 'excel':
          await exportToExcel(game.id, game.title)
          break
        case 'pdf':
          await exportToPDF(game.id, game.title)
          break
        case 'csv':
          await exportToCSV(game.id, game.title)
          break
        case 'all':
          await exportAllFormats(game.id, game.title)
          break
      }
      alert('Экспорт завершен успешно')
    } catch (error) {
      console.error('Ошибка экспорта:', error)
      alert('Ошибка при экспорте данных')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
        <div className="text-white text-xl">Загрузка табло...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-pink-600 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
          {isAdmin && (
            <button
              onClick={() => navigate('/admin/panel')}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-all text-sm sm:text-base"
            >
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">В панель администратора</span>
              <span className="sm:hidden">Админ</span>
            </button>
          )}

          <h1 className="text-2xl sm:text-3xl font-bold text-white text-center">Табло результатов</h1>

          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={exporting}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-all disabled:opacity-50 text-sm sm:text-base"
            >
              <Download className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">{exporting ? 'Экспорт...' : 'Экспорт'}</span>
              <span className="sm:hidden">{exporting ? 'Эксп.' : 'Экспорт'}</span>
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-2 bg-white rounded-lg shadow-lg z-10 min-w-[200px]">
                <button
                  onClick={() => handleExport('excel')}
                  className="flex items-center gap-2 w-full px-4 py-3 hover:bg-gray-50 text-gray-800 transition-all"
                >
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  Excel
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  className="flex items-center gap-2 w-full px-4 py-3 hover:bg-gray-50 text-gray-800 transition-all"
                >
                  <FileText className="w-4 h-4 text-red-600" />
                  PDF
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="flex items-center gap-2 w-full px-4 py-3 hover:bg-gray-50 text-gray-800 transition-all"
                >
                  <FileText className="w-4 h-4 text-blue-600" />
                  CSV
                </button>
                <button
                  onClick={() => handleExport('all')}
                  className="flex items-center gap-2 w-full px-4 py-3 hover:bg-gray-50 text-gray-800 transition-all border-t"
                >
                  <Download className="w-4 h-4 text-purple-600" />
                  Все форматы
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">
              {game?.title || 'Загрузка...'}
            </h2>
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

          <div className="mt-6 text-center">
            <p className="text-white/80 text-sm">
              Обновляется автоматически каждые 5 секунд
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}