import { useState, useEffect } from 'react'
import { Save, RefreshCw, Type, MessageSquare, Upload, X, Image as ImageIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface QuestSettings {
  quest_title: string
  quest_subtitle: string
  quest_logo_url?: string
}

interface QuestSettingsManagerProps {
  onSave?: (settings: QuestSettings) => void
}

export default function QuestSettingsManager({ onSave }: QuestSettingsManagerProps) {
  const [settings, setSettings] = useState<QuestSettings>({
    quest_title: 'Интерактивный Квест',
    quest_subtitle: 'Выберите режим для начала',
    quest_logo_url: ''
  })
  const [originalSettings, setOriginalSettings] = useState<QuestSettings>({
    quest_title: 'Интерактивный Квест',
    quest_subtitle: 'Выберите режим для начала',
    quest_logo_url: ''
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    loadQuestSettings()
  }, [])

  const loadQuestSettings = async () => {
    try {
      // Загружаем настройки из localStorage
      const savedSettings = localStorage.getItem('quest_settings')
      let parsedSettings = {
        quest_title: 'Интерактивный Квест',
        quest_subtitle: 'Выберите режим для начала',
        quest_logo_url: ''
      }
      
      if (savedSettings) {
        try {
          parsedSettings = { ...parsedSettings, ...JSON.parse(savedSettings) }
        } catch (error) {
          console.error('Ошибка загрузки настроек из localStorage:', error)
        }
      }

      // Проверяем настройки в базе данных
      const { data: dbSettings } = await supabase
        .from('settings')
        .select('key, value')
        .eq('key', 'quest_logo_url')
        .single()

      if (dbSettings && dbSettings.value) {
        parsedSettings.quest_logo_url = dbSettings.value
      }

      setSettings(parsedSettings)
      setOriginalSettings({ ...parsedSettings })
      setLogoPreview(parsedSettings.quest_logo_url || '')
      setHasChanges(false)
    } catch (error) {
      console.error('Ошибка загрузки настроек:', error)
    }
  }

  const handleInputChange = (field: keyof QuestSettings, value: string) => {
    const newSettings = { ...settings, [field]: value }
    setSettings(newSettings)
    setHasChanges(JSON.stringify(newSettings) !== JSON.stringify(originalSettings))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Проверяем тип файла
      if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите файл изображения')
        return
      }
      
      // Проверяем размер файла (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Размер файла не должен превышать 5MB')
        return
      }

      setLogoFile(file)
      
      // Создаем превью
      const reader = new FileReader()
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
      
      setHasChanges(true)
    }
  }

  const uploadLogo = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop()
    const fileName = `quest-logo-${Date.now()}.${fileExt}`
    
    const { data, error } = await supabase.storage
      .from('quest-logos')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      throw new Error(`Ошибка загрузки файла: ${error.message}`)
    }

    // Получаем публичный URL
    const { data: urlData } = supabase.storage
      .from('quest-logos')
      .getPublicUrl(fileName)

    return urlData.publicUrl
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      let logoUrl = settings.quest_logo_url || ''

      // Загружаем файл если он выбран
      if (logoFile) {
        logoUrl = await uploadLogo(logoFile)
      }

      const updatedSettings = { ...settings, quest_logo_url: logoUrl }
      
      // Сохраняем URL логотипа в базу данных
      const { error: dbError } = await supabase
        .from('settings')
        .upsert({
          key: 'quest_logo_url',
          value: logoUrl,
          description: 'URL логотипа на стартовой странице квеста',
          category: 'Квест'
        }, {
          onConflict: 'key'
        })

      if (dbError) {
        throw dbError
      }

      // Сохраняем в localStorage
      localStorage.setItem('quest_settings', JSON.stringify(updatedSettings))
      setSettings(updatedSettings)
      setOriginalSettings(updatedSettings)
      setLogoFile(null)
      setHasChanges(false)

      // Если передан callback, вызываем его
      if (onSave) {
        onSave(updatedSettings)
      }

      // Уведомляем другие компоненты об изменении
      window.dispatchEvent(new Event('storage'))
      
      alert('Настройки успешно сохранены!')
    } catch (error) {
      console.error('Ошибка сохранения:', error)
      alert('Ошибка при сохранении настроек: ' + (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setSettings(originalSettings)
    setHasChanges(false)
  }

  const loadDefaults = () => {
    const defaultSettings = {
      quest_title: 'Интерактивный Квест',
      quest_subtitle: 'Выберите режим для начала',
      quest_logo_url: ''
    }
    setSettings(defaultSettings)
    setLogoPreview('')
    setLogoFile(null)
    setHasChanges(true)
  }

  const removeLogo = () => {
    setSettings({ ...settings, quest_logo_url: '' })
    setLogoPreview('')
    setLogoFile(null)
    setHasChanges(true)
  }

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Type className="w-5 h-5" />
          Настройки главной страницы
        </h2>
        <div className="flex gap-2">
          <button
            onClick={loadDefaults}
            className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
            title="Загрузить значения по умолчанию"
          >
            <RefreshCw className="w-4 h-4" />
            По умолчанию
          </button>
          {hasChanges && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
            >
              Отменить
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Название квеста */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <MessageSquare className="w-4 h-4 inline mr-1" />
            Название квеста
          </label>
          <input
            type="text"
            value={settings.quest_title}
            onChange={(e) => handleInputChange('quest_title', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Введите название квеста"
            maxLength={100}
          />
          <p className="text-xs text-gray-500 mt-1">
            Основной заголовок на главной странице (макс. 100 символов)
          </p>
        </div>

        {/* Подзаголовок */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <MessageSquare className="w-4 h-4 inline mr-1" />
            Подзаголовок
          </label>
          <input
            type="text"
            value={settings.quest_subtitle}
            onChange={(e) => handleInputChange('quest_subtitle', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Введите подзаголовок"
            maxLength={200}
          />
          <p className="text-xs text-gray-500 mt-1">
            Текст под основным заголовком (макс. 200 символов)
          </p>
        </div>

        {/* Логотип */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <ImageIcon className="w-4 h-4 inline mr-1" />
            Логотип квеста
          </label>
          
          {logoPreview ? (
            <div className="relative inline-block">
              <img 
                src={logoPreview} 
                alt="Превью логотипа" 
                className="w-32 h-32 object-contain border border-gray-200 rounded-lg bg-white p-2"
              />
              <button
                onClick={removeLogo}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                title="Удалить логотип"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 mb-3">Загрузите логотип для квеста</p>
              <label className="cursor-pointer">
                <span className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm inline-flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Выбрать файл
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-gray-500 mt-2">
                PNG, JPG, GIF до 5MB
              </p>
            </div>
          )}
          
          {logoFile && (
            <p className="text-sm text-green-600 mt-2">
              ✓ Выбран файл: {logoFile.name}
            </p>
          )}
        </div>

        {/* Предварительный просмотр */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Предварительный просмотр</h3>
          <div className="bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-lg p-6 text-center">
            {logoPreview ? (
              <img 
                src={logoPreview} 
                alt="Логотип" 
                className="w-20 h-20 object-contain mx-auto mb-4 bg-white rounded-lg p-2"
              />
            ) : (
              <div className="w-20 h-20 mx-auto mb-4 bg-white/20 rounded-lg flex items-center justify-center">
                <ImageIcon className="w-10 h-10 text-white/60" />
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2">
              {settings.quest_title || 'Название квеста'}
            </h1>
            <p className="text-lg text-white/90">
              {settings.quest_subtitle || 'Подзаголовок'}
            </p>
          </div>
        </div>
      </div>

      {/* Кнопка сохранения */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
            hasChanges && !saving
              ? 'bg-purple-600 text-white hover:bg-purple-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </div>
    </div>
  )
}