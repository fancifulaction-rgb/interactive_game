import {
  resolveTeamProgressStatus,
  teamProgressLabel,
  type TeamProgressRow,
} from '../lib/teamProgress'
import type { GameSessionStatus } from '../lib/gameSessionState'

type TeamProgressBadgeProps = {
  sessionStatus: GameSessionStatus | null
  progress?: TeamProgressRow
  detailed?: boolean
}

const STATUS_CLASS: Record<string, string> = {
  waiting: 'bg-gray-100 text-gray-700 border-gray-200',
  in_game: 'bg-blue-50 text-blue-800 border-blue-200',
  finished: 'bg-green-50 text-green-800 border-green-200',
}

export default function TeamProgressBadge({
  sessionStatus,
  progress,
  detailed = false,
}: TeamProgressBadgeProps) {
  const status = resolveTeamProgressStatus(sessionStatus, progress)
  const label = teamProgressLabel(status, progress, detailed)
  const className = STATUS_CLASS[status] ?? STATUS_CLASS.waiting

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  )
}
