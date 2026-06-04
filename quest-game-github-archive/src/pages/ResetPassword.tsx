import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Lock, ArrowLeft, Shield, Eye, EyeOff } from 'lucide-react'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    // Проверяем, что мы действительно на странице восстановления
    const accessToken = searchParams.get('access_token')
    const refreshToken = searchParams.get('refresh_token')

    if (!accessToken || !refreshToken) {
      navigate('/admin/login')
      return
    }

    // Устанавливаем сессию с токенами
    supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    })
  }, [searchParams, navigate])

  const validatePassword = (password: string) => {
    const requirements = {
      minLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    }

    const score = Object.values(requirements).filter(Boolean).length
    let strength = 'Weak'
    let strengthColor = 'text-red-600'

    if (score >= 4) {
      strength = 'Medium'
      strengthColor = 'text-yellow-600'
    }
    if (score === 5) {
      strength = 'Strong'
      strengthColor = 'text-green-600'
    }

    return {
      requirements,
      score,
      strength,
      strengthColor,
      isValid: score === 5 && password === confirmPassword && password.length > 0
    }
  }

  const passwordValidation = validatePassword(password)

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!passwordValidation.isValid) {
      setError('Пароль не соответствует требованиям')
      setLoading(false)
      return
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      })

      if (updateError) throw updateError

      setSuccess(true)
      
      // Перенаправляем на админ панель через 2 секунды
      setTimeout(() => {
        localStorage.setItem('admin_logged_in', 'true')
        localStorage.setItem('admin_email', searchParams.get('email') || '')
        navigate('/admin/panel')
      }, 2000)
    } catch (err: any) {
      setError('Ошибка обновления пароля: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Пароль успешно обновлен!</h1>
            <p className="text-gray-600 mb-6">
              Вы будете перенаправлены в админ панель через несколько секунд...
            </p>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <button
          onClick={() => navigate('/admin/login')}
          className="mb-6 text-white/80 hover:text-white flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Назад ко входу
        </button>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800">Новый пароль</h1>
            <p className="text-gray-600 mt-2">Введите новый пароль для вашей учетной записи</p>
          </div>

          <form onSubmit={handlePasswordUpdate} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Новый пароль
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Введите новый пароль"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              
              {/* Индикатор силы пароля */}
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Сила пароля:</span>
                  <span className={passwordValidation.strengthColor}>
                    {passwordValidation.strength}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all ${
                      passwordValidation.score <= 2 ? 'bg-red-500' :
                      passwordValidation.score <= 4 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${(passwordValidation.score / 5) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Требования к паролю */}
              <div className="mt-3 text-xs space-y-1">
                <div className={`flex items-center gap-2 ${passwordValidation.requirements.minLength ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-2 h-2 rounded-full ${passwordValidation.requirements.minLength ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                  Минимум 8 символов
                </div>
                <div className={`flex items-center gap-2 ${passwordValidation.requirements.hasUpperCase ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-2 h-2 rounded-full ${passwordValidation.requirements.hasUpperCase ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                  Заглавная буква
                </div>
                <div className={`flex items-center gap-2 ${passwordValidation.requirements.hasLowerCase ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-2 h-2 rounded-full ${passwordValidation.requirements.hasLowerCase ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                  Строчная буква
                </div>
                <div className={`flex items-center gap-2 ${passwordValidation.requirements.hasNumber ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-2 h-2 rounded-full ${passwordValidation.requirements.hasNumber ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                  Цифра
                </div>
                <div className={`flex items-center gap-2 ${passwordValidation.requirements.hasSpecialChar ? 'text-green-600' : 'text-gray-400'}`}>
                  <div className={`w-2 h-2 rounded-full ${passwordValidation.requirements.hasSpecialChar ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                  Специальный символ (!@#$%^&*...)
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Подтвердите пароль
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Повторите пароль"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="mt-1 text-sm text-red-600">Пароли не совпадают</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !passwordValidation.isValid}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Обновление...' : 'Обновить пароль'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}