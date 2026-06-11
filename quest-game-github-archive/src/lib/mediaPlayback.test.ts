import { describe, expect, it } from 'vitest'
import {
  applyMediaCueToVisible,
  initialVisibleMediaIds,
  manualMediaItems,
} from './mediaPlayback'
import type { QuestionMediaItem } from './questionMediaTypes'

const item = (
  id: string,
  trigger?: 'onLoad' | 'manual' | 'afterMs' | 'withBlock',
  extra?: { delayMs?: number; parallelGroup?: string }
): QuestionMediaItem => ({
  id,
  kind: 'image',
  url: `https://example.com/${id}.jpg`,
  order: 0,
  playback: trigger ? { trigger, ...extra } : undefined,
})

describe('mediaPlayback', () => {
  it('shows all items when no playback rules', () => {
    const ids = initialVisibleMediaIds([item('a'), item('b')])
    expect(ids.has('a')).toBe(true)
    expect(ids.has('b')).toBe(true)
  })

  it('hides manual until cue', () => {
    const items = [item('a', 'onLoad'), item('b', 'manual')]
    const initial = initialVisibleMediaIds(items)
    expect(initial.has('a')).toBe(true)
    expect(initial.has('b')).toBe(false)
    const after = applyMediaCueToVisible(initial, 'b', items)
    expect(after.has('b')).toBe(true)
  })

  it('lists manual items only', () => {
    const items = [item('a', 'onLoad'), item('b', 'manual')]
    expect(manualMediaItems(items).map((i) => i.id)).toEqual(['b'])
  })
})
