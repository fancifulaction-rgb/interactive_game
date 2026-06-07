import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchGameStateForGame } from '../lib/fetchGameState'
import { fetchLobbyTeams } from '../lib/fetchLobbyTeams'
import { attachGameRealtime, type SessionBroadcastPayload } from '../lib/gameRealtime'
import type { GameStateRow } from '../lib/gameSessionState'

export type LobbyTeamRow = {
  id: string
  team_name: string | null
  name: string | null
  captain_name: string | null
  avatar_url?: string | null
}

export type GameSessionAdminState = {
  gameId: string
  gameState: GameStateRow | null
  teams: LobbyTeamRow[]
  dataLoading: boolean
  adminBusy: boolean
  setAdminBusy: (busy: boolean) => void
  refreshGameState: (force?: boolean) => Promise<void>
  refreshTeams: (force?: boolean, acceptEmpty?: boolean) => Promise<void>
  applyOptimisticState: (patch: Partial<GameStateRow>) => void
  setTeamsDirect: (teams: LobbyTeamRow[]) => void
}

function mergeSessionBroadcast(
  gameId: string,
  prev: GameStateRow | null,
  payload: SessionBroadcastPayload
): GameStateRow {
  return {
    game_id: gameId,
    current_state: payload.current_state ?? prev?.current_state ?? null,
    is_paused: payload.is_paused ?? prev?.is_paused ?? false,
    paused_at: payload.paused_at ?? prev?.paused_at ?? null,
    paused_by: payload.paused_by ?? prev?.paused_by ?? null,
    updated_at: payload.updated_at ?? prev?.updated_at ?? null,
    player_data: prev?.player_data ?? {},
  }
}

export function useGameSessionAdmin(gameId: string): GameSessionAdminState {
  const [gameState, setGameState] = useState<GameStateRow | null>(null)
  const [teams, setTeams] = useState<LobbyTeamRow[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const adminBusyRef = useRef(false)
  const [adminBusy, setAdminBusyState] = useState(false)
  const gameStateLoadSeq = useRef(0)
  const teamsLoadSeq = useRef(0)
  const teamsLoadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRealtimeTeamsAt = useRef(0)

  const setAdminBusy = useCallback((busy: boolean) => {
    adminBusyRef.current = busy
    setAdminBusyState(busy)
  }, [])

  const refreshGameState = useCallback(async (force = false) => {
    if (!gameId) return
    const seq = ++gameStateLoadSeq.current
    try {
      const row = await fetchGameStateForGame(gameId, { force })
      if (seq !== gameStateLoadSeq.current) return
      setGameState(row)
    } catch (err) {
      if (seq !== gameStateLoadSeq.current) return
      console.error('useGameSessionAdmin: game state', err)
    } finally {
      if (seq === gameStateLoadSeq.current) setDataLoading(false)
    }
  }, [gameId])

  const refreshTeams = useCallback(
    async (force = false, acceptEmpty = false) => {
      if (!gameId) return
      const seq = ++teamsLoadSeq.current
      try {
        const data = await fetchLobbyTeams(gameId, { force })
        if (seq !== teamsLoadSeq.current) return
        setTeams((prev) =>
          acceptEmpty ? data : data.length > 0 ? data : prev.length > 0 ? prev : data
        )
      } catch (err) {
        if (seq !== teamsLoadSeq.current) return
        console.error('useGameSessionAdmin: teams', err)
      } finally {
        if (seq === teamsLoadSeq.current) setDataLoading(false)
      }
    },
    [gameId]
  )

  const applyOptimisticState = useCallback(
    (patch: Partial<GameStateRow>) => {
      setGameState((prev) => ({
        game_id: gameId,
        current_state: patch.current_state ?? prev?.current_state ?? null,
        is_paused: patch.is_paused ?? prev?.is_paused ?? false,
        paused_at: patch.paused_at ?? prev?.paused_at ?? null,
        paused_by: patch.paused_by ?? prev?.paused_by ?? null,
        player_data: patch.player_data ?? prev?.player_data ?? {},
        updated_at: patch.updated_at ?? prev?.updated_at ?? null,
      }))
    },
    [gameId]
  )

  const setTeamsDirect = useCallback((next: LobbyTeamRow[]) => {
    setTeams(next)
  }, [])

  useEffect(() => {
    if (!gameId) {
      setGameState(null)
      setTeams([])
      return
    }

    setGameState(null)
    setTeams([])
    setDataLoading(true)
    void refreshGameState(true)
    void refreshTeams(true, true)

    const scheduleTeamsReload = () => {
      if (adminBusyRef.current) return
      if (teamsLoadTimer.current) clearTimeout(teamsLoadTimer.current)
      teamsLoadTimer.current = setTimeout(() => {
        teamsLoadTimer.current = null
        if (adminBusyRef.current) return
        void refreshTeams(true)
      }, 800)
    }

    const detachRt = attachGameRealtime(gameId, {
      onSessionChanged: (payload) => {
        if (adminBusyRef.current) return
        setGameState((prev) => mergeSessionBroadcast(gameId, prev, payload))
      },
      onGameStateChanged: (row) => {
        if (adminBusyRef.current) return
        setGameState(row)
      },
      onTeamsChanged: () => {
        lastRealtimeTeamsAt.current = Date.now()
        scheduleTeamsReload()
      },
    })

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !adminBusyRef.current) {
        void refreshGameState(true)
        void refreshTeams(true)
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (teamsLoadTimer.current) clearTimeout(teamsLoadTimer.current)
      document.removeEventListener('visibilitychange', onVisible)
      detachRt()
    }
  }, [gameId, refreshGameState, refreshTeams])

  return {
    gameId,
    gameState,
    teams,
    dataLoading,
    adminBusy,
    setAdminBusy,
    refreshGameState,
    refreshTeams,
    applyOptimisticState,
    setTeamsDirect,
  }
}
