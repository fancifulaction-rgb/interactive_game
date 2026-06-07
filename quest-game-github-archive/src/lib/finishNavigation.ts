import type { TeamSnapshot } from './gamePlayCache'

export type FinishNavigateState = {
  gameId: string
  game: Record<string, unknown>
  teamsPreview?: TeamSnapshot[]
}

export function buildFinishNavigateState(
  game: Record<string, unknown>,
  teamsPreview?: TeamSnapshot[]
): FinishNavigateState {
  return {
    gameId: String(game.id),
    game,
    teamsPreview,
  }
}

export function getFinishPagePath(
  gameCode: string,
  finishPageType: string | null | undefined
): string {
  const code = gameCode.trim().toUpperCase()
  switch (finishPageType) {
    case 'congratulation':
      return `/congratulation/${code}`
    case 'congratulation_stats':
      return `/congratulation-with-stats/${code}`
    case 'scoreboard':
    default:
      return `/scoreboard/${code}`
  }
}

function finishStateKey(code: string) {
  return `quest_finish_${code.trim().toUpperCase()}`
}

/** Safari часто теряет location.state при navigate — дублируем в sessionStorage. */
export function persistFinishNavigateState(gameCode: string, state: FinishNavigateState): void {
  const key = finishStateKey(gameCode)
  try {
    sessionStorage.setItem(key, JSON.stringify({ ...state, savedAt: Date.now() }))
  } catch {
    /* ignore */
  }
}

export function readFinishNavigateState(gameCode: string): FinishNavigateState | null {
  const key = finishStateKey(gameCode)
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FinishNavigateState & { savedAt?: number }
    if (!parsed?.gameId || !parsed?.game) return null
    return {
      gameId: parsed.gameId,
      game: parsed.game,
      teamsPreview: parsed.teamsPreview,
    }
  } catch {
    return null
  }
}

export function navigateToFinish(
  navigate: (path: string, opts?: { state?: FinishNavigateState }) => void,
  gameCode: string,
  finishPageType: string | null | undefined,
  state: FinishNavigateState
): void {
  const code = gameCode.trim().toUpperCase()
  persistFinishNavigateState(code, state)
  navigate(getFinishPagePath(code, finishPageType), { state })
}
