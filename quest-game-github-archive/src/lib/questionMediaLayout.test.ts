import { describe, expect, it } from 'vitest'
import {
  applyLayoutPreset,
  inferLayoutPreset,
  layoutBoxesForPreset,
  canUseSideBySideLayout,
} from './questionMediaLayout'
import type { QuestionMediaItem } from './questionMediaTypes'

function media(count: number, withLayout?: boolean): QuestionMediaItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    kind: 'image' as const,
    url: `https://example.com/${i}.jpg`,
    order: i,
    ...(withLayout ? { layout: { x: 0, y: 0, w: 50, h: 100, zIndex: i } } : {}),
  }))
}

describe('questionMediaLayout', () => {
  it('sideBySide supports exactly two columns', () => {
    const boxes = layoutBoxesForPreset(2, 'sideBySide')
    expect(boxes).toEqual([
      { x: 0, y: 0, w: 50, h: 100, zIndex: 0 },
      { x: 50, y: 0, w: 50, h: 100, zIndex: 1 },
    ])
  })

  it('sideBySide does not emit overlapping boxes for three items', () => {
    expect(layoutBoxesForPreset(3, 'sideBySide')).toEqual([])
  })

  it('applyLayoutPreset leaves items unchanged when sideBySide with 3+ files', () => {
    const items = media(3)
    const next = applyLayoutPreset(items, 'sideBySide')
    expect(next).toEqual(items)
  })

  it('infers carousel when no layout', () => {
    expect(inferLayoutPreset(media(2))).toBe('carousel')
  })

  it('infers sideBySide for two-up layout', () => {
    const items = applyLayoutPreset(media(2), 'sideBySide')
    expect(inferLayoutPreset(items)).toBe('sideBySide')
  })

  it('canUseSideBySideLayout only for two files', () => {
    expect(canUseSideBySideLayout(2)).toBe(true)
    expect(canUseSideBySideLayout(3)).toBe(false)
  })
})
