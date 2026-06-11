import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { roleForPathname, trackProductEvent } from '../lib/productAnalytics'

function gameCodeFromPath(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const head = parts[0]
  if (['game', 'scoreboard', 'host', 'congratulation', 'congratulation-with-stats'].includes(head)) {
    return parts[1]?.toUpperCase() ?? null
  }
  if (head === 'scoreboard-admin' || head === 'scoreboard-detailed') {
    return parts[1]?.toUpperCase() ?? null
  }
  return null
}

export default function ProductRouteTracker() {
  const location = useLocation()
  const prevPath = useRef<string | null>(null)

  useEffect(() => {
    const pathname = location.pathname
    if (prevPath.current === pathname) return
    prevPath.current = pathname

    const role = roleForPathname(pathname)
    const gameCode = gameCodeFromPath(pathname)

    trackProductEvent({
      event: 'page_view',
      role,
      gameCode,
      payload: {
        search: location.search ? location.search.slice(0, 120) : undefined,
      },
    })
  }, [location.pathname, location.search])

  return null
}
