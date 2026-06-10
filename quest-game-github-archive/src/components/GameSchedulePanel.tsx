import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Save, Loader2 } from 'lucide-react'
import {
  DEFAULT_GAME_SCHEDULE,
  fetchGameSchedule,
  formatScheduleMoment,
  isScheduleActive,
  isoUtcToLocalDatetimeInput,
  localDatetimeToIsoUtc,
  saveGameSchedule,
  triggerProcessGameSchedule,
  type GameScheduleConfig,
  type GameScheduleMode,
} from '../lib/gameSchedule'
import { formatErrorMessage } from '../lib/errorMessage'
import ScheduleCountdown from './ScheduleCountdown'

type GameSchedulePanelProps = {
  gameId: string
  onScheduleChanged?: () => void
}

export default function GameSchedulePanel({
  gameId,
  onScheduleChanged,
}: GameSchedulePanelProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedSchedule, setSavedSchedule] = useState<GameScheduleConfig>(DEFAULT_GAME_SCHEDULE)
  const [mode, setMode] = useState<GameScheduleMode>('manual')
  const [lobbyLocal, setLobbyLocal] = useState('')
  const [startLocal, setStartLocal] = useState('')
  const [timezone, setTimezone] = useState(DEFAULT_GAME_SCHEDULE.timezone)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const applyToForm = useCallback((schedule: GameScheduleConfig) => {
    setSavedSchedule(schedule)
    setMode(schedule.mode)
    setLobbyLocal(isoUtcToLocalDatetimeInput(schedule.lobbyOpensAt))
    setStartLocal(isoUtcToLocalDatetimeInput(schedule.gameStartsAt))
    setTimezone(schedule.timezone || DEFAULT_GAME_SCHEDULE.timezone)
  }, [])

  const loadSchedule = useCallback(async () => {
    if (!gameId) return
    setLoading(true)
    setError(null)
    try {
      const schedule = await fetchGameSchedule(gameId)
      applyToForm(schedule)
    } catch (err: unknown) {
      setError(formatErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [gameId, applyToForm])

  useEffect(() => {
    void loadSchedule()
  }, [loadSchedule])

  useEffect(() => {
    if (!gameId || !isScheduleActive(savedSchedule)) return

    const tick = async () => {
      await triggerProcessGameSchedule(gameId)
      try {
        const fresh = await fetchGameSchedule(gameId)
        applyToForm(fresh)
        onScheduleChanged?.()
      } catch {
        /* ignore background refresh errors */
      }
    }

    void tick()
    const id = setInterval(() => {
      void tick()
    }, 60_000)
    return () => clearInterval(id)
  }, [gameId, savedSchedule.mode, savedSchedule.enabled, applyToForm, onScheduleChanged])

  const handleSave = async () => {
    if (!gameId) return
    setSaving(true)
    setMessage(null)
    setError(null)

    const next: GameScheduleConfig = {
      ...savedSchedule,
      mode,
      enabled: mode === 'scheduled',
      timezone: timezone.trim() || DEFAULT_GAME_SCHEDULE.timezone,
      lobbyOpensAt:
        mode === 'scheduled' ? localDatetimeToIsoUtc(lobbyLocal, timezone) : null,
      gameStartsAt:
        mode === 'scheduled' ? localDatetimeToIsoUtc(startLocal, timezone) : null,
      lastError: mode === 'scheduled' ? savedSchedule.lastError : null,
    }

    if (mode === 'scheduled') {
      if (!next.lobbyOpensAt && !next.gameStartsAt) {
        setError('Укажите время открытия лобби и/или старта игры.')
        setSaving(false)
        return
      }
      if (next.lobbyOpensAt && next.gameStartsAt) {
        const lobbyT = new Date(next.lobbyOpensAt).getTime()
        const startT = new Date(next.gameStartsAt).getTime()
        if (startT < lobbyT) {
          setError('Старт игры не может быть раньше открытия лобби.')
          setSaving(false)
          return
        }
      }
    }

    try {
      const saved = await saveGameSchedule(gameId, next)
      applyToForm(saved)
      setMessage('Расписание сохранено.')
      if (isScheduleActive(saved)) {
        await triggerProcessGameSchedule(gameId)
        const fresh = await fetchGameSchedule(gameId)
        applyToForm(fresh)
        onScheduleChanged?.()
      }
    } catch (err: unknown) {
      setError(formatErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const scheduledActive = isScheduleActive(savedSchedule)

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Загрузка формата игры…
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            Выберите, как открывается лобби и начинается игра: вручную кнопками ниже или
            автоматически по расписанию.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label
              className={`flex items-start gap-3 rounded-lg border px-3 py-3 cursor-pointer ${
                mode === 'manual' ? 'border-purple-400 bg-purple-50' : 'border-gray-200'
              }`}
            >
              <input
                type="radio"
                name="schedule-mode"
                checked={mode === 'manual'}
                onChange={() => setMode('manual')}
                className="mt-1"
              />
              <span>
                <span className="block font-medium text-gray-900">Вручную</span>
                <span className="block text-xs text-gray-600 mt-0.5">
                  Ведущий сам открывает лобби и запускает игру.
                </span>
              </span>
            </label>
            <label
              className={`flex items-start gap-3 rounded-lg border px-3 py-3 cursor-pointer ${
                mode === 'scheduled' ? 'border-purple-400 bg-purple-50' : 'border-gray-200'
              }`}
            >
              <input
                type="radio"
                name="schedule-mode"
                checked={mode === 'scheduled'}
                onChange={() => setMode('scheduled')}
                className="mt-1"
              />
              <span>
                <span className="block font-medium text-gray-900">По расписанию</span>
                <span className="block text-xs text-gray-600 mt-0.5">
                  Лобби и старт переключаются автоматически в заданное время.
                </span>
              </span>
            </label>
          </div>

          {mode === 'scheduled' && (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Открыть регистрацию (лобби)
                </label>
                <input
                  type="datetime-local"
                  value={lobbyLocal}
                  onChange={(e) => setLobbyLocal(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Начать игру
                </label>
                <input
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Часовой пояс (IANA)
                </label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Europe/Moscow"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Сохранить формат
          </button>

          {message && <p className="text-sm text-green-700">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {scheduledActive && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950 space-y-1">
              <p className="font-medium flex items-center gap-2">
                <CalendarClock className="w-4 h-4" />
                Автоматический режим активен
              </p>
              {savedSchedule.lobbyOpensAt && (
                <p>
                  Лобби: {formatScheduleMoment(savedSchedule.lobbyOpensAt, savedSchedule.timezone)}
                  {savedSchedule.lobbyOpenedAt ? ' — уже открыто' : ''}
                </p>
              )}
              {savedSchedule.gameStartsAt && (
                <p>
                  Старт: {formatScheduleMoment(savedSchedule.gameStartsAt, savedSchedule.timezone)}
                  {savedSchedule.gameStartedAt ? ' — игра уже началась' : ''}
                </p>
              )}
              {!savedSchedule.lobbyOpenedAt && savedSchedule.lobbyOpensAt && (
                <ScheduleCountdown
                  targetIso={savedSchedule.lobbyOpensAt}
                  label="До открытия лобби"
                  className="text-indigo-900"
                />
              )}
              {savedSchedule.lobbyOpenedAt &&
                !savedSchedule.gameStartedAt &&
                savedSchedule.gameStartsAt && (
                  <ScheduleCountdown
                    targetIso={savedSchedule.gameStartsAt}
                    label="До старта игры"
                    className="text-indigo-900"
                  />
                )}
              {savedSchedule.lastError && (
                <p className="text-amber-800 mt-2">
                  Последняя ошибка автоматики: {savedSchedule.lastError}
                </p>
              )}
              <p className="text-xs text-indigo-800/80 mt-2">
                Кнопки ручного управления ниже по-прежнему доступны.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
