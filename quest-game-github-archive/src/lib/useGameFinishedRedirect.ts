import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchGameStateForGame } from './fetchGameState'
import { attachGameRealtime } from './gameRealtime'
import {
  buildFinishNavigateState,
  getFinishPagePath,
  readFinishNavigateState,
} from './finishNavigation'
import { getGamePlayCache } from './gamePlayCache'
import { isGameFinished } from './gameSessionState'

/** Когда игра перешла в finished — перенаправить участника на страницу результатов. */
export function useGameFinishedRedirect(
  gameCode: string | undefined,
  gameId: string | undefined,
  enabled: boolean
) {
  const navigate = useNavigate()
  const redirectedRef = useRef(false)

  useEffect(() => {
    if (!enabled || !gameCode || !gameId || redirectedRef.current) return

    let cancelled = false

    const goToResults = (finishPageType?: string | null) => {
      if (redirectedRef.current || cancelled) return
      redirectedRef.current = true
      const code = gameCode.trim().toUpperCase()
      const cached = getGamePlayCache(code)
      const persisted = readFinishNavigateState(code)
      const game =
        persisted?.game ??
        (cached?.game as Record<string, unknown> | undefined) ??
        ({ id: gameId } as Record<string, unknown>)
      const finishState = buildFinishNavigateState(game, cached?.teamsSnapshot ?? persisted?.teamsPreview)
      const path = getFinishPagePath(code, finishPageType ?? 'scoreboard')
      navigate(path, { state: finishState, replace: true })
    }

    const check = async () => {
      try {
        const state = await fetchGameStateForGame(gameId, { force: true })
        if (cancelled || !state || !isGameFinished(state)) return
        const code = gameCode.trim().toUpperCase()
        const cached = getGamePlayCache(code)
        const finishType = (cached?.game?.finish_page_type as string | undefined) ?? 'scoreboard'
        goToResults(finishType === 'congratulation' || finishType === 'congratulation_stats' ? 'scoreboard' : finishType)
      } catch {
        /* poll retry */
      }
    }

    void check()

    const detach = attachGameRealtime(gameId, {
      onGameStateChanged: (row) => {
        if (isGameFinished(row)) {
          void check()
        }
      },
      onSessionChanged: (payload) => {
        if (payload.current_state === 'finished') {
          void check()
        }
      },
    })

    const poll = window.setInterval(() => {
      if (document.hidden) return
      void check()
    }, 5000)

    return () => {
      cancelled = true
      detach()
      window.clearInterval(poll)
    }
  }, [enabled, gameCode, gameId, navigate])
}
