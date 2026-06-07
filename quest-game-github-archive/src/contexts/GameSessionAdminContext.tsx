import { createContext, useContext, type ReactNode } from 'react'
import type { GameSessionAdminState } from '../hooks/useGameSessionAdmin'

const GameSessionAdminContext = createContext<GameSessionAdminState | null>(null)

export function GameSessionAdminProvider({
  value,
  children,
}: {
  value: GameSessionAdminState
  children: ReactNode
}) {
  return (
    <GameSessionAdminContext.Provider value={value}>{children}</GameSessionAdminContext.Provider>
  )
}

export function useGameSessionAdminContext(): GameSessionAdminState | null {
  return useContext(GameSessionAdminContext)
}
