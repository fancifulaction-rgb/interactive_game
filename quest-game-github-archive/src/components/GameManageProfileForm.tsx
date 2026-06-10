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
  ANSWER_GRADING_BASELINE,
  ANSWER_GRADING_PRESETS,
  answerGradingStorageValue,
  presetAnswerGrading,
  type AnswerGradingPresetId,
  type TextMatchMode,
} from '../lib/answerGradingConfig'
import { mergeGameSettings } from '../lib/gameSettings'
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
  auto_finish_when_all_teams_done: false,
  answer_grading_preset: 'strict',
  answer_grading: ANSWER_GRADING_BASELINE,
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
        mergeGameSettings(existingSettings, {
          hide_scoreboard_until_finish: draft.hide_scoreboard_until_finish,
          auto_finish_when_all_teams_done: draft.auto_finish_when_all_teams_done,
          answer_grading: answerGradingStorageValue(draft.answer_grading),
        })
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
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.auto_finish_when_all_teams_done}
              onChange={(e) =>
                setDraft({ ...draft, auto_finish_when_all_teams_done: e.target.checked })
              }
              className="w-5 h-5"
            />
            <span className="text-sm font-medium">Завершить игру, когда все команды прошли квест</span>
          </label>
          <p className="text-sm text-gray-600 mt-1 ml-7">
            Сессия перейдёт в «Завершена» автоматически, когда последняя команда дойдёт до финиша
          </p>
        </div>
        <div className="md:col-span-2 border-t border-gray-100 pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Проверка ответов
          </label>
          <select
            value={
              draft.answer_grading_preset === 'custom'
                ? ''
                : draft.answer_grading_preset
            }
            onChange={(e) => {
              const preset = e.target.value as AnswerGradingPresetId
              const prevResubmit = draft.answer_grading.resubmit
              const next = presetAnswerGrading(preset)
              setDraft({
                ...draft,
                answer_grading_preset: preset,
                answer_grading: prevResubmit
                  ? { ...next, resubmit: prevResubmit }
                  : next,
              })
            }}
            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            {draft.answer_grading_preset === 'custom' && (
              <option value="" disabled>
                Нестандартные настройки (выберите пресет)
              </option>
            )}
            {(Object.keys(ANSWER_GRADING_PRESETS) as AnswerGradingPresetId[]).map(
              (id) => (
                <option key={id} value={id}>
                  {ANSWER_GRADING_PRESETS[id].label}
                </option>
              )
            )}
          </select>
          <p className="text-sm text-gray-600 mt-2 max-w-2xl">
            {draft.answer_grading_preset === 'custom'
              ? 'В базе сохранён нестандартный профиль. Выберите пресет, чтобы перезаписать.'
              : ANSWER_GRADING_PRESETS[draft.answer_grading_preset as AnswerGradingPresetId]
                  ?.description}
          </p>
          <div className="mt-3 max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Штраф за пересдачу (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={draft.answer_grading.resubmit?.penalty_percent ?? 0}
              onChange={(e) => {
                const pct = Math.max(
                  0,
                  Math.min(100, Number(e.target.value) || 0)
                )
                const { resubmit: _drop, ...rest } = draft.answer_grading
                setDraft({
                  ...draft,
                  answer_grading_preset: 'custom',
                  answer_grading:
                    pct > 0
                      ? { ...draft.answer_grading, resubmit: { penalty_percent: pct } }
                      : rest,
                })
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              0 — без штрафа. При повторном ответе на тот же вопрос очки уменьшаются.
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Режим текстовой проверки
              </label>
              <select
                value={draft.answer_grading.text_match}
                onChange={(e) => {
                  const text_match = e.target.value as TextMatchMode
                  setDraft({
                    ...draft,
                    answer_grading_preset: 'custom',
                    answer_grading: { ...draft.answer_grading, text_match },
                  })
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="strict">Точное совпадение</option>
                <option value="fuzzy">Опечатки (fuzzy)</option>
                <option value="keywords">Ключевые слова</option>
                <option value="numeric">Число с допуском</option>
                <option value="regex">Регулярное выражение</option>
              </select>
            </div>
            {draft.answer_grading.text_match === 'regex' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Regex-паттерн
                  </label>
                  <input
                    type="text"
                    value={draft.answer_grading.regex?.pattern ?? ''}
                    onChange={(e) => {
                      const pattern = e.target.value
                      setDraft({
                        ...draft,
                        answer_grading_preset: 'custom',
                        answer_grading: {
                          ...draft.answer_grading,
                          regex: {
                            pattern,
                            flags: draft.answer_grading.regex?.flags ?? '',
                          },
                        },
                      })
                    }}
                    placeholder="например ^москва$"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Флаги regex
                  </label>
                  <input
                    type="text"
                    value={draft.answer_grading.regex?.flags ?? ''}
                    onChange={(e) => {
                      const flags = e.target.value
                      setDraft({
                        ...draft,
                        answer_grading_preset: 'custom',
                        answer_grading: {
                          ...draft.answer_grading,
                          regex: {
                            pattern: draft.answer_grading.regex?.pattern ?? '',
                            flags,
                          },
                        },
                      })
                    }}
                    placeholder="i"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    i — без учёта регистра (как ~* в Postgres).
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="mt-4 max-w-md border border-gray-200 rounded-lg p-3 bg-gray-50/80">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.answer_grading.jury?.enabled ?? false}
                onChange={(e) => {
                  const enabled = e.target.checked
                  const { jury: _drop, ...rest } = draft.answer_grading
                  setDraft({
                    ...draft,
                    answer_grading_preset: 'custom',
                    answer_grading: enabled
                      ? {
                          ...draft.answer_grading,
                          jury: {
                            enabled: true,
                            required_votes:
                              draft.answer_grading.jury?.required_votes ?? 2,
                          },
                        }
                      : rest,
                  })
                }}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-gray-800">
                Жюри: несколько модераторов для принятия
              </span>
            </label>
            {draft.answer_grading.jury?.enabled && (
              <div className="mt-3 ml-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Голосов для принятия
                </label>
                <input
                  type="number"
                  min={2}
                  max={10}
                  value={draft.answer_grading.jury.required_votes}
                  onChange={(e) => {
                    const required_votes = Math.max(
                      2,
                      Math.min(10, Number(e.target.value) || 2)
                    )
                    setDraft({
                      ...draft,
                      answer_grading_preset: 'custom',
                      answer_grading: {
                        ...draft.answer_grading,
                        jury: { enabled: true, required_votes },
                      },
                    })
                  }}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Каждый модератор голосует «Принять»; до N голосов ответ в статусе jury_pending.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
