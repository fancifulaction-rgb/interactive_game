import { useCallback, useEffect, useState } from 'react'
import { Radio } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { broadcastMediaCue } from '../lib/gameRealtime'
import { manualMediaItems } from '../lib/mediaPlayback'
import { normalizeMediaItemsFromRow, normalizeHintsFromRow } from '../lib/questionMediaTypes'
import type { QuestionMediaItem } from '../lib/questionMediaTypes'

type CueTarget = {
  questionId: string
  questionNumber: number
  item: QuestionMediaItem
  source: 'question' | 'hint'
  hintIndex?: number
}

type Props = {
  gameId: string
  enabled: boolean
}

export default function HostLiveCuePanel({ gameId, enabled }: Props) {
  const [targets, setTargets] = useState<CueTarget[]>([])
  const [loading, setLoading] = useState(false)
  const [lastCue, setLastCue] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!gameId || !enabled) {
      setTargets([])
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('questions')
        .select('id, question_number, order_index, media_items, hints')
        .eq('game_id', gameId)
        .order('order_index', { ascending: true })
      if (error) throw error

      const cues: CueTarget[] = []
      for (const row of data ?? []) {
        const qNum = (row.question_number as number) ?? (row.order_index as number) ?? 0
        const qId = row.id as string
        const media = normalizeMediaItemsFromRow(row as Record<string, unknown>)
        for (const item of manualMediaItems(media)) {
          cues.push({ questionId: qId, questionNumber: qNum, item, source: 'question' })
        }
        const hints = normalizeHintsFromRow(row as Record<string, unknown>)
        hints.forEach((hint, hIndex) => {
          for (const item of manualMediaItems(hint.media_items ?? [])) {
            cues.push({
              questionId: qId,
              questionNumber: qNum,
              item,
              source: 'hint',
              hintIndex: hIndex,
            })
          }
        })
      }
      setTargets(cues)
    } catch (err) {
      console.warn('HostLiveCuePanel load:', err)
      setTargets([])
    } finally {
      setLoading(false)
    }
  }, [gameId, enabled])

  useEffect(() => {
    void load()
  }, [load])

  if (!enabled) return null

  return (
    <section className="mx-6 mb-6 max-w-7xl lg:mx-auto rounded-2xl border border-amber-400/30 bg-amber-950/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Radio className="w-5 h-5 text-amber-300" />
        <h2 className="text-lg font-bold text-amber-100">Пульт медиа (live-cue)</h2>
      </div>
      {loading ? (
        <p className="text-sm text-amber-200/70">Загрузка…</p>
      ) : targets.length === 0 ? (
        <p className="text-sm text-amber-200/70">
          Нет медиа с триггером «Пульт ведущего». Настройте в редакторе вопросов.
        </p>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
          {targets.map((t) => {
            const key = `${t.questionId}-${t.item.id}`
            const label =
              t.source === 'hint'
                ? `В${t.questionNumber} · подсказка ${(t.hintIndex ?? 0) + 1}`
                : `В${t.questionNumber} · ${t.item.kind}`
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => {
                    void broadcastMediaCue(gameId, {
                      media_id: t.item.id,
                      question_id: t.questionId,
                    })
                    setLastCue(key)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                    lastCue === key
                      ? 'bg-amber-500/30 border-amber-400'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <span className="font-medium">{label}</span>
                  {t.item.label && (
                    <span className="block text-xs text-slate-400 truncate">{t.item.label}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
