import { useEffect, useState } from 'react'
import { msUntil } from '../lib/gameSchedule'

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'скоро'
  const totalSec = Math.ceil(ms / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days} д.`)
  if (hours > 0 || days > 0) parts.push(`${hours} ч.`)
  parts.push(`${minutes} мин.`)
  if (days === 0 && hours === 0) parts.push(`${seconds} сек.`)
  return parts.join(' ')
}

type ScheduleCountdownProps = {
  targetIso: string | null | undefined
  label: string
  className?: string
}

export default function ScheduleCountdown({
  targetIso,
  label,
  className = '',
}: ScheduleCountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(() => msUntil(targetIso))

  useEffect(() => {
    const tick = () => setRemaining(msUntil(targetIso))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetIso])

  if (!targetIso || remaining === null) return null
  if (remaining <= 0) return null

  return (
    <p className={`text-sm ${className}`}>
      {label}: <span className="font-semibold">{formatRemaining(remaining)}</span>
    </p>
  )
}
