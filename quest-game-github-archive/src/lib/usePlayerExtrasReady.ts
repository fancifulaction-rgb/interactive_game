import { useEffect, useState } from 'react'

/** Откладывает второстепенные запросы (пауза, уведомления) до простоя UI. */
export function usePlayerExtrasReady(gameId: string | undefined, loading: boolean) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!gameId || loading) {
      setReady(false)
      return
    }

    let cancelled = false
    const enable = () => {
      if (!cancelled) setReady(true)
    }

    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(enable, { timeout: 4000 })
      return () => {
        cancelled = true
        cancelIdleCallback(id)
      }
    }

    enable()
    return () => {
      cancelled = true
    }
  }, [gameId, loading])

  return ready
}
