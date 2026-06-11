import { useMemo } from 'react'
import type { QuestionMediaItem } from '../lib/questionMediaTypes'
import { hasCustomLayout } from '../lib/questionMediaLayout'
import { hasPlaybackRules } from '../lib/mediaPlayback'
import QuestionMediaGallery from './QuestionMediaGallery'

type Props = {
  items: QuestionMediaItem[]
  className?: string
  compact?: boolean
  visibleIds?: Set<string>
}

function MediaTile({
  item,
  compact,
}: {
  item: QuestionMediaItem
  compact?: boolean
}) {
  const maxH = compact ? 'max-h-32' : 'max-h-64'
  if (item.kind === 'image') {
    return (
      <img
        src={item.url}
        alt={item.label || 'Медиа'}
        className={`w-full h-full object-contain ${maxH}`}
      />
    )
  }
  if (item.kind === 'video') {
    return (
      <video controls className={`w-full h-full ${maxH}`} playsInline autoPlay={false}>
        <source src={item.url} />
      </video>
    )
  }
  return (
    <audio controls className="w-full">
      <source src={item.url} />
    </audio>
  )
}

export default function QuestionMediaStage({
  items,
  className = '',
  compact = false,
  visibleIds,
}: Props) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.order - b.order),
    [items]
  )

  const displayItems = useMemo(() => {
    if (!visibleIds || !hasPlaybackRules(sorted)) return sorted
    return sorted.filter((i) => visibleIds.has(i.id))
  }, [sorted, visibleIds])

  if (!displayItems.length) return null

  if (!hasCustomLayout(displayItems)) {
    return (
      <QuestionMediaGallery items={displayItems} className={className} compact={compact} />
    )
  }

  const stageH = compact ? 'min-h-[12rem]' : 'min-h-[20rem]'

  return (
    <div className={`relative w-full ${stageH} rounded-lg overflow-hidden bg-gray-900/5 ${className}`}>
      {displayItems.map((item) => {
        const l = item.layout ?? { x: 0, y: 0, w: 100, h: 100 }
        return (
          <div
            key={item.id}
            className="absolute overflow-hidden rounded-md border border-white/10 shadow-sm bg-black/5"
            style={{
              left: `${l.x}%`,
              top: `${l.y}%`,
              width: `${l.w}%`,
              height: `${l.h}%`,
              zIndex: l.zIndex ?? 0,
            }}
          >
            <MediaTile item={item} compact={compact} />
          </div>
        )
      })}
    </div>
  )
}
