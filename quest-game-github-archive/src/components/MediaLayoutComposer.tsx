import type { QuestionMediaItem } from '../lib/questionMediaTypes'
import {
  applyLayoutPreset,
  canUseSideBySideLayout,
  inferLayoutPreset,
  type MediaLayoutPreset,
} from '../lib/questionMediaLayout'

type PlaybackTrigger = 'onLoad' | 'manual' | 'afterMs' | 'withBlock'

type Props = {
  items: QuestionMediaItem[]
  onChange: (items: QuestionMediaItem[]) => void
}

const PRESETS: { id: MediaLayoutPreset; label: string; hint: string }[] = [
  {
    id: 'carousel',
    label: 'Карусель',
    hint: 'Одно фото на экране; игрок листает свайпом. Автосмены по секундам пока нет.',
  },
  {
    id: 'full',
    label: 'На весь экран',
    hint: 'Одно или несколько фото в одной области (для одного файла — на весь блок).',
  },
  {
    id: 'sideBySide',
    label: 'Рядом',
    hint: 'Ровно два файла: слева и справа 50/50. Для трёх и более — «Сетка 2×».',
  },
  {
    id: 'grid2',
    label: 'Сетка 2×',
    hint: 'Сетка в две колонки; подходит для трёх и более фото.',
  },
  {
    id: 'stack',
    label: 'Стопка',
    hint: 'Файлы друг под другом по вертикали.',
  },
]

const TRIGGERS: { id: PlaybackTrigger; label: string; hint: string }[] = [
  {
    id: 'onLoad',
    label: 'Сразу',
    hint: 'Показать при открытии вопроса у игрока.',
  },
  {
    id: 'afterMs',
    label: 'С задержкой',
    hint: 'Скрыто до указанных миллисекунд от начала вопроса (для каждого файла отдельно).',
  },
  {
    id: 'manual',
    label: 'Пульт ведущего',
    hint: 'Скрыто, пока ведущий не нажмёт кнопку на экране /host/КОД → «Пульт медиа».',
  },
  {
    id: 'withBlock',
    label: 'Группа',
    hint: 'Показать вместе с файлами той же группы (одинаковое имя группы).',
  },
]

function presetButtonClass(active: boolean, disabled: boolean): string {
  const base =
    'px-3 py-1.5 text-xs rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400'
  if (disabled) {
    return `${base} bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed`
  }
  if (active) {
    return `${base} bg-indigo-600 border-indigo-700 text-white shadow-sm ring-2 ring-indigo-300 ring-offset-1`
  }
  return `${base} bg-white border-gray-300 text-gray-800 hover:bg-indigo-50 hover:border-indigo-300`
}

export default function MediaLayoutComposer({ items, onChange }: Props) {
  if (!items.length) return null

  const activePreset = inferLayoutPreset(items)
  const sideBySideDisabled = !canUseSideBySideLayout(items.length)

  const patchItem = (index: number, patch: Partial<QuestionMediaItem>) => {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item))
    onChange(next)
  }

  const patchPlayback = (index: number, playback: QuestionMediaItem['playback']) => {
    patchItem(index, { playback: playback ?? undefined })
  }

  const applyPreset = (preset: MediaLayoutPreset) => {
    if (preset === 'sideBySide' && sideBySideDisabled) return
    onChange(applyLayoutPreset(items, preset))
  }

  return (
    <div className="mt-3 p-3 border border-indigo-100 rounded-lg bg-indigo-50/50 space-y-3">
      <p className="text-sm font-medium text-indigo-900">Раскладка и таймлайн</p>
      <p className="text-xs text-indigo-800/80">
        Раскладка видна игрокам в игре. Таймлайн настраивается для каждого файла отдельно.
      </p>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const disabled = p.id === 'sideBySide' && sideBySideDisabled
          const active = activePreset === p.id
          return (
            <button
              key={p.id}
              type="button"
              title={p.hint}
              disabled={disabled}
              aria-pressed={active}
              onClick={() => applyPreset(p.id)}
              className={presetButtonClass(active, disabled)}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      {activePreset && (
        <p className="text-xs text-indigo-900/90">
          {PRESETS.find((p) => p.id === activePreset)?.hint}
        </p>
      )}
      {sideBySideDisabled && items.length > 2 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          «Рядом» доступно только для двух файлов. Для {items.length} фото используйте «Сетка 2×».
        </p>
      )}
      <div className="text-xs text-gray-600 space-y-0.5">
        <p className="font-medium text-gray-700">Когда показывать файл:</p>
        <p>
          Наведите на пункт в списке ниже или задержите курсор на кнопке раскладки — краткая
          подсказка.
        </p>
      </div>
      <ul className="space-y-2">
        {items.map((item, index) => {
          const trigger = item.playback?.trigger ?? 'onLoad'
          const triggerMeta = TRIGGERS.find((t) => t.id === trigger)
          return (
            <li
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs bg-white p-2 rounded border border-gray-200"
            >
              <span className="font-medium shrink-0">
                #{index + 1} {item.kind}
              </span>
              <select
                value={trigger}
                title={triggerMeta?.hint}
                onChange={(e) => {
                  const nextTrigger = e.target.value as PlaybackTrigger
                  patchPlayback(index, {
                    trigger: nextTrigger,
                    delayMs: item.playback?.delayMs,
                    parallelGroup: item.playback?.parallelGroup,
                  })
                }}
                className="flex-1 px-2 py-1 border rounded"
              >
                {TRIGGERS.map((t) => (
                  <option key={t.id} value={t.id} title={t.hint}>
                    {t.label}
                  </option>
                ))}
              </select>
              {trigger === 'afterMs' && (
                <label
                  className="flex items-center gap-1 shrink-0"
                  title="Задержка в миллисекундах от момента показа вопроса"
                >
                  <span>мс</span>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={item.playback?.delayMs ?? 3000}
                    onChange={(e) =>
                      patchPlayback(index, {
                        trigger: 'afterMs',
                        delayMs: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-20 px-2 py-1 border rounded"
                  />
                </label>
              )}
              {trigger === 'withBlock' && (
                <input
                  type="text"
                  placeholder="Группа"
                  title="Одинаковое имя — файлы появятся вместе"
                  value={item.playback?.parallelGroup ?? ''}
                  onChange={(e) =>
                    patchPlayback(index, {
                      trigger: 'withBlock',
                      parallelGroup: e.target.value || undefined,
                    })
                  }
                  className="w-24 px-2 py-1 border rounded"
                />
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
