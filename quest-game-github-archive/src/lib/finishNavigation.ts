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
