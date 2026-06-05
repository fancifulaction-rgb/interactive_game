import { useNavigate } from 'react-router-dom'
import { AlertCircle, Home } from 'lucide-react'

interface AccessDeniedScreenProps {
  title?: string
  message: string
  showRegisterLink?: boolean
}

export default function AccessDeniedScreen({
  title = 'Доступ закрыт',
  message,
  showRegisterLink = false,
}: AccessDeniedScreenProps) {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-3">{title}</h1>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Home className="w-4 h-4" />
            На главную
          </button>
          {showRegisterLink && (
            <button
              type="button"
              onClick={() => navigate('/team/register')}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              К регистрации
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
