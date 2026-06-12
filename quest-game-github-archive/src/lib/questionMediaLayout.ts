import type { QuestionMediaItem } from './questionMediaTypes'

export type MediaLayoutPreset = 'carousel' | 'full' | 'sideBySide' | 'grid2' | 'stack'

export type MediaLayoutBox = { x: number; y: number; w: number; h: number; zIndex?: number }

export function hasCustomLayout(items: QuestionMediaItem[]): boolean {
  return items.some((i) => i.layout != null)
}

export function canUseSideBySideLayout(count: number): boolean {
  return count === 2
}

function box(x: number, y: number, w: number, h: number, zIndex?: number): MediaLayoutBox {
  return { x, y, w, h, zIndex }
}

function layoutMatches(a: MediaLayoutBox, b: MediaLayoutBox): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && (a.zIndex ?? 0) === (b.zIndex ?? 0)
}

/** Раскладка по пресету (проценты 0–100 от контейнера). */
export function layoutBoxesForPreset(count: number, preset: MediaLayoutPreset): MediaLayoutBox[] {
  if (preset === 'full' || count <= 1) return [box(0, 0, 100, 100)]
  if (preset === 'sideBySide') {
    if (count !== 2) return []
    return [box(0, 0, 50, 100, 0), box(50, 0, 50, 100, 1)]
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
  if (!boxes.length) return sorted
  return sorted.map((item, i) => ({
    ...item,
    layout: boxes[i] ?? box(0, 0, 100, 100, i),
  }))
}

/** Определяет активный пресет по сохранённым layout (для подсветки в редакторе). */
export function inferLayoutPreset(items: QuestionMediaItem[]): MediaLayoutPreset | null {
  const sorted = [...items].sort((a, b) => a.order - b.order)
  if (!sorted.length) return null
  if (!hasCustomLayout(sorted)) return 'carousel'

  const candidates: MediaLayoutPreset[] =
    sorted.length === 1
      ? ['full', 'carousel']
      : ['sideBySide', 'grid2', 'stack', 'full']

  for (const preset of candidates) {
    if (preset === 'sideBySide' && !canUseSideBySideLayout(sorted.length)) continue
    const boxes = layoutBoxesForPreset(sorted.length, preset)
    if (!boxes.length) continue
    const matches = sorted.every((item, i) => {
      const layout = item.layout
      if (!layout) return false
      return layoutMatches(layout, boxes[i])
    })
    if (matches) return preset
  }
  return null
}

export function assignDefaultLayouts(items: QuestionMediaItem[]): QuestionMediaItem[] {
  if (hasCustomLayout(items)) return items
  if (items.length <= 1) return items
  return applyLayoutPreset(items, items.length === 2 ? 'sideBySide' : 'grid2')
}
