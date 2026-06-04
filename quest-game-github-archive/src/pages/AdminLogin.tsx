import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Lock, User, ArrowLeft, Shield } from 'lucide-react'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingReset, setLoadingReset] = useState(false)
  const [loginMode, setLoginMode] = useState<'credentials' | 'email'>('email')
  const [resetMode, setResetMode] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (loginMode === 'email') {
        // Используем Supabase Auth для входа по email
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email,
          password: password
        })

        if (authError) {
          throw authError;
        }

        if (data.user) {
          localStorage.setItem('admin_logged_in', 'true');
          localStorage.setItem('admin_email', email);
          localStorage.setItem('admin_user_id', data.user.id);
          navigate('/admin/panel');
        } else {
          setError('Неверный email или пароль');
        }
      } else {
        // Временный fallback на старую систему (для миграции)
        const { data, error: dbError } = await supabase
          .from('admins')
          .select('*')
          .eq('username', email)
          .eq('password_hash', password)
          .maybeSingle()

        if (dbError) throw dbError

        if (data) {
          localStorage.setItem('admin_logged_in', 'true')
          localStorage.setItem('admin_username', email)
          navigate('/admin/panel')
        } else {
          setError('Неверное имя пользователя или пароль')
        }
      }
    } catch (err: any) {
      if (err.message.includes('Invalid login credentials')) {
        setError('Неверный email или пароль')
      } else {
        setError('Ошибка входа: ' + err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoadingReset(true)

    try {
      // Проверяем, что email в списке разрешенных адресов
      const allowedEmails = ['fancifulaction@gmail.com'];
      
      if (!allowedEmails.includes(email)) {
        setError('Восстановление пароля недоступно для этого email адреса');
        setLoadingReset(false);
        return;
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/admin/reset-password'
      })

      if (resetError) throw resetError

      setResetSuccess(true)
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError('Ошибка восстановления пароля: ' + err.message)
    } finally {
      setLoadingReset(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <button
          onClick={() => navigate('/')}
          className="mb-6 text-white/80 hover:text-white flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Назад
        </button>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800">Вход администратора</h1>

          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email администратора
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="your@email.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Пароль
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Введите пароль"
                  required
                />
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
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>

          <div className="mt-4 text-center space-y-2">
            <button
              type="button"
              onClick={() => setLoginMode(loginMode === 'email' ? 'credentials' : 'email')}
              className="text-sm text-purple-600 hover:text-purple-800 transition-colors"
            >
              {loginMode === 'email' ? 'Войти по учетным данным' : 'Войти по email'}
            </button>
            
            {!resetMode && loginMode === 'email' && (
              <button
                type="button"
                onClick={() => setResetMode(true)}
                className="block text-sm text-gray-500 hover:text-gray-700 transition-colors mx-auto"
              >
                Забыли пароль?
              </button>
            )}
          </div>

          {resetMode && !resetSuccess && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-sm font-medium text-blue-900 mb-2">Восстановление пароля</h3>
              <p className="text-sm text-blue-700 mb-4">
                Введите ваш email адрес для получения ссылки восстановления пароля
              </p>
              <form onSubmit={handlePasswordReset} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email администратора
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    placeholder="your@email.com"
                    required
                  />
                </div>
                {error && (
                  <div className="text-red-600 text-sm bg-red-50 border border-red-200 px-3 py-2 rounded">
                    {error}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={loadingReset}
                    className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {loadingReset ? 'Отправка...' : 'Отправить ссылку'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResetMode(false)
                      setError('')
                      setResetSuccess(false)
                    }}
                    className="px-4 py-2 text-gray-600 text-sm hover:text-gray-800 transition-colors"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            </div>
          )}

          {resetSuccess && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="text-sm font-medium text-green-900 mb-2">Ссылка отправлена!</h3>
              <p className="text-sm text-green-700">
                Проверьте вашу почту для получения ссылки восстановления пароля
              </p>
              <button
                type="button"
                onClick={() => {
                  setResetMode(false)
                  setResetSuccess(false)
                  setEmail('')
                }}
                className="mt-3 text-sm text-green-600 hover:text-green-800 transition-colors"
              >
                Вернуться ко входу
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
