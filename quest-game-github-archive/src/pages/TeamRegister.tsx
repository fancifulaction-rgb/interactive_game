import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
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

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Размер файла не должен превышать 5 МБ')
        return
      }
      setAvatarFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('code', gameCode)
        .maybeSingle()

      if (gameError) throw gameError
      if (!game) {
        setError('Игра с таким кодом не найдена')
        setLoading(false)
        return
      }

      let avatarUrl = null
      if (avatarFile) {
        const fileName = `${Date.now()}-${avatarFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        
        // Convert file to base64 synchronously using FileReader.readAsDataURL
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(avatarFile)
        })
        
        // Upload using player-upload function
        const { data, error } = await supabase.functions.invoke('player-upload', {
          body: { 
            file: base64, 
            bucket: 'answer-media', 
            fileName: fileName,
            mimeType: avatarFile.type
          }
        })
        
        if (error) {
          console.error('Ошибка загрузки аватара:', error)
        } else if (data?.url) {
          avatarUrl = data.url
        }
      }

      const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({
          game_id: game.id,
          team_name: teamName,
          captain_name: captainName,
          avatar: avatarUrl,
          total_score: 0
        })
        .select()
        .maybeSingle()

      if (teamError) throw teamError

      if (team) {
        localStorage.setItem('team_id', team.id)
        localStorage.setItem('game_code', gameCode)
        
        // Сохраняем полную информацию о команде для финальных страниц
        const teamInfo = {
          id: team.id,
          name: team.team_name,
          captain_name: team.captain_name,
          players: [team.captain_name], // Начинаем с капитана как первого игрока
          avatar_url: team.avatar_url
        }
        localStorage.setItem('current_team', JSON.stringify(teamInfo))
        
        navigate(`/game/${gameCode}`)
      }
    } catch (err: any) {
      setError('Ошибка регистрации: ' + err.message)
    } finally {
      setLoading(false)
    }
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
                    <p className="text-xs text-gray-500 mt-1">Макс. 5 МБ</p>
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
