import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getTeamRegistrationSince } from '../lib/playerSession'
import { enqueueBackground } from '../lib/requestQueue'
import { X, Info, AlertCircle, AlertTriangle, Zap } from 'lucide-react'

type Priority = 'низкий' | 'средний' | 'высокий' | 'критический'

interface GameMessage {
  id: string
  content: string
  message_type: string
  created_at: string
  message_recipients?: { team_id: string }[]
}

const priorityFromType = (messageType: string): Priority => {
  if (messageType === 'alert') return 'высокий'
  if (messageType === 'warning') return 'критический'
  if (messageType === 'info') return 'средний'
  return 'низкий'
}

const priorityConfig = {
  низкий: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-300' },
  средний: { icon: AlertCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-300' },
  высокий: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-300' },
  критический: { icon: Zap, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-300' },
}

interface NotificationPopupProps {
  gameId: string
}

export default function NotificationPopup({ gameId }: NotificationPopupProps) {
  const [notifications, setNotifications] = useState<
    (GameMessage & { priority: Priority; has_sound: boolean })[]
  >([])
  const teamId = localStorage.getItem('team_id')

  useEffect(() => {
    if (!gameId || !teamId) return
    void enqueueBackground(() => loadUnreadMessages())
  }, [gameId, teamId])

  const isMessageForTeam = (msg: GameMessage, tid: string): boolean => {
    const recipients = msg.message_recipients ?? []
    if (recipients.length === 0) return true
    return recipients.some((r) => r.team_id === tid)
  }

  const loadUnreadMessages = async () => {
    if (!teamId) return
    const since = getTeamRegistrationSince()
    if (!since) return

    try {
      const [messagesResult, readsResult] = await Promise.all([
        supabase
          .from('messages')
          .select('id, content, message_type, created_at, message_recipients(team_id)')
          .eq('game_id', gameId)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('message_reads').select('message_id').eq('team_id', teamId),
      ])

      if (messagesResult.error) {
        if (messagesResult.error.code !== 'PGRST205') {
          console.error('Ошибка загрузки сообщений:', messagesResult.error)
        }
        return
      }

      const readIds = new Set((readsResult.data ?? []).map((r) => r.message_id))

      for (const msg of messagesResult.data ?? []) {
        if (readIds.has(msg.id)) continue
        if (!isMessageForTeam(msg, teamId)) continue
        showNotification(msg)
      }
    } catch (err) {
      console.error('Ошибка загрузки сообщений:', err)
    }
  }

  const showNotification = (message: GameMessage) => {
    if (notifications.some((n) => n.id === message.id)) return
    setNotifications((prev) => [
      ...prev,
      {
        ...message,
        priority: priorityFromType(message.message_type),
        has_sound: message.message_type === 'alert',
      },
    ])
  }

  const dismissNotification = async (messageId: string) => {
    if (teamId) {
      await supabase.from('message_reads').insert({ message_id: messageId, team_id: teamId })
    }
    setNotifications((prev) => prev.filter((n) => n.id !== messageId))
  }

  if (notifications.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 max-w-sm w-full">
      {notifications.map((notification) => {
        const config = priorityConfig[notification.priority]
        const Icon = config.icon
        return (
          <div
            key={notification.id}
            className={`${config.bg} ${config.border} border-2 rounded-lg shadow-xl p-4`}
          >
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 ${config.color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 mb-1">Сообщение от администратора</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                  {notification.content}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {new Date(notification.created_at).toLocaleTimeString('ru-RU')}
                </p>
              </div>
              <button
                onClick={() => dismissNotification(notification.id)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
