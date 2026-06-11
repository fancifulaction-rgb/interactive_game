import { useCallback, useEffect, useRef, useState } from 'react'
import type { QuestionMediaItem } from '../lib/questionMediaTypes'
import {
  applyMediaCueToVisible,
  delayMsForItem,
  initialVisibleMediaIds,
  hasPlaybackRules,
} from '../lib/mediaPlayback'

export function useMediaPlayback(
  items: QuestionMediaItem[],
  resetKey: string
): {
  visibleIds: Set<string>
  revealCue: (mediaId: string) => void
  filterVisible: (list: QuestionMediaItem[]) => QuestionMediaItem[]
} {
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => initialVisibleMediaIds(items))
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t)
    timersRef.current = []
  }, [])

  useEffect(() => {
    clearTimers()
    const next = initialVisibleMediaIds(items)
    setVisibleIds(next)

    if (!hasPlaybackRules(items)) return () => clearTimers()

    for (const item of items) {
      const delay = delayMsForItem(item)
      if (delay != null) {
        const timer = setTimeout(() => {
          setVisibleIds((prev) => {
            const updated = new Set(prev)
            updated.add(item.id)
            return updated
          })
        }, delay)
        timersRef.current.push(timer)
      }
    }
    return () => clearTimers()
  }, [items, resetKey, clearTimers])

  const revealCue = useCallback(
    (mediaId: string) => {
      setVisibleIds((prev) => applyMediaCueToVisible(prev, mediaId, items))
    },
    [items]
  )

  const filterVisible = useCallback(
    (list: QuestionMediaItem[]) => {
      if (!hasPlaybackRules(list)) return list
      return list.filter((i) => visibleIds.has(i.id))
    },
    [visibleIds]
  )

  return { visibleIds, revealCue, filterVisible }
}
