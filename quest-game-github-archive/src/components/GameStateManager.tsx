import { useEffect, useRef, useState } from 'react'
import { Pause } from 'lucide-react'
import { fetchGameStateForGame } from '../lib/fetchGameState'
import {
  attachGameRealtime,
  type SessionBroadcastPayload,
} from '../lib/gameRealtime'
import { agentDebugLog } from '../lib/debugLog'
import {
  getCachedSessionSnapshot,
  rememberSessionSnapshot,
  resolveSlowFetchFallback,
  shouldBlockLobbyRegression,
} from '../lib/gameSessionSnapshotCache'
import {
  type GameStateRow,
  isGameClosed,
  isGameFinished,
  isGameInLobby,
  isGamePausedDuringPlay,
  isGameStateRowNewer,
} from '../lib/gameSessionState'

export type GameSessionSnapshot = {
  inLobby: boolean
  isPaused: boolean
  isFinished: boolean
  isClosed: boolean
  sessionUnknown: boolean
}

interface GameStateManagerProps {
  gameId: string
  onSessionChange: (session: GameSessionSnapshot) => void
}

function snapshotFromRow(row: GameStateRow | null): GameSessionSnapshot {
  if (!row) {
    return {
      inLobby: false,
      isPaused: false,
      isFinished: false,
      isClosed: false,
      sessionUnknown: true,
    }
  }
  return {
    inLobby: isGameInLobby(row),
    isPaused: isGamePausedDuringPlay(row),
    isFinished: isGameFinished(row),
    isClosed: isGameClosed(row),
    sessionUnknown: false,
  }
}

const SETUP_TIMEOUT_MS_DESKTOP = 1200
const SETUP_TIMEOUT_MS_MOBILE = 8000

function setupTimeoutMs(): number {
  if (typeof navigator === 'undefined') return SETUP_TIMEOUT_MS_DESKTOP
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    ? SETUP_TIMEOUT_MS_MOBILE
    : SETUP_TIMEOUT_MS_DESKTOP
}
const LOBBY_POLL_MS_DESKTOP = 4000
const LOBBY_POLL_MS_MOBILE = 20000
const PLAYING_POLL_MS_MOBILE = 45000
const PLAYING_POLL_MS_DESKTOP = 8000
// Во время паузы realtime-broadcast часто теряется на мобильных, поэтому опрашиваем
// состояние чаще — чтобы «продолжить игру» доходил даже при мёртвом WebSocket.
const PAUSED_POLL_MS_MOBILE = 7000
const PAUSED_POLL_MS_DESKTOP = 4000

function isMobileClient(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches
  const mobileUa = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  return !!(coarse || mobileUa)
}

function pollMs(inLobby: boolean, paused: boolean): number {
  if (typeof window === 'undefined') return LOBBY_POLL_MS_DESKTOP
  const mobile = isMobileClient()
  if (!inLobby) {
    if (paused) return mobile ? PAUSED_POLL_MS_MOBILE : PAUSED_POLL_MS_DESKTOP
    return mobile ? PLAYING_POLL_MS_MOBILE : PLAYING_POLL_MS_DESKTOP
  }
  return mobile ? LOBBY_POLL_MS_MOBILE : LOBBY_POLL_MS_DESKTOP
}

function mergeBroadcastIntoRow(
  gameId: string,
  prev: GameStateRow | null,
  payload: SessionBroadcastPayload
): GameStateRow {
  return {
    id: prev?.id,
    game_id: gameId,
    current_state:
      payload.current_state !== undefined ? payload.current_state : prev?.current_state,
    is_paused: payload.is_paused !== undefined ? payload.is_paused : prev?.is_paused,
    paused_at: payload.paused_at !== undefined ? payload.paused_at : prev?.paused_at ?? null,
    paused_by: payload.paused_by !== undefined ? payload.paused_by : prev?.paused_by ?? null,
    updated_at:
      payload.updated_at !== undefined && payload.updated_at !== null
        ? payload.updated_at
        : prev?.updated_at ?? null,
    player_data: prev?.player_data ?? null,
  }
}

export default function GameStateManager({ gameId, onSessionChange }: GameStateManagerProps) {
  const [gameState, setGameState] = useState<GameStateRow | null>(null)
  const inLobbyRef = useRef(true)
  const pausedRef = useRef(false)

  useEffect(() => {
    if (!gameId) return

    let detachRt: (() => void) | null = null
    let cancelled = false
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let hasSuccessfulApply = false
    let setupTimeoutId: number | null = null

    const schedulePoll = () => {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = setInterval(() => {
        void loadGameState()
      }, pollMs(inLobbyRef.current, pausedRef.current))
    }

    const emitSession = (snap: GameSessionSnapshot) => {
      const prev = getCachedSessionSnapshot(gameId)
      if (shouldBlockLobbyRegression(prev, snap)) {
        agentDebugLog(
          'GameStateManager.tsx',
          'blocked lobby regression',
          { gameId, prevInLobby: prev?.inLobby, nextInLobby: snap.inLobby },
          'H12'
        )
        return
      }
      const lobbyChanged = inLobbyRef.current !== snap.inLobby
      const pausedChanged = pausedRef.current !== snap.isPaused
      inLobbyRef.current = snap.inLobby
      pausedRef.current = snap.isPaused
      rememberSessionSnapshot(gameId, snap)
      onSessionChange(snap)
      // Перепланируем опрос при смене lobby/paused: во время паузы нужен частый poll,
      // чтобы resume дошёл даже при потерянном realtime-broadcast.
      if (lobbyChanged || pausedChanged) schedulePoll()
    }

    const cached = getCachedSessionSnapshot(gameId)
    if (cached) {
      hasSuccessfulApply = true
      emitSession(cached)
    }

    const commitState = (row: GameStateRow | null) => {
      if (!row) {
        if (hasSuccessfulApply) return
        setGameState(null)
        emitSession(snapshotFromRow(null))
        return
      }

      setGameState((prev) => {
        if (prev && !isGameStateRowNewer(row, prev)) {
          return prev
        }
        hasSuccessfulApply = true
        emitSession(snapshotFromRow(row))
        return row
      })
    }

    const apply = (row: GameStateRow | null) => {
      commitState(row)
    }

    const applyBroadcast = (payload: SessionBroadcastPayload) => {
      setGameState((prev) => {
        const row = mergeBroadcastIntoRow(gameId, prev, payload)
        if (prev && !isGameStateRowNewer(row, prev)) {
          return prev
        }
        hasSuccessfulApply = true
        emitSession(snapshotFromRow(row))
        return row
      })
    }

    let firstApplyDone = !!cached

    const loadGameState = async (force = false) => {
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        const data = await fetchGameStateForGame(gameId, { force })
        if (!cancelled) {
          firstApplyDone = true
          apply(data)
        }
      } catch (err: unknown) {
        console.error('Ошибка загрузки состояния игры:', err)
        if (!cancelled && !hasSuccessfulApply) {
          firstApplyDone = true
          // #region agent log
          agentDebugLog(
            'GameStateManager.tsx',
            'fetch error optimistic lobby',
            { gameId, err: err instanceof Error ? err.message : String(err) },
            'H7'
          )
          // #endregion
          const fallback = resolveSlowFetchFallback(gameId)
          agentDebugLog(
            'GameStateManager.tsx',
            'fetch error slow-fetch fallback',
            { gameId, inLobby: fallback.inLobby },
            'H7'
          )
          emitSession(fallback)
        }
      }
    }

    const setup = async () => {
      setupTimeoutId = window.setTimeout(() => {
        if (!cancelled && !firstApplyDone && !hasSuccessfulApply) {
          firstApplyDone = true
          const fallback = resolveSlowFetchFallback(gameId)
          // #region agent log
          agentDebugLog(
            'GameStateManager.tsx',
            'timeout slow-fetch fallback',
            { gameId, inLobby: fallback.inLobby, sessionUnknown: fallback.sessionUnknown },
            'H7'
          )
          // #endregion
          emitSession(fallback)
        }
      }, setupTimeoutMs())

      await loadGameState()
      if (setupTimeoutId) window.clearTimeout(setupTimeoutId)
      if (cancelled) return

      detachRt = attachGameRealtime(gameId, {
        onSessionChanged: (payload) => {
          if (!cancelled) applyBroadcast(payload)
        },
        // Второй независимый путь: server-push изменения game_state (postgres_changes).
        // Доходит, даже если broadcast админа потерян — пауза/resume не зависнут.
        onGameStateChanged: (row) => {
          if (!cancelled) apply(row)
        },
      })
    }

    void setup()

    schedulePoll()

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadGameState(true)
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      if (setupTimeoutId) window.clearTimeout(setupTimeoutId)
      if (pollTimer) clearInterval(pollTimer)
      document.removeEventListener('visibilitychange', onVisible)
      detachRt?.()
    }
  }, [gameId, onSessionChange])

  if (!gameState || isGameInLobby(gameState) || !gameState.is_paused) return null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        <div className="mb-6">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Pause className="w-10 h-10 text-orange-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Игра приостановлена
          </h2>
          <p className="text-gray-600">
            Администратор временно остановил игру
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-600 mb-1">Приостановил</p>
          <p className="font-semibold text-gray-800">
            {gameState.paused_by || 'Администратор'}
          </p>
          {gameState.paused_at && (
            <p className="text-xs text-gray-500 mt-2">
              {new Date(gameState.paused_at).toLocaleString('ru-RU')}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 text-orange-600">
            <div className="w-2 h-2 bg-orange-600 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium">Ожидание продолжения...</span>
          </div>
          <p className="text-xs text-gray-500">
            Таймер остановлен. Игра возобновится автоматически.
          </p>
        </div>
      </div>
    </div>
  )
}
