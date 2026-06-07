import { useCallback, useEffect, useState } from 'react'
import {
  CLIENT_LOG_FILE_HINT,
  clearClientLogs,
  downloadClientLogsJson,
  downloadServerDiagnosticLogs,
  getClientLogEntries,
  mergeImportedClientLogs,
  type ClientLogExportBundle,
} from '../lib/clientLogCollector'
import { Download, Trash2, Upload, Server, FileText } from 'lucide-react'

export default function DiagnosticLogsPanel() {
  const [count, setCount] = useState(0)
  const [serverStatus, setServerStatus] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  const refreshCount = useCallback(() => {
    setCount(getClientLogEntries().length)
  }, [])

  useEffect(() => {
    refreshCount()
    const id = setInterval(refreshCount, 3000)
    return () => clearInterval(id)
  }, [refreshCount])

  const handleImport = async (file: File) => {
    setImportStatus(null)
    try {
      const text = await file.text()
      const bundle = JSON.parse(text) as ClientLogExportBundle
      if (!bundle.entries || !Array.isArray(bundle.entries)) {
        setImportStatus('Неверный формат файла')
        return
      }
      const n = mergeImportedClientLogs(bundle)
      refreshCount()
      setImportStatus(`Импортировано записей: ${n}`)
    } catch {
      setImportStatus('Не удалось прочитать JSON')
    }
  }

  const handleServerDownload = async () => {
    setServerStatus('Загрузка…')
    const ok = await downloadServerDiagnosticLogs()
    setServerStatus(ok ? 'Файл скачан' : 'Нет логов на DEV-сервере (запустите npm run dev)')
  }

  if (!import.meta.env.DEV) {
    return (
      <p className="text-sm text-gray-500">
        Диагностические логи доступны только в режиме разработки (DEV).
      </p>
    )
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <FileText className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
        <div>
          <h4 className="font-medium text-gray-900">Диагностические логи (DEV)</h4>
          <p className="text-sm text-gray-600 mt-1">
            Автосбор событий регистрации, очереди Supabase, realtime. Записей в этом браузере:{' '}
            <strong>{count}</strong>
          </p>
          <p className="text-xs text-gray-500 mt-2 font-mono break-all">
            Файл на ПК (после теста с iPhone): {CLIENT_LOG_FILE_HINT}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => downloadClientLogsJson()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          <Download className="w-4 h-4" />
          Скачать логи браузера
        </button>
        <button
          type="button"
          onClick={handleServerDownload}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          <Server className="w-4 h-4" />
          Скачать с DEV-сервера
        </button>
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">
          <Upload className="w-4 h-4" />
          Импорт JSON с телефона
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleImport(f)
              e.target.value = ''
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            if (confirm('Очистить локальные логи в этом браузере?')) {
              clearClientLogs()
              refreshCount()
            }
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-700 border border-red-200 rounded-md hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4" />
          Очистить локальные
        </button>
      </div>

      {serverStatus && <p className="text-xs text-gray-600">{serverStatus}</p>}
      {importStatus && <p className="text-xs text-gray-600">{importStatus}</p>}

      <p className="text-xs text-gray-500">
        После теста на iPhone: «Скачать с DEV-сервера» или откройте файл на диске. На телефоне при
        ошибке регистрации — кнопка «Скачать диагностику».
      </p>
    </div>
  )
}
