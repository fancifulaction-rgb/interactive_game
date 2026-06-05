import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { registerTeam } from '../lib/teamRegister'
import { enqueueCritical } from '../lib/requestQueue'
import type { TeamSnapshot } from '../lib/gamePlayCache'
import { compressImageForAvatar } from '../lib/compressImage'
import { debugLog } from '../lib/debugLog'
import { setGamePlayCache } from '../lib/gamePlayCache'
import { prefetchQuestionsForGame } from '../lib/prefetchGameQuestions'
import { saveTeamSession } from '../lib/playerSession'
import { getRegistrationDenial } from '../lib/participantAccess'
import { ArrowLeft, Users, User, Upload, Hash } from 'lucide-react'

export default function TeamRegister() {
  const navigate = useNavigate()
  const [gameCode, setGameCode] = useState('')
  const [teamName, setTeamName] = useState('')
  const [captainName, setCaptainName] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submittingRef = useRef(false)

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const prepared = await compressImageForAvatar(file)
      setAvatarFile(prepared)
      const reader = new FileReader()
      reader.onloadend = () => setAvatarPreview(reader.result as string)
      reader.readAsDataURL(prepared)
      if (file.size > prepared.size) {
        setError('')
      }
    } catch {
      setError('Не удалось обработать изображение')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
    setError('')
    setLoading(true)
    const normalizedCode = gameCode.trim().toUpperCase()
    debugLog('TeamRegister.tsx:submit', 'start', { normalizedCode, hasAvatar: !!avatarFile }, 'D')

    try {
      let game = null
      let gameError = null

      debugLog('TeamRegister.tsx', 'game lookup start', { normalizedCode }, 'D')
      const res = await enqueueCritical(async () =>
        supabase
          .from('games')
          .select('id, code, title, theme, per_question_time_sec, finish_page_type, scoring, mask_board, total_time_sec')
          .eq('code', normalizedCode)
          .maybeSingle()
      )
      game = res.data
      gameError = res.error

      if (gameError) {
        throw new Error(
          gameError.message?.includes('fetch') || gameError.message?.includes('Failed')
            ? 'Нет связи с сервером. Проверьте интернет/VPN и попробуйте снова.'
            : gameError.message
        )
      }
      if (!game) {
        debugLog('TeamRegister.tsx', 'game not found', { normalizedCode }, 'D')
        setError(`Игра с кодом «${normalizedCode}» не найдена. Проверьте код в админ-панели.`)
        setLoading(false)
        return
      }
      debugLog('TeamRegister.tsx', 'game found', { gameId: game.id }, 'D')

      const registrationDenial = await getRegistrationDenial(game.id)
      if (registrationDenial) {
        setError(registrationDenial)
        setLoading(false)
        return
      }

      const { team } = await registerTeam({
        gameId: game.id,
        gameCode: normalizedCode,
        teamName,
        captainName,
        avatarFile,
      })

      const teamSnapshot: TeamSnapshot = {
        id: team.id,
        team_name: (team.team_name || team.name) as string,
        captain_name: team.captain_name as string,
        avatar_url: (team.avatar_url || team.avatar) as string | null,
        total_score: Number(team.total_score) || 0,
        registration_time: (team.registration_time || team.created_at) as string,
      }

      let questions: Awaited<ReturnType<typeof prefetchQuestionsForGame>> = []
      try {
        questions = await prefetchQuestionsForGame(game.id)
        debugLog('TeamRegister.tsx', 'questions prefetched', { count: questions.length }, 'F')
      } catch (cacheErr) {
        debugLog('TeamRegister.tsx', 'questions prefetch failed', {
          msg: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
        }, 'F')
      }

      setGamePlayCache(normalizedCode, {
        game,
        questions,
        teamsSnapshot: [teamSnapshot],
      })

      saveTeamSession(team)
      localStorage.setItem('game_code', normalizedCode)
      localStorage.setItem(
        'current_team',
        JSON.stringify({
          id: team.id,
          name: team.team_name || team.name,
          captain_name: team.captain_name,
          players: [team.captain_name || captainName],
          avatar_url: team.avatar_url || team.avatar,
          total_score: 0,
        })
      )

      debugLog('TeamRegister.tsx', 'navigate', { path: `/game/${normalizedCode}` }, 'E')
      setLoading(false)
      navigate(`/game/${normalizedCode}`)
      return
    } catch (err: any) {
      const msg = err?.message || String(err)
      debugLog('TeamRegister.tsx', 'error', { msg }, 'A')
      setError(
        msg.includes('listener indicated an asynchronous response')
          ? 'Сбой расширения браузера. Отключите блокировщики на этом сайте или попробуйте в режиме инкогнито.'
          : 'Ошибка регистрации: ' + msg
      )
    } finally {
      submittingRef.current = false
      setLoading(false)
      debugLog('TeamRegister.tsx', 'finally loading=false', {}, 'E')
    }
    // navigate path returns early above
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <button
          onClick={() => navigate('/')}
          className="mb-6 text-white/80 hover:text-white flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Назад
        </button>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800">Регистрация команды</h1>
            <p className="text-gray-600 mt-2">Заполните данные для участия в игре</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Код игры
              </label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={gameCode}
                  onChange={(e) => {
                    // Разрешаем только буквы и цифры, от 4 до 6 символов
                    const value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)
                    setGameCode(value)
                  }}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl font-bold tracking-widest"
                  placeholder="ABC123"
                  maxLength={6}
                  pattern="[a-zA-Z0-9]{4,6}"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Название команды
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Введите название команды"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Имя капитана
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={captainName}
                  onChange={(e) => setCaptainName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Введите имя капитана"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Аватар команды (необязательно)
              </label>
              <div className="flex items-center gap-4">
                {avatarPreview && (
                  <img
                    src={avatarPreview}
                    alt="Preview"
                    className="w-20 h-20 rounded-full object-cover border-4 border-blue-500"
                  />
                )}
                <label className="flex-1 cursor-pointer">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-500 transition-colors text-center">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {avatarFile ? avatarFile.name : 'Загрузить изображение'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Большие фото сжимаются автоматически</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Регистрация...' : 'Зарегистрироваться'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
