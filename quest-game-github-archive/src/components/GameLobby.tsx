import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Users, Hourglass } from 'lucide-react'

type LobbyTeam = {
  id: string
  team_name: string | null
  name: string | null
  captain_name: string | null
}

interface GameLobbyProps {
  gameId: string
  gameTitle: string
  myTeamName?: string | null
}

export default function GameLobby({ gameId, gameTitle, myTeamName }: GameLobbyProps) {
  const [teams, setTeams] = useState<LobbyTeam[]>([])

  const loadTeams = async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('id, team_name, name, captain_name')
      .eq('game_id', gameId)
      .order('registration_time', { ascending: true })

    if (!error && data) setTeams(data)
  }

  useEffect(() => {
    void loadTeams()

    const channel = supabase
      .channel(`lobby-teams-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teams',
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void loadTeams()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId])

  const displayName = (t: LobbyTeam) =>
    (t.team_name || t.name || 'Команда').trim()

  return (
    <div className="min-h-screen theme-background flex items-center justify-center p-4" style={{
      background: 'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)',
    }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Hourglass className="w-8 h-8 text-purple-600 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">{gameTitle}</h1>
          <p className="text-gray-600">Комната ожидания</p>
          {myTeamName && (
            <p className="text-sm text-purple-700 mt-2 font-medium">Вы: {myTeamName}</p>
          )}
        </div>

        <div className="bg-purple-50 rounded-xl p-4 mb-6 text-center">
          <p className="text-gray-700">
            Ожидайте сигнала ведущего. Игра начнётся, когда администратор нажмёт{' '}
            <span className="font-semibold">«Начать игру»</span>.
          </p>
          <div className="flex items-center justify-center gap-2 mt-3 text-purple-700">
            <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse" />
            <span className="text-sm font-medium">Подключение активно</span>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Команды ({teams.length})
          </h2>
          {teams.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">Пока только вы</p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {teams.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm"
                >
                  <span className="font-medium text-gray-800">{displayName(t)}</span>
                  {t.captain_name && (
                    <span className="text-gray-500 text-xs">{t.captain_name}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
