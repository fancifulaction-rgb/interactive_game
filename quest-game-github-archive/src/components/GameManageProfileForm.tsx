import { useEffect, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatErrorMessage } from '../lib/errorMessage'
import {
  GAME_ACCESS_CODE_MAX,
  gameAccessCodeRangeLabel,
  generateGameAccessCode,
  normalizeGameAccessCode,
} from '../lib/gameAccessCode'
import { fetchGameAccessCodeDefaultLength } from '../lib/gameAccessCodeSettings'
import {
  GAME_FINISH_PAGE_OPTIONS,
  GAME_PROFILE_SELECT,
  GAME_THEME_OPTIONS,
  gameProfileFromRow,
  saveGameProfile,
  type GameProfileDraft,
} from '../lib/saveGameProfile'

interface GameManageProfileFormProps {
  gameId: string
  onSaved?: () => void
}

const emptyDraft: GameProfileDraft = {
  title: '',
  code: '',
  theme: 'default',
  finish_page_type: 'scoreboard',
  mask_board: false,
  hide_scoreboard_until_finish: false,
}

export default function GameManageProfileForm({
  gameId,
  onSaved,
}: GameManageProfileFormProps) {
  const [draft, setDraft] = useState<GameProfileDraft>(emptyDraft)
  const [existingSettings, setExistingSettings] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [autoCodeLength, setAutoCodeLength] = useState(6)
  const loadSeq = useRef(0)

  useEffect(() => {
    void fetchGameAccessCodeDefaultLength().then(setAutoCodeLength)
  }, [])

  useEffect(() => {
    if (!gameId) {
      setDraft(emptyDraft)
      setExistingSettings(null)
      setLoadError('')
      return
    }

    const seq = ++loadSeq.current
    setLoading(true)
    setLoadError('')
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('games')
          .select(GAME_PROFILE_SELECT)
          .eq('id', gameId)
          .maybeSingle()

        if (error) throw error
        if (seq !== loadSeq.current) return
        if (!data) {
          setLoadError('Игра не найдена')
          setDraft(emptyDraft)
          return
        }
        setExistingSettings(data.settings)
        setDraft(gameProfileFromRow(data))
      } catch (err: unknown) {
        if (seq !== loadSeq.current) return
        setLoadError(formatErrorMessage(err))
      } finally {
        if (seq === loadSeq.current) {
          setLoading(false)
        }
      }
    })()
  }, [gameId])

  const showStatus = (message: string) => {
    setStatusMessage(message)
    window.setTimeout(() => setStatusMessage(null), 4000)
  }

  const handleSave = async () => {
    if (!gameId) return
    setSaving(true)
    try {
      await saveGameProfile(gameId, draft, existingSettings)
      setExistingSettings(
        (prev) =>
          ({
            ...(typeof prev === 'object' && prev !== null && !Array.isArray(prev)
              ? prev
              : {}),
            hide_scoreboard_until_finish: draft.hide_scoreboard_until_finish,
          }) as Record<string, unknown>
      )
      showStatus('Настройки игры сохранены')
      onSaved?.()
    } catch (err: unknown) {
      alert('Ошибка сохранения: ' + formatErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!gameId) {
    return (
      <p className="text-sm text-gray-500">Выберите игру, чтобы редактировать её параметры.</p>
    )
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
        Загрузка параметров игры…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {loadError}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-800">Параметры игры</h3>
        <div className="flex items-center gap-3">
          {statusMessage && (
            <span className="text-sm text-green-700">{statusMessage}</span>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            <Save className="w-5 h-5" />
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Название игры</label>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Код доступа ({gameAccessCodeRangeLabel()} символов: буквы и цифры)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={draft.code}
              onChange={(e) =>
                setDraft({ ...draft, code: normalizeGameAccessCode(e.target.value) })
              }
              maxLength={GAME_ACCESS_CODE_MAX}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-center text-2xl font-bold focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="ABC123"
            />
            <button
              type="button"
              onClick={() =>
                setDraft({ ...draft, code: generateGameAccessCode(autoCodeLength) })
              }
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap"
            >
              Сгенерировать
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Коды от {gameAccessCodeRangeLabel()} символов; при сохранении проверяется уникальность
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Тема оформления</label>
          <select
            value={draft.theme}
            onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            {GAME_THEME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Финальная страница</label>
          <select
            value={draft.finish_page_type}
            onChange={(e) => setDraft({ ...draft, finish_page_type: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            {GAME_FINISH_PAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-sm text-gray-600 mt-1">
            Выберите что увидят игроки после завершения квеста
          </p>
        </div>
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.mask_board}
              onChange={(e) => setDraft({ ...draft, mask_board: e.target.checked })}
              className="w-5 h-5"
            />
            <span className="text-sm font-medium">Маскировать табло (скрыть имена на экране)</span>
          </label>
        </div>
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.hide_scoreboard_until_finish}
              onChange={(e) =>
                setDraft({ ...draft, hide_scoreboard_until_finish: e.target.checked })
              }
              className="w-5 h-5"
            />
            <span className="text-sm font-medium">Скрыть табло до финиша</span>
          </label>
          <p className="text-sm text-gray-600 mt-1 ml-7">
            Игроки не смогут открыть табло результатов, пока ведущий не завершит игру
          </p>
        </div>
      </div>
    </div>
  )
}
