import { useCallback, useEffect, useState } from 'react'
import { Check, Clock, RotateCcw, X } from 'lucide-react'
import {
  enqueueListPendingAnswers,
  enqueueListPosthocAnswers,
  enqueueModerateAnswer,
  enqueuePosthocAcceptAnswer,
  type PendingAnswerRow,
  type PosthocAnswerRow,
} from '../lib/answerModeration'
import { formatErrorMessage } from '../lib/errorMessage'

type ModerationTab = 'pending' | 'posthoc'

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
  const [tab, setTab] = useState<ModerationTab>('pending')
  const [pendingRows, setPendingRows] = useState<PendingAnswerRow[]>([])
  const [posthocRows, setPosthocRows] = useState<PosthocAnswerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!gameId) return
    setLoading(true)
    setError('')
    try {
      const [pending, posthoc] = await Promise.all([
        enqueueListPendingAnswers(gameId),
        enqueueListPosthocAnswers(gameId),
      ])
      setPendingRows(pending)
      setPosthocRows(posthoc)
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

  const handlePendingAction = async (
    row: PendingAnswerRow,
    action: 'accept' | 'reject'
  ) => {
    setActingId(row.answer_id)
    setError('')
    try {
      await enqueueModerateAnswer(row.answer_id, action, {
        gameId,
        teamId: row.team_id,
      })
      setPendingRows((prev) => prev.filter((r) => r.answer_id !== row.answer_id))
    } catch (err) {
      setError(formatErrorMessage(err))
    } finally {
      setActingId(null)
    }
  }

  const handlePosthocAccept = async (row: PosthocAnswerRow) => {
    setActingId(row.answer_id)
    setError('')
    try {
      await enqueuePosthocAcceptAnswer(row.answer_id, {
        gameId,
        teamId: row.team_id,
      })
      setPosthocRows((prev) => prev.filter((r) => r.answer_id !== row.answer_id))
    } catch (err) {
      setError(formatErrorMessage(err))
    } finally {
      setActingId(null)
    }
  }

  if (!gameId) return null

  const activeRows = tab === 'pending' ? pendingRows : posthocRows
  const badgeCount =
    tab === 'pending' ? pendingRows.length : posthocRows.length

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Модерация ответов
          {badgeCount > 0 && (
            <span className="text-xs font-medium bg-indigo-200 text-indigo-900 px-2 py-0.5 rounded-full">
              {badgeCount}
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

      <div className="flex gap-1 rounded-lg bg-indigo-100/80 p-0.5 w-fit">
        <button
          type="button"
          onClick={() => setTab('pending')}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            tab === 'pending'
              ? 'bg-white text-indigo-900 shadow-sm'
              : 'text-indigo-700 hover:text-indigo-900'
          }`}
        >
          На проверке
          {pendingRows.length > 0 && ` (${pendingRows.length})`}
        </button>
        <button
          type="button"
          onClick={() => setTab('posthoc')}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            tab === 'posthoc'
              ? 'bg-white text-indigo-900 shadow-sm'
              : 'text-indigo-700 hover:text-indigo-900'
          }`}
        >
          Пересмотр
          {posthocRows.length > 0 && ` (${posthocRows.length})`}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </p>
      )}

      {loading && activeRows.length === 0 ? (
        <p className="text-sm text-indigo-800">Загрузка…</p>
      ) : activeRows.length === 0 ? (
        <p className="text-sm text-indigo-800">
          {tab === 'pending'
            ? 'Нет ответов на проверке.'
            : 'Нет отклонённых ответов для пересмотра.'}
        </p>
      ) : (
        <ul className="space-y-2 max-h-56 overflow-y-auto">
          {tab === 'pending'
            ? pendingRows.map((row) => {
                const mediaCount = Array.isArray(row.media_urls)
                  ? row.media_urls.length
                  : 0
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
                          onClick={() => void handlePendingAction(row, 'accept')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Принять
                        </button>
                        <button
                          type="button"
                          disabled={busy || !!actingId}
                          onClick={() => void handlePendingAction(row, 'reject')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          Отклонить
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })
            : posthocRows.map((row) => {
                const mediaCount = Array.isArray(row.media_urls)
                  ? row.media_urls.length
                  : 0
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
                        <p className="text-xs text-amber-700 mt-0.5">
                          Авто: неверно · можно засчитать вручную
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          disabled={busy || !!actingId}
                          onClick={() => void handlePosthocAccept(row)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Засчитать
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
