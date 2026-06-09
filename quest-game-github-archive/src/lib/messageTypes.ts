export type MessagePriority = 'низкий' | 'средний' | 'высокий' | 'критический'

export function priorityToMessageType(priority: MessagePriority, hasSound: boolean): string {
  let type: string
  switch (priority) {
    case 'низкий':
      type = 'low'
      break
    case 'средний':
      type = 'info'
      break
    case 'высокий':
      type = 'alert'
      break
    case 'критический':
      type = 'warning'
      break
    default:
      type = 'info'
  }
  if (hasSound && type !== 'warning') type = 'alert'
  return type
}

export function priorityFromMessageType(messageType: string): MessagePriority {
  if (messageType === 'alert') return 'высокий'
  if (messageType === 'warning') return 'критический'
  if (messageType === 'info') return 'средний'
  return 'низкий'
}
