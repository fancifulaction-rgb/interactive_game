import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Send, AlertTriangle, Info, AlertCircle, Zap, Users, UserCheck } from 'lucide-react'

interface MessagePanelGame {
  id: string
  title: string
  code: string | null
}

interface MessagePanelProps {
  games: MessagePanelGame[]
  gamesLoading?: boolean
  gamesError?: string
  onRefreshGames?: () => void
}

interface Team {
  id: string
  team_name: string
  avatar_url: string | null
}

type Priority = 'низкий' | 'средний' | 'высокий' | 'критический'
type RecipientType = 'all' | 'selective'

const priorityConfig = {
  'низкий': {
    label: 'Низкий',
    icon: Info,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200'
  },
  'средний': {
    label: 'Средний',
    icon: AlertCircle,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200'
  },
  'высокий': {
    label: 'Высокий',
    icon: AlertTriangle,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200'
  },
  'критический': {
    label: 'Критический',
    icon: Zap,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200'
  }
}

export default function MessagePanel({
  games,
  gamesLoading = false,
  gamesError = '',
  onRefreshGames,
}: MessagePanelProps) {
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedGameId, setSelectedGameId] = useState<string>('')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState<Priority>('средний')
  const [hasSound, setHasSound] = useState(false)
  const [recipientType, setRecipientType] = useState<RecipientType>('all')
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setSelectedGameId((current) => {
      if (games.length === 0) return ''
      if (games.some((g) => g.id === current)) return current
      return games[0].id
    })
  }, [games])

  useEffect(() => {
    if (selectedGameId) {
      loadTeams()
      // Сброс выбранных команд при смене игры
      setSelectedTeamIds([])
    }
  }, [selectedGameId])

  const loadTeams = async () => {
    if (!selectedGameId) return

    try {
      const { data, error } = await supabase
        .from('teams')
        .select('id, team_name, avatar_url')
        .eq('game_id', selectedGameId)
        .order('team_name', { ascending: true })

      if (error) throw error
      setTeams(data || [])
    } catch (err: any) {
      console.error('Ошибка загрузки команд:', err)
      setTeams([])
    }
  }

  const toggleTeamSelection = (teamId: string) => {
    setSelectedTeamIds(prev => 
      prev.includes(teamId)
        ? prev.filter(id => id !== teamId)
        : [...prev, teamId]
    )
  }

  const selectAllTeams = () => {
    setSelectedTeamIds(teams.map(t => t.id))
  }

  const deselectAllTeams = () => {
    setSelectedTeamIds([])
  }

  const sendMessage = async () => {
    if (!selectedGameId || !message.trim()) {
      alert('Заполните все поля')
      return
    }

    // Валидация для селективной доставки
    if (recipientType === 'selective' && selectedTeamIds.length === 0) {
      alert('Выберите хотя бы одну команду для отправки сообщения')
      return
    }

    setSending(true)
    try {
      const adminUsername = localStorage.getItem('admin_username') || 'Администратор'

      // Создать сообщение
      const { data: messageData, error: messageError } = await supabase
        .from('messages')
        .insert({
          game_id: selectedGameId,
          content: message.trim(),
          message_type: hasSound ? 'alert' : 'info',
          sender: adminUsername,
          // Дополнительные поля, которые мы можем сохранять в JSON или добавить колонки, 
          // но пока используем существующую схему messages
        })
        .select()
        .single()

      if (messageError) throw messageError

      // Если селективная доставка - добавить получателей
      if (recipientType === 'selective' && selectedTeamIds.length > 0 && messageData) {
        const recipients = selectedTeamIds.map(teamId => ({
          message_id: messageData.id,
          team_id: teamId
        }))

        const { error: recipientsError } = await supabase
          .from('message_recipients')
          .insert(recipients)

        if (recipientsError) throw recipientsError
      }

      const recipientText = recipientType === 'all' 
        ? 'всем игрокам' 
        : `${selectedTeamIds.length} команде(ам)`
      
      alert(`Сообщение отправлено ${recipientText}`)
      
      // Очистка формы
      setMessage('')
      setHasSound(false)
      setSelectedTeamIds([])
      setRecipientType('all')
    } catch (err: any) {
      console.error('Ошибка отправки сообщения:', err)
      alert('Ошибка: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  const selectedGame = games.find(g => g.id === selectedGameId)

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Send className="w-5 h-5" />
        Уведомления игрокам
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Игра
          </label>
          <select
            value={selectedGameId}
            onChange={(e) => setSelectedGameId(e.target.value)}
            disabled={gamesLoading && games.length === 0}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-60"
          >
            {gamesLoading && games.length === 0 ? (
              <option value="">Загрузка игр…</option>
            ) : games.length === 0 ? (
              <option value="">Нет игр</option>
            ) : (
              games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.title} ({game.code})
                </option>
              ))
            )}
          </select>
          {gamesError && (
            <p className="mt-2 text-sm text-red-600">{gamesError}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Получатели
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setRecipientType('all')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                recipientType === 'all'
                  ? 'bg-purple-50 border-purple-300 text-purple-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <Users className="w-4 h-4" />
              <span className="font-medium text-sm">Всем командам</span>
            </button>
            <button
              onClick={() => setRecipientType('selective')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                recipientType === 'selective'
                  ? 'bg-purple-50 border-purple-300 text-purple-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span className="font-medium text-sm">Выбрать команды</span>
            </button>
          </div>
        </div>

        {recipientType === 'selective' && (
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">
                Выбрано: {selectedTeamIds.length} из {teams.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={selectAllTeams}
                  className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                >
                  Выбрать все
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={deselectAllTeams}
                  className="text-xs text-gray-600 hover:text-gray-800 font-medium"
                >
                  Снять все
                </button>
              </div>
            </div>

            {teams.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                Нет команд в этой игре
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {teams.map(team => (
                  <label
                    key={team.id}
                    className="flex items-center gap-3 p-2 rounded hover:bg-white cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTeamIds.includes(team.id)}
                      onChange={() => toggleTeamSelection(team.id)}
                      className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                    />
                    {team.avatar_url && (
                      <img
                        src={team.avatar_url}
                        alt={team.team_name}
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    )}
                    <span className="text-sm font-medium text-gray-700">
                      {team.team_name}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Сообщение
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Введите сообщение для игроков..."
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Приоритет
          </label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(priorityConfig).map(([key, config]) => {
              const Icon = config.icon
              return (
                <button
                  key={key}
                  onClick={() => setPriority(key as Priority)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                    priority === key
                      ? `${config.bg} ${config.border} ${config.color}`
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium text-sm">{config.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <input
            type="checkbox"
            id="hasSound"
            checked={hasSound}
            onChange={(e) => setHasSound(e.target.checked)}
            className="w-5 h-5 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
          />
          <label htmlFor="hasSound" className="text-sm font-medium text-gray-700 cursor-pointer">
            Звуковое уведомление
          </label>
        </div>

        <button
          onClick={sendMessage}
          disabled={sending || !message.trim()}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
        >
          <Send className="w-5 h-5" />
          {sending ? 'Отправка...' : (
            recipientType === 'all' 
              ? 'Отправить всем игрокам' 
              : `Отправить ${selectedTeamIds.length > 0 ? selectedTeamIds.length : ''} команде(ам)`
          )}
        </button>
      </div>
    </div>
  )
}
