import { useState } from 'react'
import { Lock, Key, Eye, EyeOff, Shield, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface PasswordManagerProps {
  onPasswordChanged?: () => void
}

export default function PasswordManager({ onPasswordChanged }: PasswordManagerProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong'>('weak')

  const checkPasswordStrength = (password: string) => {
    let score = 0
    if (password.length >= 8) score++
    if (/[A-Z]/.test(password)) score++
    if (/[a-z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++

    if (score < 2) return 'weak'
    if (score < 4) return 'medium'
    return 'strong'
  }

  const validatePassword = (password: string) => {
    const errors = []
    if (password.length < 8) errors.push('Минимум 8 символов')
    if (!/[A-Z]/.test(password)) errors.push('Минимум одна заглавная буква')
    if (!/[a-z]/.test(password)) errors.push('Минимум одна строчная буква')
    if (!/[0-9]/.test(password)) errors.push('Минимум одна цифра')
    if (!/[^A-Za-z0-9]/.test(password)) errors.push('Минимум один специальный символ')
    
    return errors
  }

  const handleNewPasswordChange = (value: string) => {
    setNewPassword(value)
    setPasswordStrength(checkPasswordStrength(value))
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Валидация
    if (newPassword !== confirmPassword) {
      setError('Новые пароли не совпадают')
      return
    }

    const passwordErrors = validatePassword(newPassword)
    if (passwordErrors.length > 0) {
      setError('Пароль не соответствует требованиям: ' + passwordErrors.join(', '))
      return
    }

    if (passwordStrength === 'weak') {
      setError('Пароль слишком слабый. Используйте более сложный пароль.')
      return
    }

    setLoading(true)

    try {
      // Сначала верифицируем текущий пароль
      const userEmail = localStorage.getItem('admin_email')
      
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword
      })

      if (verifyError) {
        setError('Неверный текущий пароль')
        setLoading(false)
        return
      }

      // Если прошли верификацию, обновляем пароль
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (updateError) throw updateError

      setSuccess('Пароль успешно изменен!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordStrength('weak')

      if (onPasswordChanged) {
        onPasswordChanged()
      }
    } catch (err: any) {
      setError('Ошибка при смене пароля: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const getStrengthColor = () => {
    switch (passwordStrength) {
      case 'weak': return 'bg-red-500'
      case 'medium': return 'bg-yellow-500'
      case 'strong': return 'bg-green-500'
      default: return 'bg-gray-300'
    }
  }

  const getStrengthText = () => {
    switch (passwordStrength) {
      case 'weak': return 'Слабый'
      case 'medium': return 'Средний'
      case 'strong': return 'Сильный'
      default: return ''
    }
  }

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-6">
        <Key className="w-5 h-5 text-purple-600" />
        <h2 className="text-xl font-bold text-gray-800">Смена пароля администратора</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Текущий пароль */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Shield className="w-4 h-4 inline mr-1" />
            Текущий пароль
          </label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Введите текущий пароль"
              required
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showCurrent ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Новый пароль */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Lock className="w-4 h-4 inline mr-1" />
            Новый пароль
          </label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => handleNewPasswordChange(e.target.value)}
              className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Введите новый пароль"
              required
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {/* Индикатор силы пароля */}
          {newPassword && (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${getStrengthColor()}`}
                    style={{ width: passwordStrength === 'weak' ? '25%' : passwordStrength === 'medium' ? '75%' : '100%' }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-600">
                  {getStrengthText()}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Подтверждение пароля */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Подтвердите новый пароль
          </label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                setError('')
              }}
              className={`w-full px-4 py-3 pr-12 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                confirmPassword && newPassword !== confirmPassword 
                  ? 'border-red-300 bg-red-50' 
                  : 'border-gray-300'
              }`}
              placeholder="Повторите новый пароль"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Пароли не совпадают
            </p>
          )}
        </div>

        {/* Требования к паролю */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Требования к паролю:</h4>
          <ul className="text-xs text-gray-600 space-y-1">
            <li className={newPassword.length >= 8 ? 'text-green-600' : ''}>• Минимум 8 символов</li>
            <li className={/[A-Z]/.test(newPassword) ? 'text-green-600' : ''}>• Минимум одна заглавная буква (A-Z)</li>
            <li className={/[a-z]/.test(newPassword) ? 'text-green-600' : ''}>• Минимум одна строчная буква (a-z)</li>
            <li className={/[0-9]/.test(newPassword) ? 'text-green-600' : ''}>• Минимум одна цифра (0-9)</li>
            <li className={/[^A-Za-z0-9]/.test(newPassword) ? 'text-green-600' : ''}>• Минимум один специальный символ (!@#$%^&*)</li>
          </ul>
        </div>

        {/* Сообщения об ошибках и успехе */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}

        {/* Кнопка сохранения */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
              loading || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            <Lock className="w-4 h-4" />
            {loading ? 'Изменение...' : 'Изменить пароль'}
          </button>
        </div>
      </form>
    </div>
  )
}