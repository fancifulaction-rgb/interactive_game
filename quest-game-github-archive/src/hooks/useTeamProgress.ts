import { useCallback, useEffect, useRef, useState } from 'react'
import { attachGameRealtime } from '../lib/gameRealtime'
import {
  fetchTeamProgress,
  invalidateTeamProgressCache,
  type TeamProgressRow,
} from '../lib/teamProgress'

const POLL_MS = 5000

export function useTeamProgress(gameId: string, enabled: boolean) {
  const [rows, setRows] = useState<TeamProgressRow[]>([])
  const [loading, setLoading] = useState(false)
  const seqRef = useRef(0)

  const refresh = useCallback(
    async (force = false) => {
      if (!gameId || !enabled) {
        setRows([])
        return
      }
      const seq = ++seqRef.current
      if (!force && rows.length === 0) setLoading(true)
      try {
        const data = await fetchTeamProgress(gameId, { force })
        if (seq !== seqRef.current) return
        setRows(data)
      } catch (err) {
        if (seq !== seqRef.current) return
        console.warn('useTeamProgress:', err)
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    },
    [gameId, enabled, rows.length]
  )

  useEffect(() => {
    if (!gameId || !enabled) {
      setRows([])
      return
    }
    void refresh(true)
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [gameId, enabled, refresh])

  useEffect(() => {
    if (!gameId || !enabled) return
    const detach = attachGameRealtime(gameId, {
      onSessionChanged: () => {
        invalidateTeamProgressCache(gameId)
        void refresh(true)
      },
      onTeamsChanged: () => {
        invalidateTeamProgressCache(gameId)
        void refresh(true)
      },
      onScoreUpdate: () => {
        invalidateTeamProgressCache(gameId)
        void refresh(true)
      },
    })
    return detach
  }, [gameId, enabled, refresh])

  return { rows, loading, refresh }
}
