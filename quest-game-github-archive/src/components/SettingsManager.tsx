import { useState } from 'react'
import { Save, Edit, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Settings {
  id?: string
  key: string
  value: string
  description: string
  category: string
}

interface SettingsManagerProps {
  settings: Settings[]
  onUpdateSettings: (settings: Settings[]) => void
}

interface SettingsCategoryProps {
  category: string
  settings: Settings[]
  editingSettings: {[key: string]: string}
  onEdit: (key: string, currentValue: string) => void
  onSave: (key: string) => Promise<void>
  onCancel: (key: string) => void
  onSetEditingSettings: (settings: {[key: string]: string}) => void
}

function SettingsCategory({ 
  category, 
  settings, 
  editingSettings, 
  onEdit, 
  onSave, 
  onCancel,
  onSetEditingSettings
}: SettingsCategoryProps) {
  const handleEdit = (key: string, currentValue: string) => {
    onEdit(key, currentValue)
  }

  const handleSave = async (key: string) => {
    await onSave(key)
  }

  const handleCancel = (key: string) => {
    onCancel(key)
  }

  return (
    <div className="space-y-4">
      {settings.map(setting => (
        <div key={setting.key} className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h4 className="font-medium text-gray-800">{setting.key}</h4>
              {editingSettings[setting.key] !== undefined ? (
                <div className="flex items-center gap-2">
                  <input
                    type={setting.key.includes('time') ? 'number' : 'text'}
                    value={editingSettings[setting.key]}
                    onChange={(e) => onSetEditingSettings({
                      ...editingSettings,
                      [setting.key]: e.target.value
                    })}
                    className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => handleSave(setting.key)}
                    className="text-green-600 hover:text-green-800"
                    title="Сохранить"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleCancel(setting.key)}
                    className="text-gray-500 hover:text-gray-700"
                    title="Отмена"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                    {setting.value}
                  </span>
                  <button
                    onClick={() => handleEdit(setting.key, setting.value)}
                    className="text-blue-600 hover:text-blue-800"
                    title="Редактировать"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">{setting.description}</p>
          </div>
        </div>
      ))}
      {settings.length === 0 && (
        <p className="text-gray-500 text-sm">Нет настроек в этой категории</p>
      )}
    </div>
  )
}

export default function SettingsManager({ settings, onUpdateSettings }: SettingsManagerProps) {
  const [editingSettings, setEditingSettings] = useState<{[key: string]: string}>({})

  // Группировка настроек по категориям
  const groupedSettings = settings.reduce((acc, setting) => {
    if (!acc[setting.category]) {
      acc[setting.category] = []
    }
    acc[setting.category].push(setting)
    return acc
  }, {} as Record<string, Settings[]>)

  const categories = ['Общие', 'Время', 'Очки', 'Интерфейс']

  const handleEdit = (key: string, currentValue: string) => {
    setEditingSettings({ ...editingSettings, [key]: currentValue })
  }

  const handleSave = async (key: string) => {
    const newValue = editingSettings[key]
    if (!newValue) return

    try {
      const { data, error } = await supabase
        .from('settings')
        .update({ value: newValue })
        .eq('key', key)
        .select()
        .single()

      if (error) throw error

      // Обновляем локальное состояние
      const updatedSettings = settings.map(setting => 
        setting.key === key ? { ...setting, value: newValue } : setting
      )
      onUpdateSettings(updatedSettings)
      
      // Убираем из состояния редактирования
      const { [key]: removed, ...rest } = editingSettings
      setEditingSettings(rest)
    } catch (error: any) {
      alert('Ошибка сохранения: ' + error.message)
    }
  }

  const handleCancel = (key: string) => {
    const { [key]: removed, ...rest } = editingSettings
    setEditingSettings(rest)
  }

  return (
    <div className="space-y-6">
      {categories.map(category => (
        <div key={category} className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800">{category}</h3>
          </div>
          <div className="p-6">
            <SettingsCategory
              category={category}
              settings={groupedSettings[category] || []}
              editingSettings={editingSettings}
              onEdit={handleEdit}
              onSave={handleSave}
              onCancel={handleCancel}
              onSetEditingSettings={setEditingSettings}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
