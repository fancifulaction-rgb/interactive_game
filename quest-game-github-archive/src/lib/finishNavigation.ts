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
