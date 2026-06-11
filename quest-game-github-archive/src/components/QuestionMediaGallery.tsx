import { useCallback, useEffect, useMemo, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import type { QuestionMediaItem } from '../lib/questionMediaTypes'

type Props = {
  items: QuestionMediaItem[]
  className?: string
  compact?: boolean
}

export default function QuestionMediaGallery({ items, className = '', compact = false }: Props) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => a.order - b.order),
    [items]
  )

  const images = sorted.filter((i) => i.kind === 'image')
  const others = sorted.filter((i) => i.kind !== 'image')

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: 'start' })
  const [slideIndex, setSlideIndex] = useState(0)

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSlideIndex(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    onSelect()
    emblaApi.on('select', onSelect)
    emblaApi.on('reInit', onSelect)
    return () => {
      emblaApi.off('select', onSelect)
      emblaApi.off('reInit', onSelect)
    }
  }, [emblaApi, onSelect])

  if (!sorted.length) return null

  const maxH = compact ? 'max-h-48' : 'max-h-96'

  return (
    <div className={`space-y-4 ${className}`}>
      {images.length === 1 && (
        <div className="rounded-lg overflow-hidden">
          <img
            src={images[0].url}
            alt={images[0].label || 'Медиа вопроса'}
            className={`w-full ${maxH} object-contain`}
          />
        </div>
      )}

      {images.length > 1 && (
        <div className="rounded-lg overflow-hidden">
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex">
              {images.map((item) => (
                <div key={item.id} className="min-w-0 flex-[0_0_100%]">
                  <img
                    src={item.url}
                    alt={item.label || 'Медиа вопроса'}
                    className={`w-full ${maxH} object-contain`}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => emblaApi?.scrollPrev()}
              disabled={slideIndex === 0}
              className="px-2 py-1 text-sm rounded bg-gray-100 disabled:opacity-40"
              aria-label="Предыдущее фото"
            >
              ←
            </button>
            <span className="text-sm text-gray-600">
              {slideIndex + 1} / {images.length}
            </span>
            <button
              type="button"
              onClick={() => emblaApi?.scrollNext()}
              disabled={slideIndex >= images.length - 1}
              className="px-2 py-1 text-sm rounded bg-gray-100 disabled:opacity-40"
              aria-label="Следующее фото"
            >
              →
            </button>
          </div>
        </div>
      )}

      {others.map((item) => (
        <div key={item.id} className="rounded-lg overflow-hidden">
          {item.kind === 'video' && (
            <video controls className={`w-full ${maxH}`} playsInline>
              <source src={item.url} />
            </video>
          )}
          {item.kind === 'audio' && (
            <audio controls className="w-full">
              <source src={item.url} />
            </audio>
          )}
        </div>
      ))}
    </div>
  )
}
