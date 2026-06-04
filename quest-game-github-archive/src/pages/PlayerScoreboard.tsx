import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Trophy, Medal, Award } from 'lucide-react'

interface TeamScore {
  id: string
  team_name: string
  captain_name: string
  avatar_url: string | null
  total_score: number
  registration_time: string
}

export default function PlayerScoreboard() {
  const { gameCode } = useParams()
  const [teams, setTeams] = useState<TeamScore[]>([])
  const [game, setGame] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    
    // 🚀 НОВАЯ ФИЧА: Realtime подписка на teams для мгновенного обновления табло
    let teamsChannel: any = null
    
    const setupRealtimeSubscription = async () => {
      if (!game?.id) return
      
      console.log('🔄 Настраиваем realtime подписку на teams для игры:', game.id)
      
      teamsChannel = supabase
        .channel(`teams-scoreboard-${game.id}`)
        .on('postgres_changes', {
          event: '*', // Слушаем все изменения: INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'teams',
          filter: `game_id=eq.${game.id}`
        }, (payload) => {
          console.log('📊 Realtime изменение в teams:', payload)
          
          // При любом изменении в teams - перезагружаем данные
          loadData()
        })
        .subscribe((status) => {
          console.log('📡 Статус realtime подписки teams:', status)
        })
    }
    
    // Настраиваем подписку после загрузки данных
    if (game?.id) {
      setupRealtimeSubscription()
    }
    
    return () => {
      // Отписываемся от realtime при размонтировании
      if (teamsChannel) {
        console.log('🔄 Отписываемся от realtime teams')
        supabase.removeChannel(teamsChannel)
      }
    }
  }, [gameCode, game?.id])
  
  // Отдельный useEffect для первоначальной загрузки
  useEffect(() => {
    loadInitialData()
  }, [gameCode])
  
  const loadInitialData = async () => {
    try {
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('code', gameCode)
        .maybeSingle()

      if (gameError) throw gameError
      if (!gameData) return

      setGame(gameData)
      setLoading(false)
    } catch (err: any) {
      console.error('Ошибка загрузки игры:', err)
      setLoading(false)
    }
  }

  const loadData = async () => {
    try {
      if (!game?.id) {
        console.log('🔄 loadData: game.id не найден, пропускаем загрузку teams')
        return
      }
      
      console.log('📊 Загружаем команды для табло, game_id:', game.id)
      
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('*')
        .eq('game_id', game.id)
        .order('total_score', { ascending: false })

      if (teamsError) throw teamsError
      
      console.log('📊 Загружено команд для табло:', teamsData?.length || 0)
      setTeams(teamsData || [])
    } catch (err: any) {
      console.error('Ошибка загрузки команд табло:', err)
    }
  }

  const getMedalIcon = (position: number) => {
    if (position === 0) return <Trophy className="w-8 h-8 text-yellow-500" />
    if (position === 1) return <Medal className="w-8 h-8 text-gray-400" />
    if (position === 2) return <Award className="w-8 h-8 text-amber-700" />
    return null
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
        <div className="flex justify-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white text-center">Табло результатов</h1>
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
