import type { QuestionMediaItem } from '../lib/questionMediaTypes'
import {
  applyLayoutPreset,
  type MediaLayoutPreset,
} from '../lib/questionMediaLayout'

type PlaybackTrigger = 'onLoad' | 'manual' | 'afterMs' | 'withBlock'

type Props = {
  items: QuestionMediaItem[]
  onChange: (items: QuestionMediaItem[]) => void
}

const PRESETS: { id: MediaLayoutPreset; label: string }[] = [
  { id: 'carousel', label: 'Карусель' },
  { id: 'full', label: 'На весь экран' },
  { id: 'sideBySide', label: 'Рядом' },
  { id: 'grid2', label: 'Сетка 2×' },
  { id: 'stack', label: 'Стопка' },
]

const TRIGGERS: { id: PlaybackTrigger; label: string }[] = [
  { id: 'onLoad', label: 'Сразу' },
  { id: 'afterMs', label: 'С задержкой' },
  { id: 'manual', label: 'Пульт ведущего' },
  { id: 'withBlock', label: 'Группа' },
]

export default function MediaLayoutComposer({ items, onChange }: Props) {
  if (!items.length) return null

  const patchItem = (index: number, patch: Partial<QuestionMediaItem>) => {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item))
    onChange(next)
  }

  const patchPlayback = (index: number, playback: QuestionMediaItem['playback']) => {
    patchItem(index, { playback: playback ?? undefined })
  }

  return (
    <div className="mt-3 p-3 border border-indigo-100 rounded-lg bg-indigo-50/50 space-y-3">
      <p className="text-sm font-medium text-indigo-900">Раскладка и таймлайн (IMP-PRD-010)</p>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(applyLayoutPreset(items, p.id))}
            className="px-3 py-1.5 text-xs rounded-lg border bg-white border-gray-300 hover:bg-indigo-50 hover:border-indigo-300"
          >
            {p.label}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs bg-white p-2 rounded border border-gray-200"
          >
            <span className="font-medium shrink-0">
              #{index + 1} {item.kind}
            </span>
            <select
              value={item.playback?.trigger ?? 'onLoad'}
              onChange={(e) => {
                const trigger = e.target.value as PlaybackTrigger
                patchPlayback(index, {
                  trigger,
                  delayMs: item.playback?.delayMs,
                  parallelGroup: item.playback?.parallelGroup,
                })
              }}
              className="flex-1 px-2 py-1 border rounded"
            >
              {TRIGGERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            {item.playback?.trigger === 'afterMs' && (
              <label className="flex items-center gap-1 shrink-0">
                <span>мс</span>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={item.playback.delayMs ?? 3000}
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
            {item.playback?.trigger === 'withBlock' && (
              <input
                type="text"
                placeholder="Группа"
                value={item.playback.parallelGroup ?? ''}
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
        ))}
      </ul>
    </div>
  )
}
