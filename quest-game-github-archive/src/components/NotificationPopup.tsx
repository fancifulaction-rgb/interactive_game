import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { attachGameRealtime } from '../lib/gameRealtime'
import { getTeamRegistrationSince } from '../lib/playerSession'
import { priorityFromMessageType } from '../lib/messageTypes'
import { X, Info, AlertCircle, AlertTriangle, Zap } from 'lucide-react'

type Priority = 'низкий' | 'средний' | 'высокий' | 'критический'

interface GameMessage {
  id: string
  content: string
  message_type: string
  created_at: string
  message_recipients?: { team_id: string }[]
}

const priorityConfig = {
  низкий: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-300' },
  средний: { icon: AlertCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-300' },
  высокий: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-300' },
  критический: { icon: Zap, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-300' },
}

const MESSAGE_POLL_MS = 5000

interface NotificationPopupProps {
  gameId: string
}

export default function NotificationPopup({ gameId }: NotificationPopupProps) {
  const [notifications, setNotifications] = useState<
    (GameMessage & { priority: Priority; has_sound: boolean })[]
  >([])
  const teamId = localStorage.getItem('team_id')
  const shownIdsRef = useRef<Set<string>>(new Set())
  const loadInFlightRef = useRef(false)

  const isMessageForTeam = useCallback((msg: GameMessage, tid: string): boolean => {
    const recipients = msg.message_recipients ?? []
    if (recipients.length === 0) return true
    return recipients.some((r) => r.team_id === tid)
  }, [])

  const showNotification = useCallback((message: GameMessage) => {
    if (shownIdsRef.current.has(message.id)) return
    shownIdsRef.current.add(message.id)

    const priority = priorityFromMessageType(message.message_type)
    setNotifications((prev) => {
      if (prev.some((n) => n.id === message.id)) return prev
      return [
        ...prev,
        {
          ...message,
          priority,
          has_sound: message.message_type === 'alert' || message.message_type === 'warning',
        },
      ]
    })

    if (message.message_type === 'alert' || message.message_type === 'warning') {
      try {
        const ctx = new AudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = message.message_type === 'warning' ? 880 : 660
        gain.gain.value = 0.08
        osc.start()
        osc.stop(ctx.currentTime + 0.15)
      } catch {
        /* optional sound */
      }
    }
  }, [])

  const loadUnreadMessages = useCallback(async () => {
    if (!teamId || loadInFlightRef.current) return
    loadInFlightRef.current = true

    const since = getTeamRegistrationSince() ?? new Date(0).toISOString()

    try {
      const [messagesResult, readsResult] = await Promise.all([
        supabase
          .from('messages')
          .select('id, content, message_type, created_at, message_recipients(team_id)')
          .eq('game_id', gameId)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('message_reads').select('message_id').eq('team_id', teamId),
      ])

      if (messagesResult.error) {
        if (messagesResult.error.code !== 'PGRST205') {
          console.error('Ошибка загрузки сообщений:', messagesResult.error)
        }
        return
      }

      const readIds = new Set((readsResult.data ?? []).map((r) => r.message_id))

      for (const msg of (messagesResult.data ?? []).reverse()) {
        if (readIds.has(msg.id)) continue
        if (!isMessageForTeam(msg, teamId)) continue
        showNotification(msg)
      }
    } catch (err) {
      console.error('Ошибка загрузки сообщений:', err)
    } finally {
      loadInFlightRef.current = false
    }
  }, [gameId, teamId, isMessageForTeam, showNotification])

  useEffect(() => {
    if (!gameId || !teamId) return

    void loadUnreadMessages()

    const detachRt = attachGameRealtime(gameId, {
      onMessagesChanged: () => {
        void loadUnreadMessages()
      },
    })

    const pollTimer = setInterval(() => {
      void loadUnreadMessages()
    }, MESSAGE_POLL_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadUnreadMessages()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      detachRt()
      clearInterval(pollTimer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [gameId, teamId, loadUnreadMessages])

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
