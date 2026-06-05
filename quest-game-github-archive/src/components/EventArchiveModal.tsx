import { useCallback, useEffect, useState } from 'react'
import { Download, History, X } from 'lucide-react'
import {
  downloadArchivedCsv,
  formatArchiveDuration,
  listEventArchivesForGame,
  type EventArchiveRow,
} from '../lib/eventArchive'

type Props = {
  gameId: string
  gameTitle: string
  onClose: () => void
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function EventArchiveModal({ gameId, gameTitle, onClose }: Props) {
  const [rows, setRows] = useState<EventArchiveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listEventArchivesForGame(gameId)
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить архив')
    } finally {
      setLoading(false)
    }
  }, [gameId])

  useEffect(() => {
    void load()
  }, [load])

  const handleDownload = async (row: EventArchiveRow) => {
    setDownloadingId(row.id)
    try {
      await downloadArchivedCsv(row)
    } catch (err) {
      console.error(err)
      alert('Не удалось скачать CSV')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-archive-title"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 p-5 border-b">
          <div>
            <h2 id="event-archive-title" className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <History className="w-5 h-5 text-purple-600" />
              История заездов
            </h2>
            <p className="text-sm text-gray-600 mt-1 truncate">{gameTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <p className="text-sm text-gray-500 text-center py-8">Загрузка…</p>
          )}
          {error && (
            <div className="rounded-lg bg-red-50 text-red-800 text-sm p-4 flex justify-between gap-3">
              <span>{error}</span>
              <button type="button" onClick={() => void load()} className="underline shrink-0">
                Повторить
              </button>
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <p className="text-sm text-gray-600 text-center py-8">
              Пока нет завершённых заездов. Архив создаётся при нажатии «Завершить игру».
            </p>
          )}
          {!loading && rows.length > 0 && (
            <ul className="space-y-3">
              {rows.map((row) => {
                const duration = formatArchiveDuration(row.started_at, row.finished_at)
                const leader = row.teams_summary[0]
                return (
                  <li
                    key={row.id}
                    className="border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{formatWhen(row.finished_at)}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {row.team_count} команд · {row.answer_count} ответов
                        {duration ? ` · ${duration}` : ''}
                      </p>
                      {leader && (
                        <p className="text-sm text-purple-700 mt-1 truncate">
                          1 место: {leader.team_name} ({leader.total_score} очков)
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDownload(row)}
                      disabled={downloadingId === row.id}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 shrink-0"
                    >
                      <Download className="w-4 h-4" />
                      {downloadingId === row.id ? 'Скачивание…' : 'CSV'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
