import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Pause, Play, AlertCircle } from 'lucide-react'

interface Game {
  id: string
  title: string
  code: string | null
}

interface GameState {
  id: number
  game_id: string
  is_paused: boolean
  paused_at: string | null
  paused_by: string | null
}

export default function GameControls() {
  const [games, setGames] = useState<Game[]>([])
  const [selectedGameId, setSelectedGameId] = useState<string>('')
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadGames()
  }, [])

  useEffect(() => {
    if (selectedGameId) {
      loadGameState()
      subscribeToGameState()
    }
  }, [selectedGameId])

  const loadGames = async () => {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('id, title, code')
        .order('created_at', { ascending: false })

      if (error) throw error
      setGames(data || [])
      if (data && data.length > 0) {
        setSelectedGameId(data[0].id)
      }
    } catch (err: any) {
      console.error('Ошибка загрузки игр:', err)
    }
  }

  const loadGameState = async () => {
    try {
      const { data, error } = await supabase
        .from('game_state')
        .select('*')
        .eq('game_id', selectedGameId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error
      setGameState(data)
    } catch (err: any) {
      console.error('Ошибка загрузки состояния игры:', err)
    }
  }

  const subscribeToGameState = () => {
    const channel = supabase
      .channel(`game-state-${selectedGameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_state',
          filter: `game_id=eq.${selectedGameId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setGameState(payload.new as GameState)
          } else if (payload.eventType === 'DELETE') {
            setGameState(null)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const togglePause = async () => {
    if (!selectedGameId) return

    setLoading(true)
    try {
      const adminUsername = localStorage.getItem('admin_username') || 'Администратор'
      const isPaused = !gameState?.is_paused

      if (gameState) {
        // Обновить существующую запись
        const { error } = await supabase
          .from('game_state')
          .update({
            is_paused: isPaused,
            paused_at: isPaused ? new Date().toISOString() : null,
            paused_by: isPaused ? adminUsername : null,
            updated_at: new Date().toISOString()
          })
          .eq('game_id', selectedGameId)

        if (error) throw error
      } else {
        // Создать новую запись
        const { error } = await supabase
          .from('game_state')
          .insert({
            game_id: selectedGameId,
            is_paused: isPaused,
            paused_at: isPaused ? new Date().toISOString() : null,
            paused_by: isPaused ? adminUsername : null
          })

        if (error) throw error
      }
    } catch (err: any) {
      console.error('Ошибка изменения состояния игры:', err)
      alert('Ошибка: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const selectedGame = games.find(g => g.id === selectedGameId)

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
        <AlertCircle className="w-5 h-5" />
        Управление игрой
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Выберите игру
          </label>
          <select
            value={selectedGameId}
            onChange={(e) => setSelectedGameId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            {games.map(game => (
              <option key={game.id} value={game.id}>
                {game.title} ({game.code})
              </option>
            ))}
          </select>
        </div>

        {selectedGame && (
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-gray-600">Статус игры</p>
                <p className={`text-lg font-bold ${gameState?.is_paused ? 'text-orange-600' : 'text-green-600'}`}>
                  {gameState?.is_paused ? 'На паузе' : 'Активна'}
                </p>
              </div>
              {gameState?.is_paused && gameState.paused_by && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">Приостановил</p>
                  <p className="text-sm font-medium">{gameState.paused_by}</p>
                </div>
              )}
            </div>

            <button
              onClick={togglePause}
              disabled={loading}
              className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
                gameState?.is_paused
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-orange-600 hover:bg-orange-700 text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {gameState?.is_paused ? (
                <>
                  <Play className="w-5 h-5" />
                  Возобновить игру
                </>
              ) : (
                <>
                  <Pause className="w-5 h-5" />
                  Приостановить игру
                </>
              )}
            </button>

            {gameState?.is_paused && gameState.paused_at && (
              <p className="text-xs text-gray-500 text-center mt-2">
                Приостановлена {new Date(gameState.paused_at).toLocaleString('ru-RU')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
