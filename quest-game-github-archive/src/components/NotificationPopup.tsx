import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { X, Info, AlertCircle, AlertTriangle, Zap } from 'lucide-react'

interface AdminMessage {
  id: number
  message: string
  priority: 'низкий' | 'средний' | 'высокий' | 'критический'
  has_sound: boolean
  recipient_type: 'all' | 'selective'
  created_at: string
  message_recipients?: MessageRecipient[]
}

interface MessageRecipient {
  message_id: number
  team_id: string
}

const priorityConfig = {
  'низкий': {
    icon: Info,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    shadow: 'shadow-blue-200'
  },
  'средний': {
    icon: AlertCircle,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-300',
    shadow: 'shadow-green-200'
  },
  'высокий': {
    icon: AlertTriangle,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    shadow: 'shadow-orange-200'
  },
  'критический': {
    icon: Zap,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-300',
    shadow: 'shadow-red-200'
  }
}

interface NotificationPopupProps {
  gameId: string
}

export default function NotificationPopup({ gameId }: NotificationPopupProps) {
  const [notifications, setNotifications] = useState<AdminMessage[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const teamId = localStorage.getItem('team_id')

  useEffect(() => {
    if (!gameId || !teamId) return

    // Загрузить непрочитанные сообщения
    loadUnreadMessages()

    // Подписаться на новые сообщения
    const channel = supabase
      .channel(`admin-messages-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_messages',
          filter: `game_id=eq.${gameId}`
        },
        async (payload) => {
          const newMessage = payload.new as AdminMessage
          
          // Проверить, должна ли команда получить это сообщение
          const shouldReceive = await checkMessageRecipient(newMessage.id, teamId)
          if (shouldReceive) {
            // Дополнительная проверка - сообщение должно быть отправлено после регистрации команды
            const teamData = await supabase.from('teams').select('registration_time').eq('id', teamId).single()
            const gameStateData = await supabase.from('game_state').select('*').eq('game_id', gameId).single()
            
            if (!teamData.error) {
              const registrationTime = teamData.data.registration_time
              
              // Проверить что сообщение отправлено после регистрации команды
              const messageTime = new Date(newMessage.created_at)
              const teamRegTime = new Date(registrationTime)
              const isMessageRecent = messageTime >= teamRegTime
              
              if (isMessageRecent) {
                showNotification(newMessage)
              }
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId, teamId])

  const checkMessageRecipient = async (messageId: number, teamId: string): Promise<boolean> => {
    try {
      // Получить сообщение с информацией о получателях
      const { data: message, error } = await supabase
        .from('admin_messages')
        .select(`
          id,
          recipient_type,
          message_recipients (
            team_id
          )
        `)
        .eq('id', messageId)
        .single()

      if (error) throw error

      // Если сообщение для всех - вернуть true
      if (message.recipient_type === 'all') {
        return true
      }

      // Если селективное - проверить наличие команды в списке
      if (message.recipient_type === 'selective') {
        const recipients = message.message_recipients as MessageRecipient[]
        return recipients.some(r => r.team_id === teamId)
      }

      return false
    } catch (err) {
      console.error('Ошибка проверки получателя:', err)
      return false
    }
  }

  const loadUnreadMessages = async () => {
    try {
      // Получить время регистрации команды
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('registration_time')
        .eq('id', teamId)
        .single()

      if (teamError) {
        console.log('Ошибка получения данных команды:', teamError)
        return
      }

      const registrationTime = teamData.registration_time

      // Получить все сообщения для игры с информацией о получателях
      const { data: messages, error: messagesError } = await supabase
        .from('admin_messages')
        .select(`
          *,
          message_recipients (
            team_id
          )
        `)
        .eq('game_id', gameId)
        .gte('created_at', registrationTime) // Только сообщения после регистрации команды
        .order('created_at', { ascending: false })
        .limit(10)

      if (messagesError) throw messagesError

      if (messages && messages.length > 0) {
        // Получить прочитанные сообщения для команды
        const { data: reads, error: readsError } = await supabase
          .from('message_reads')
          .select('message_id')
          .eq('team_id', teamId)

        if (readsError) throw readsError

        const readIds = new Set(reads?.map(r => r.message_id) || [])
        
        // Фильтрация сообщений по получателям
        const filteredMessages = messages.filter(msg => {
          // Пропустить прочитанные
          if (readIds.has(msg.id)) return false
          
          // Если сообщение для всех
          if (msg.recipient_type === 'all') return true
          
          // Если селективное - проверить наличие команды в списке
          if (msg.recipient_type === 'selective') {
            const recipients = msg.message_recipients as MessageRecipient[]
            return recipients.some(r => r.team_id === teamId)
          }
          
          return false
        })

        // Показать непрочитанные
        filteredMessages.forEach(msg => showNotification(msg))
      }
    } catch (err: any) {
      console.error('Ошибка загрузки сообщений:', err)
    }
  }

  const showNotification = (message: AdminMessage) => {
    // Проверить, не показано ли уже это уведомление
    if (notifications.some(n => n.id === message.id)) {
      return
    }

    // Добавить уведомление в список
    setNotifications(prev => [...prev, message])

    // Воспроизвести звук если требуется
    if (message.has_sound) {
      playNotificationSound()
    }

    // Уведомление остается открытым до ручного закрытия пользователем
  }

  const playNotificationSound = () => {
    try {
      // Создание простого звукового сигнала
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = 800
      oscillator.type = 'sine'

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.5)
    } catch (err) {
      console.error('Ошибка воспроизведения звука:', err)
    }
  }

  const dismissNotification = async (messageId: number) => {
    // Отметить как прочитанное
    try {
      await supabase
        .from('message_reads')
        .insert({
          message_id: messageId,
          team_id: teamId
        })
    } catch (err: any) {
      // Игнорируем ошибку если уже прочитано
      console.log('Сообщение уже отмечено как прочитанное')
    }

    // Удалить из списка
    setNotifications(prev => prev.filter(n => n.id !== messageId))
  }

  if (notifications.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 max-w-sm w-full">
      {notifications.map(notification => {
        const config = priorityConfig[notification.priority]
        const Icon = config.icon

        return (
          <div
            key={notification.id}
            className={`${config.bg} ${config.border} border-2 rounded-lg shadow-xl p-4 animate-slide-in-right`}
            style={{
              animation: 'slideInRight 0.3s ease-out'
            }}
          >
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 ${config.color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 mb-1">
                  Сообщение от администратора
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                  {notification.message}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {new Date(notification.created_at).toLocaleTimeString('ru-RU')}
                </p>
              </div>
              <button
                onClick={() => dismissNotification(notification.id)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )
      })}

      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
