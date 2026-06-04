import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Pause } from 'lucide-react'

interface GameState {
  id: number
  game_id: string
  is_paused: boolean
  paused_at: string | null
  paused_by: string | null
}

interface GameStateManagerProps {
  gameId: string
  onPauseChange: (isPaused: boolean) => void
}

export default function GameStateManager({ gameId, onPauseChange }: GameStateManagerProps) {
  const [gameState, setGameState] = useState<GameState | null>(null)

  useEffect(() => {
    if (!gameId) return

    // Загрузить текущее состояние
    loadGameState()

    // Подписаться на изменения состояния
    const channel = supabase
      .channel(`game-state-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_state',
          filter: `game_id=eq.${gameId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newState = payload.new as GameState
            setGameState(newState)
            onPauseChange(newState.is_paused)
          } else if (payload.eventType === 'DELETE') {
            setGameState(null)
            onPauseChange(false)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId])

  const loadGameState = async () => {
    try {
      const { data, error } = await supabase
        .from('game_state')
        .select('*')
        .eq('game_id', gameId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error
      
      if (data) {
        setGameState(data)
        onPauseChange(data.is_paused)
      }
    } catch (err: any) {
      console.error('Ошибка загрузки состояния игры:', err)
    }
  }

  if (!gameState?.is_paused) return null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        <div className="mb-6">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Pause className="w-10 h-10 text-orange-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Игра приостановлена
          </h2>
          <p className="text-gray-600">
            Администратор временно остановил игру
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-600 mb-1">Приостановил</p>
          <p className="font-semibold text-gray-800">
            {gameState.paused_by || 'Администратор'}
          </p>
          {gameState.paused_at && (
            <p className="text-xs text-gray-500 mt-2">
              {new Date(gameState.paused_at).toLocaleString('ru-RU')}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 text-orange-600">
            <div className="w-2 h-2 bg-orange-600 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium">Ожидание продолжения...</span>
          </div>
          <p className="text-xs text-gray-500">
            Таймер остановлен. Игра возобновится автоматически.
          </p>
        </div>
      </div>
    </div>
  )
}
