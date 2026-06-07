import { useCallback, useEffect, useState } from 'react'
import {
  CLIENT_LOG_FILE_HINT,
  cleanupInactiveDiagnosticSessions,
  clearClientLogs,
  downloadClientLogsJson,
  downloadServerDiagnosticLogs,
  fetchConnectedDevicesMeta,
  fetchDeviceLogNdjson,
  getClientLogEntries,
  getClientSessionId,
  mergeImportedClientLogs,
  removeDiagnosticSession,
  type ClientLogExportBundle,
  type ConnectedDeviceInfo,
} from '../lib/clientLogCollector'
import { Download, Trash2, Upload, Server, FileText, RefreshCw, Smartphone } from 'lucide-react'

function deviceLabel(d: ConnectedDeviceInfo): string {
  const ua = d.ua.toLowerCase()
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iPhone/iPad'
  if (ua.includes('android')) return 'Android'
  if (ua.includes('mobile')) return 'Mobile'
  return 'Desktop'
}

function formatIdle(idleMs: number | undefined): string {
  if (idleMs == null) return '—'
  if (idleMs < 60_000) return `${Math.round(idleMs / 1000)} с назад`
  const min = Math.round(idleMs / 60_000)
  return `${min} мин назад`
}

export default function DiagnosticLogsPanel() {
  const [count, setCount] = useState(0)
  const [serverStatus, setServerStatus] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [devices, setDevices] = useState<ConnectedDeviceInfo[]>([])
  const [activeCount, setActiveCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [showActiveOnly, setShowActiveOnly] = useState(false)
  const [devicesStatus, setDevicesStatus] = useState<string | null>(null)
  const currentSessionId = getClientSessionId()

  const refreshCount = useCallback(() => {
    setCount(getClientLogEntries().length)
  }, [])

  const refreshDevices = useCallback(async () => {
    const meta = await fetchConnectedDevicesMeta()
    if (!meta) {
      setDevices([])
      setActiveCount(0)
      setTotalCount(0)
      setDevicesStatus('DEV-сервер недоступен (npm run dev -- --host)')
      return
    }
    let list = meta.devices
    if (showActiveOnly) {
      list = list.filter((d) => d.active)
    }
    setDevices(list)
    setActiveCount(meta.activeCount)
    setTotalCount(meta.total)
    setDevicesStatus(
      meta.total > 0
        ? `Активных сессий: ${meta.activeCount} из ${meta.total} · файлы в diagnostic/devices/`
        : 'Пока нет логов с других устройств (откройте игру по Wi‑Fi на телефоне)'
    )
  }, [showActiveOnly])

  useEffect(() => {
    refreshCount()
    void refreshDevices()
    const id = setInterval(() => {
      refreshCount()
      void refreshDevices()
    }, 5000)
    return () => clearInterval(id)
  }, [refreshCount, refreshDevices])

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

  const handleDownloadDevice = async (sessionId: string) => {
    const text = await fetchDeviceLogNdjson(sessionId)
    if (!text) {
      setDevicesStatus('Не удалось скачать лог устройства')
      return
    }
    const blob = new Blob([text], { type: 'application/x-ndjson' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `quest-device-${sessionId.slice(0, 12)}.jsonl`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleRemoveDevice = async (sessionId: string) => {
    if (
      !confirm(
        'Удалить сессию из списка и файл diagnostic/devices/*.jsonl? Общий client-logs.jsonl не трогаем.'
      )
    ) {
      return
    }
    const ok = await removeDiagnosticSession(sessionId)
    setDevicesStatus(ok ? 'Сессия удалена' : 'Не удалось удалить')
    await refreshDevices()
  }

  const handleCleanupInactive = async () => {
    const n = await cleanupInactiveDiagnosticSessions()
    setDevicesStatus(
      n > 0 ? `Удалено неактивных сессий: ${n}` : 'Неактивных сессий нет (тишина > 2 мин)'
    )
    await refreshDevices()
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
            Записей в этой вкладке: <strong>{count}</strong>
          </p>
          <p className="text-xs text-gray-500 mt-2 font-mono break-all">
            Папка на ПК: {CLIENT_LOG_FILE_HINT}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-amber-100 bg-white/70 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4" />
            Сессии с логами
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showActiveOnly}
                onChange={(e) => setShowActiveOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              Только активные
            </label>
            <button
              type="button"
              onClick={() => void refreshDevices()}
              className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Обновить
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">
          Это не live-подключение по WebSocket. Каждая вкладка/перезагрузка создаёт новую сессию;
          запись остаётся в manifest, пока вы её не удалите.{' '}
          <strong>Активная</strong> — логи приходили менее 2 мин назад (вкладка открыта). Закрытый
          браузер в фоне не шлёт логи.
        </p>

        {devices.length === 0 ? (
          <p className="text-xs text-gray-500">{devicesStatus}</p>
        ) : (
          <ul className="space-y-2 max-h-56 overflow-y-auto">
            {devices.map((d) => (
              <li
                key={d.sessionId}
                className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-gray-100 pb-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-800 flex flex-wrap items-center gap-1.5">
                    {deviceLabel(d)} · {d.host}
                    {d.sessionId === currentSessionId && (
                      <span className="text-amber-700 font-normal">(эта вкладка)</span>
                    )}
                    <span
                      className={
                        d.active
                          ? 'inline-flex px-1.5 py-0.5 rounded bg-green-100 text-green-800 font-normal'
                          : 'inline-flex px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-normal'
                      }
                    >
                      {d.active ? 'активна' : 'неактивна'}
                    </span>
                  </div>
                  <div className="text-gray-500 truncate">
                    {d.route} · {d.lineCount} записей · последний лог:{' '}
                    {formatIdle(d.idleMs)}
                  </div>
                  <div className="text-gray-400 font-mono truncate">{d.file}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => void handleDownloadDevice(d.sessionId)}
                    className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
                  >
                    Скачать
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemoveDevice(d.sessionId)}
                    className="px-2 py-1 border border-red-200 text-red-700 rounded hover:bg-red-50"
                    title="Убрать из списка"
                  >
                    Удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleCleanupInactive()}
            className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
          >
            Удалить неактивные (&gt;2 мин)
          </button>
          {totalCount > 0 && (
            <span className="text-xs text-gray-500 self-center">
              Всего в manifest: {totalCount}, активных: {activeCount}
            </span>
          )}
        </div>
        {devicesStatus && <p className="text-xs text-gray-500">{devicesStatus}</p>}
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
          Скачать общий JSONL
        </button>
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">
          <Upload className="w-4 h-4" />
          Импорт JSON (резерв)
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
        Телефон шлёт логи на DEV-сервер по Wi‑Fi. При ошибке регистрации полный дамп — в
        diagnostic/exports/.
      </p>
    </div>
  )
}
