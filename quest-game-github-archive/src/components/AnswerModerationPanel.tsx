import { useCallback, useEffect, useState } from 'react'
import { Check, Clock, X } from 'lucide-react'
import {
  enqueueListPendingAnswers,
  enqueueModerateAnswer,
  type PendingAnswerRow,
} from '../lib/answerModeration'
import { formatErrorMessage } from '../lib/errorMessage'

function formatAnswerPreview(answer: unknown): string {
  if (Array.isArray(answer)) {
    const parts = answer
      .map((v) => (typeof v === 'string' ? v.trim() : String(v)))
      .filter(Boolean)
    if (parts.length) return parts.join(', ')
  }
  if (typeof answer === 'string' && answer.trim()) return answer.trim()
  return '— (только медиа)'
}

interface AnswerModerationPanelProps {
  gameId: string
}

export default function AnswerModerationPanel({ gameId }: AnswerModerationPanelProps) {
  const [rows, setRows] = useState<PendingAnswerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!gameId) return
    setLoading(true)
    setError('')
    try {
      const data = await enqueueListPendingAnswers(gameId)
      setRows(data)
    } catch (err) {
      setError(formatErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [gameId])

  useEffect(() => {
    void reload()
    const timer = window.setInterval(() => void reload(), 12_000)
    return () => window.clearInterval(timer)
  }, [reload])

  const handleAction = async (row: PendingAnswerRow, action: 'accept' | 'reject') => {
    setActingId(row.answer_id)
    setError('')
    try {
      await enqueueModerateAnswer(row.answer_id, action, {
        gameId,
        teamId: row.team_id,
      })
      setRows((prev) => prev.filter((r) => r.answer_id !== row.answer_id))
    } catch (err) {
      setError(formatErrorMessage(err))
    } finally {
      setActingId(null)
    }
  }

  if (!gameId) return null

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Модерация ответов
          {rows.length > 0 && (
            <span className="text-xs font-medium bg-indigo-200 text-indigo-900 px-2 py-0.5 rounded-full">
              {rows.length}
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading || !!actingId}
          className="text-xs text-indigo-700 hover:underline disabled:opacity-50"
        >
          Обновить
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </p>
      )}

      {loading && rows.length === 0 ? (
        <p className="text-sm text-indigo-800">Загрузка очереди…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-indigo-800">Нет ответов на проверке.</p>
      ) : (
        <ul className="space-y-2 max-h-56 overflow-y-auto">
          {rows.map((row) => {
            const mediaCount = Array.isArray(row.media_urls) ? row.media_urls.length : 0
            const busy = actingId === row.answer_id
            return (
              <li
                key={row.answer_id}
                className="bg-white border border-indigo-100 rounded-lg px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">
                      {row.team_name || 'Команда'} · вопрос {row.question_number}
                    </p>
                    <p className="text-gray-700 break-words">
                      {formatAnswerPreview(row.answer)}
                    </p>
                    {mediaCount > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Медиа: {mediaCount}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      disabled={busy || !!actingId}
                      onClick={() => void handleAction(row, 'accept')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Принять
                    </button>
                    <button
                      type="button"
                      disabled={busy || !!actingId}
                      onClick={() => void handleAction(row, 'reject')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      Отклонить
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
