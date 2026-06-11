import type { QuestionMediaItem } from './questionMediaTypes'

export type MediaLayoutPreset = 'carousel' | 'full' | 'sideBySide' | 'grid2' | 'stack'

export type MediaLayoutBox = { x: number; y: number; w: number; h: number; zIndex?: number }

export function hasCustomLayout(items: QuestionMediaItem[]): boolean {
  return items.some((i) => i.layout != null)
}

function box(x: number, y: number, w: number, h: number, zIndex?: number): MediaLayoutBox {
  return { x, y, w, h, zIndex }
}

/** Раскладка по пресету (проценты 0–100 от контейнера). */
export function layoutBoxesForPreset(count: number, preset: MediaLayoutPreset): MediaLayoutBox[] {
  if (preset === 'full' || count <= 1) return [box(0, 0, 100, 100)]
  if (preset === 'sideBySide' && count >= 2) {
    return Array.from({ length: count }, (_, i) =>
      box(i % 2 === 0 ? 0 : 50, 0, 50, 100, i)
    )
  }
  if (preset === 'stack' && count >= 2) {
    const h = Math.floor(100 / count)
    return Array.from({ length: count }, (_, i) => box(0, i * h, 100, h, i))
  }
  if (preset === 'grid2') {
    const cols = 2
    const rows = Math.ceil(count / cols)
    const cellH = Math.floor(100 / rows)
    const cellW = 50
    return Array.from({ length: count }, (_, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      return box(col * cellW, row * cellH, cellW, cellH, i)
    })
  }
  return [box(0, 0, 100, 100)]
}

export function applyLayoutPreset(
  items: QuestionMediaItem[],
  preset: MediaLayoutPreset
): QuestionMediaItem[] {
  if (preset === 'carousel') {
    return items.map(({ layout: _l, ...rest }) => rest)
  }
  const sorted = [...items].sort((a, b) => a.order - b.order)
  const boxes = layoutBoxesForPreset(sorted.length, preset)
  return sorted.map((item, i) => ({
    ...item,
    layout: boxes[i] ?? box(0, 0, 100, 100, i),
  }))
}

export function assignDefaultLayouts(items: QuestionMediaItem[]): QuestionMediaItem[] {
  if (hasCustomLayout(items)) return items
  if (items.length <= 1) return items
  return applyLayoutPreset(items, items.length === 2 ? 'sideBySide' : 'grid2')
}
