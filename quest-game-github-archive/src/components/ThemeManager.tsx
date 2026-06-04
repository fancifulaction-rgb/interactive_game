import { useState } from 'react'
import { Plus, Edit, Trash2, Eye, X } from 'lucide-react'

interface Theme {
  id: string
  name: string
  display_name: string
  colors: {
    primary: string
    secondary: string
    background: string
  }
  effects: Record<string, boolean>
  created_at?: string
}

interface Game {
  id: string
  title: string
  theme: string
}

interface ThemeManagerProps {
  themes: Theme[]
  games: Game[]
  onCreateTheme: (themeData: Partial<Theme>) => void
  onUpdateTheme: (themeId: string, themeData: Partial<Theme>) => void
  onDeleteTheme: (themeId: string, themeName: string) => void
  onToggleCreate: () => void
  editingTheme: Theme | null
  setEditingTheme: (theme: Theme | null) => void
  showCreate: boolean
}

export default function ThemeManager({
  themes,
  games,
  onCreateTheme,
  onUpdateTheme,
  onDeleteTheme,
  onToggleCreate,
  editingTheme,
  setEditingTheme,
  showCreate
}: ThemeManagerProps) {
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null)

  // Подсчитаем, сколько игр использует каждую тему
  const themeUsage = themes.reduce((acc, theme) => {
    acc[theme.name] = games.filter(game => game.theme === theme.name).length
    return acc
  }, {} as Record<string, number>)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-800">Темы оформления</h2>
        <button
          onClick={onToggleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Создать тему
        </button>
      </div>

      {/* Форма создания/редактирования темы */}
      {(showCreate || editingTheme) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">
                {editingTheme ? 'Редактировать тему' : 'Создать тему'}
              </h3>
              <button
                onClick={() => {
                  setEditingTheme(null)
                  onToggleCreate()
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ThemeForm
              theme={editingTheme}
              onSave={(themeData) => {
                if (editingTheme) {
                  onUpdateTheme(editingTheme.id, themeData)
                } else {
                  onCreateTheme(themeData)
                }
              }}
              onCancel={() => {
                setEditingTheme(null)
                onToggleCreate()
              }}
            />
          </div>
        </div>
      )}

      {/* Сетка тем */}
      {themes.length === 0 ? (
        <div className="bg-white rounded-lg p-12 text-center">
          <p className="text-gray-600 mb-4">Нет созданных тем</p>
          <button
            onClick={onToggleCreate}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Создать первую тему
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {themes.map((theme) => (
            <div
              key={theme.id}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Предпросмотр темы */}
              <div 
                className="h-32 p-4 relative"
                style={{ 
                  backgroundColor: theme.colors.background,
                  background: `linear-gradient(135deg, ${theme.colors.background} 0%, ${theme.colors.background}CC 100%)`
                }}
              >
                <div 
                  className="absolute top-4 left-4 w-8 h-8 rounded-full border-2"
                  style={{ 
                    backgroundColor: theme.colors.primary,
                    borderColor: theme.colors.secondary
                  }}
                />
                <div 
                  className="absolute top-4 right-4 px-3 py-1 rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: theme.colors.secondary }}
                >
                  {theme.name}
                </div>
                <div 
                  className="absolute bottom-4 left-4 px-3 py-1 rounded text-sm font-semibold"
                  style={{ 
                    color: theme.colors.primary,
                    backgroundColor: theme.colors.background + 'AA'
                  }}
                >
                  Образец
                </div>
              </div>

              {/* Информация о теме */}
              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-gray-800">{theme.display_name}</h3>
                  {themeUsage[theme.name] > 0 && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                      {themeUsage[theme.name]} игр
                    </span>
                  )}
                </div>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded-full border"
                      style={{ backgroundColor: theme.colors.primary }}
                    />
                    <span className="text-sm text-gray-600">Основной: {theme.colors.primary}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded-full border"
                      style={{ backgroundColor: theme.colors.secondary }}
                    />
                    <span className="text-sm text-gray-600">Вторичный: {theme.colors.secondary}</span>
                  </div>
                </div>

                {/* Эффекты */}
                {Object.keys(theme.effects).length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-1">Эффекты:</p>
                    <div className="flex gap-1">
                      {Object.entries(theme.effects).map(([effect, enabled]) => 
                        enabled && (
                          <span key={effect} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {effect}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Действия */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setPreviewTheme(theme)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    title="Предпросмотр"
                  >
                    <Eye className="w-4 h-4" />
                    <span className="text-sm">Предпросмотр</span>
                  </button>
                  <button
                    onClick={() => setEditingTheme(theme)}
                    className="flex items-center justify-center gap-1 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Редактировать"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteTheme(theme.id, theme.name)}
                    className="flex items-center justify-center gap-1 px-3 py-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Удалить"
                    disabled={themeUsage[theme.name] > 0}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Модальное окно предпросмотра */}
      {previewTheme && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Предпросмотр темы: {previewTheme.display_name}</h3>
              <button
                onClick={() => setPreviewTheme(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div 
              className="p-8 rounded-lg"
              style={{ backgroundColor: previewTheme.colors.background }}
            >
              <div className="text-center space-y-4">
                <h2 
                  className="text-3xl font-bold"
                  style={{ color: previewTheme.colors.primary }}
                >
                  Заголовок игры
                </h2>
                <p 
                  className="text-lg"
                  style={{ color: previewTheme.colors.secondary }}
                >
                  Описание и дополнительная информация
                </p>
                <button 
                  className="px-6 py-3 rounded-lg text-white font-semibold transition-transform hover:scale-105"
                  style={{ backgroundColor: previewTheme.colors.primary }}
                >
                  Кнопка действия
                </button>
                <button 
                  className="px-4 py-2 rounded-lg text-sm font-medium ml-2 transition-transform hover:scale-105"
                  style={{ 
                    backgroundColor: previewTheme.colors.secondary,
                    color: '#ffffff'
                  }}
                >
                  Вторичная кнопка
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface ThemeFormProps {
  theme?: Theme | null
  onSave: (themeData: Partial<Theme>) => void
  onCancel: () => void
}

function ThemeForm({ theme, onSave, onCancel }: ThemeFormProps) {
  const [formData, setFormData] = useState({
    name: theme?.name || '',
    display_name: theme?.display_name || '',
    colors: theme?.colors || {
      primary: '#3b82f6',
      secondary: '#8b5cf6',
      background: '#ffffff'
    },
    effects: theme?.effects || {}
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.display_name) {
      alert('Пожалуйста, заполните все обязательные поля')
      return
    }
    onSave(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Название темы (техническое)
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          placeholder="new-year"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Отображаемое название
        </label>
        <input
          type="text"
          value={formData.display_name}
          onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          placeholder="Новый год"
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Основной цвет
          </label>
          <input
            type="color"
            value={formData.colors.primary}
            onChange={(e) => setFormData({ 
              ...formData, 
              colors: { ...formData.colors, primary: e.target.value }
            })}
            className="w-full h-10 border border-gray-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Вторичный цвет
          </label>
          <input
            type="color"
            value={formData.colors.secondary}
            onChange={(e) => setFormData({ 
              ...formData, 
              colors: { ...formData.colors, secondary: e.target.value }
            })}
            className="w-full h-10 border border-gray-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Фон
          </label>
          <input
            type="color"
            value={formData.colors.background}
            onChange={(e) => setFormData({ 
              ...formData, 
              colors: { ...formData.colors, background: e.target.value }
            })}
            className="w-full h-10 border border-gray-300 rounded-lg"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Основной цвет
          </label>
          <input
            type="text"
            value={formData.colors.primary}
            onChange={(e) => setFormData({ 
              ...formData, 
              colors: { ...formData.colors, primary: e.target.value }
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="#3b82f6"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Вторичный цвет
          </label>
          <input
            type="text"
            value={formData.colors.secondary}
            onChange={(e) => setFormData({ 
              ...formData, 
              colors: { ...formData.colors, secondary: e.target.value }
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="#8b5cf6"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Фон
          </label>
          <input
            type="text"
            value={formData.colors.background}
            onChange={(e) => setFormData({ 
              ...formData, 
              colors: { ...formData.colors, background: e.target.value }
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="#ffffff"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Отмена
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          {theme ? 'Сохранить' : 'Создать'}
        </button>
      </div>
    </form>
  )
}
