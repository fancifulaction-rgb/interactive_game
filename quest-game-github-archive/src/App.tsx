import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { ThemeProvider } from './contexts/ThemeContext'
import ProductRouteTracker from './components/ProductRouteTracker'
import './App.css'

// Ленивая загрузка страниц для оптимизации бандла
const Home = lazy(() => import('./pages/Home'))
const AdminLogin = lazy(() => import('./pages/AdminLogin'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const AdminPanel = lazy(() => import('./pages/AdminPanel'))
const GameEditor = lazy(() => import('./pages/GameEditor'))
const TeamRegister = lazy(() => import('./pages/TeamRegister'))
const GamePlay = lazy(() => import('./pages/GamePlay'))
const PlayerScoreboard = lazy(() => import('./pages/PlayerScoreboard'))
const AdminScoreboard = lazy(() => import('./pages/AdminScoreboard'))
const HostView = lazy(() => import('./pages/HostView'))
const ScoreboardDetailed = lazy(() => import('./pages/ScoreboardDetailed'))
const Congratulation = lazy(() => import('./pages/Congratulation'))
const CongratulationWithStats = lazy(() => import('./pages/CongratulationWithStats'))


// Компонент загрузки
const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
  </div>
)

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ProductRouteTracker />
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/reset-password" element={<ResetPassword />} />
            <Route path="/admin/panel" element={<AdminPanel />} />
            <Route path="/admin/game/:gameId/edit" element={<GameEditor />} />
            <Route path="/team/register" element={<TeamRegister />} />
            <Route path="/game/:gameCode" element={<GamePlay />} />
            <Route path="/scoreboard/:gameCode" element={<PlayerScoreboard />} />
            <Route path="/host/:gameCode" element={<HostView />} />
            <Route path="/scoreboard-admin/:gameCode" element={<AdminScoreboard />} />
            <Route path="/scoreboard-detailed/:gameCode" element={<ScoreboardDetailed />} />
            <Route path="/congratulation/:gameCode" element={<Congratulation />} />
            <Route path="/congratulation-with-stats/:gameCode" element={<CongratulationWithStats />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
