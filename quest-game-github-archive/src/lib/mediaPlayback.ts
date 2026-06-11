import type { QuestionMediaItem } from './questionMediaTypes'

export type MediaCuePayload = {
  media_id: string
  question_id?: string
}

/** Элементы без playback — всегда видимы (обратная совместимость). */
export function itemsWithPlaybackRules(items: QuestionMediaItem[]): QuestionMediaItem[] {
  return items.filter((i) => i.playback?.trigger != null)
}

export function hasPlaybackRules(items: QuestionMediaItem[]): boolean {
  return items.some((i) => i.playback?.trigger != null)
}

/** Начальная видимость при смене вопроса / сбросе. */
export function initialVisibleMediaIds(items: QuestionMediaItem[]): Set<string> {
  const visible = new Set<string>()
  if (!hasPlaybackRules(items)) {
    for (const item of items) visible.add(item.id)
    return visible
  }
  for (const item of items) {
    const trigger = item.playback?.trigger ?? 'onLoad'
    if (trigger === 'onLoad' || trigger === 'withBlock') {
      visible.add(item.id)
    }
  }
  return visible
}

export function shouldRevealOnCue(item: QuestionMediaItem): boolean {
  return item.playback?.trigger === 'manual'
}

export function manualMediaItems(items: QuestionMediaItem[]): QuestionMediaItem[] {
  return items.filter(shouldRevealOnCue)
}

export function applyMediaCueToVisible(
  visible: Set<string>,
  mediaId: string,
  items: QuestionMediaItem[]
): Set<string> {
  if (!items.some((i) => i.id === mediaId)) return visible
  const next = new Set(visible)
  next.add(mediaId)
  const target = items.find((i) => i.id === mediaId)
  if (target?.playback?.trigger === 'withBlock' && target.playback.parallelGroup) {
    for (const item of items) {
      if (item.playback?.parallelGroup === target.playback.parallelGroup) {
        next.add(item.id)
      }
    }
  }
  return next
}

export function delayMsForItem(item: QuestionMediaItem): number | null {
  if (item.playback?.trigger !== 'afterMs') return null
  const ms = item.playback.delayMs
  return typeof ms === 'number' && ms > 0 ? ms : null
}
