import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Save, RotateCcw, Info } from 'lucide-react'

interface FinalPageText {
  id: string
  page_type: string
  text_key: string
  default_value: string
  current_value: string | null
  description: string
}

export default function FinalPageTextsManager() {
  const [activeTab, setActiveTab] = useState<'simple' | 'with_stats'>('simple')
  const [texts, setTexts] = useState<FinalPageText[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadTexts()
  }, [activeTab])

  const loadTexts = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('final_page_texts')
        .select('*')
        .eq('page_type', activeTab)
        .order('text_key', { ascending: true })

      if (error) throw error
      setTexts(data || [])
    } catch (err: any) {
      console.error('Ошибка загрузки текстов:', err)
      alert('Ошибка загрузки текстов: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const updateTextValue = (textKey: string, value: string) => {
    setTexts(texts.map(t => 
      t.text_key === textKey 
        ? { ...t, current_value: value }
        : t
    ))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      for (const text of texts) {
        const { error } = await supabase
          .from('final_page_texts')
          .update({ current_value: text.current_value })
          .eq('id', text.id)

        if (error) throw error
      }
      alert('Изменения сохранены успешно')
      loadTexts()
    } catch (err: any) {
      console.error('Ошибка сохранения:', err)
      alert('Ошибка сохранения: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('Вы уверены, что хотите сбросить все тексты к значениям по умолчанию?')) {
      return
    }

    setSaving(true)
    try {
      for (const text of texts) {
        const { error } = await supabase
          .from('final_page_texts')
          .update({ current_value: null })
          .eq('id', text.id)

        if (error) throw error
      }
      alert('Тексты сброшены к значениям по умолчанию')
      loadTexts()
    } catch (err: any) {
      console.error('Ошибка сброса:', err)
      alert('Ошибка сброса: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const getCurrentValue = (text: FinalPageText) => {
    return text.current_value !== null && text.current_value !== undefined 
      ? text.current_value 
      : text.default_value
  }

  return (
    <div className="space-y-4">
      {/* Вкладки */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('simple')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'simple'
              ? 'border-b-2 border-purple-600 text-purple-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Простое поздравление
        </button>
        <button
          onClick={() => setActiveTab('with_stats')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'with_stats'
              ? 'border-b-2 border-purple-600 text-purple-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Поздравление со статистикой
        </button>
      </div>

      {/* Информация о плейсхолдерах */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">Поддерживаемые переменные:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><code className="bg-blue-100 px-1 rounded">gameCode</code> - код игры</li>
              <li><code className="bg-blue-100 px-1 rounded">captainName</code> - имя капитана команды</li>
              <li><code className="bg-blue-100 px-1 rounded">teamId</code> - ID команды</li>
            </ul>
            <p className="mt-2 text-xs">
              Используйте в формате: Текст с переменной captainName и teamId
            </p>
          </div>
        </div>
      </div>

      {/* Список текстов для редактирования */}
      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          <p className="mt-2 text-gray-600">Загрузка...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {texts.map((text) => (
            <div key={text.id} className="bg-gray-50 rounded-lg p-4 border">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <label className="block font-medium text-gray-800 mb-1">
                    {text.description}
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Ключ: <code className="bg-gray-200 px-1 rounded">{text.text_key}</code>
                  </p>
                </div>
              </div>

              <textarea
                value={getCurrentValue(text)}
                onChange={(e) => updateTextValue(text.text_key, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows={text.text_key === 'description' ? 3 : 2}
                placeholder={text.default_value}
              />

              {text.current_value !== null && text.current_value !== text.default_value && (
                <div className="mt-2 text-xs text-gray-500">
                  <p className="font-medium">Значение по умолчанию:</p>
                  <p className="bg-gray-100 p-2 rounded mt-1">{text.default_value}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Кнопки действий */}
      <div className="flex gap-3 pt-4 border-t">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Сохранение...' : 'Сохранить изменения'}
        </button>
        <button
          onClick={handleReset}
          disabled={saving || loading}
          className="flex items-center gap-2 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-5 h-5" />
          Сбросить к значениям по умолчанию
        </button>
      </div>
    </div>
  )
}
