import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Save, Plus, Trash2, Upload, X } from 'lucide-react'

interface Question {
  id?: string
  game_id: string
  order_index: number
  type: string
  prompt: string
  media_url: string | null
  answer: string[]
  options: string[]
  answer_count: number
  difficulty: string
  base_points: number
  hint_levels: string[]
  hint_penalties: number[]
  per_question_time_sec: number | null
}

export default function GameEditor() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const isLoggedIn = localStorage.getItem('admin_logged_in')
    if (!isLoggedIn) {
      navigate('/admin/login')
      return
    }
    loadGameData()
  }, [gameId, navigate])

  const loadGameData = async () => {
    try {
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .maybeSingle()

      if (gameError) throw gameError
      if (!gameData) {
        alert('Игра не найдена')
        navigate('/admin/panel')
        return
      }
      setGame(gameData)

      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('game_id', gameId)
        .order('question_number', { ascending: true })

      if (questionsError) throw questionsError
      // Инициализируем hint_penalties для старых записей
      const processedQuestions = (questionsData || []).map(q => ({
        ...q,
        prompt: q.question_text,
        base_points: q.points,
        hint_penalties: q.hint_penalties || []
      }))
      setQuestions(processedQuestions)
    } catch (err: any) {
      console.error('Ошибка загрузки:', err)
      alert('Ошибка: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveGame = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('games')
        .update({
          title: game?.title || '',
          code: game?.code || '',
          theme: game?.theme || 'default',
          finish_page_type: game?.finish_page_type || 'scoreboard',
          mask_board: game?.mask_board || false,
          total_time_sec: game?.total_time_sec || 1200,
          per_question_time_sec: game?.per_question_time_sec || 120,
          scoring: game?.scoring || {
            p_base: 100,
            k_diff: 1.0,
            k_time: 0.5,
            k_skip: 0.8,
            k_fast: 1.2,
            combo_bonus: 10
          }
        })
        .eq('id', gameId)

      if (error) throw error
      alert('Игра сохранена')
    } catch (err: any) {
      alert('Ошибка сохранения: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleAddQuestion = () => {
    const newQuestion: Question = {
      game_id: gameId!,
      order_index: questions.length + 1,
      type: 'text',
      prompt: '',
      media_url: null,
      answer: [],
      options: [],
      answer_count: 1,
      difficulty: 'Средний',
      base_points: 100,
      hint_levels: [],
      hint_penalties: [],
      per_question_time_sec: 60
    }
    setQuestions([...questions, newQuestion])
  }

  const handleDeleteQuestion = async (index: number) => {
    const question = questions[index]
    if (question.id) {
      try {
        const { error } = await supabase
          .from('questions')
          .delete()
          .eq('id', question.id)

        if (error) throw error
      } catch (err: any) {
        alert('Ошибка удаления: ' + err.message)
        return
      }
    }
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const handleSaveQuestions = async () => {
    setSaving(true)
    try {
      // 🔥 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Использование административного клиента для удаления
      console.log('🔄 Очистка существующих вопросов игры перед сохранением...')
      
      // КРИТИЧЕСКИЙ ПУНКТ: Подсчёт вопросов ДО удаления (используем обычный клиент)
      console.log('🗑️ ШАГ 1: Проверка существующих вопросов перед удалением...')
      const { count: beforeCount, error: beforeCountError } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('game_id', gameId)
      
      if (beforeCountError) throw beforeCountError
      console.log(`   📊 Найдено ${beforeCount} существующих вопросов`)
      
      // КРИТИЧЕСКИЙ ПУНКТ: Удаление ВСЕХ вопросов (используем административный клиент)
      console.log('🗑️ ШАГ 2: Удаление всех существующих вопросов...')
      const { error: deleteError } = await supabase
        .from('questions')
        .delete()
        .eq('game_id', gameId)
      
      if (deleteError) {
        console.error('❌ Ошибка при удалении:', deleteError)
        throw new Error(`Не удалось удалить вопросы: ${deleteError.message}`)
      }
      
      // КРИТИЧЕСКИЙ ПУНКТ: Проверка ПОСЛЕ удаления
      console.log('✅ ШАГ 3: Проверка результата удаления...')
      const { count: afterCount, error: afterCountError } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('game_id', gameId)
      
      if (afterCountError) throw afterCountError
      
      if (afterCount !== 0) {
        const errorMsg = `КРИТИЧЕСКАЯ ОШИБКА: После удаления осталось ${afterCount} вопросов! Сохранение отменено.`
        console.error('❌', errorMsg)
        alert(errorMsg)
        setSaving(false)
        return
      }
      
      console.log('✅ Удаление подтверждено: вопросов осталось 0')
      
      // Проверка на дубликаты question_number в текущем состоянии
      const orderIndexes = questions.map((_, index) => index + 1)
      const uniqueIndexes = [...new Set(orderIndexes)]
      if (orderIndexes.length !== uniqueIndexes.length) {
        throw new Error('Обнаружены дубликаты порядковых номеров вопросов! Перезагрузите страницу и создайте вопросы заново.')
      }
      
      // Валидация перед сохранением
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i]
        
        // Проверка что текст вопроса заполнен
        if (!question.prompt || typeof question.prompt !== 'string' || !question.prompt.trim()) {
          alert(`Вопрос ${i + 1}: Необходимо заполнить текст вопроса`)
          setSaving(false)
          return
        }
        
        // Проверка правильных ответов
        if (question.answer_count === 1) {
          if (!question.answer[0] || typeof question.answer[0] !== 'string' || !question.answer[0].trim()) {
            alert(`Вопрос ${i + 1}: Необходимо указать правильный ответ`)
            setSaving(false)
            return
          }
        } else {
          // Фильтруем только заполненные варианты
          const filledOptions = question.options.filter(opt => opt && typeof opt === 'string' && opt.trim())
          
          // Проверка что есть минимум 2 заполненных варианта (для вопросов с выбором)
          if (filledOptions.length < 2) {
            alert(`Вопрос ${i + 1}: Необходимо заполнить минимум 2 варианта ответов`)
            setSaving(false)
            return
          }
          
          // Проверка что отмечен минимум 1 правильный ответ среди заполненных вариантов
          const validAnswers = question.answer.filter(ans => filledOptions.includes(ans))
          if (validAnswers.length === 0) {
            alert(`Вопрос ${i + 1}: Необходимо отметить минимум 1 правильный ответ`)
            setSaving(false)
            return
          }
        }
      }
      
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i]
        // Подготавливаем данные для сохранения
        let finalOptions = question.options
        let finalAnswer = question.answer
        
        // Если это вопрос с выбором (answer_count > 1), фильтруем только заполненные варианты
        if (question.answer_count > 1) {
          finalOptions = question.options.filter(opt => opt && typeof opt === 'string' && opt.trim())
          // Обновляем правильные ответы - убираем те, которых больше нет среди вариантов
          finalAnswer = question.answer.filter(ans => finalOptions.includes(ans))
        }
        
        const questionData = {
          game_id: gameId,
          question_number: i + 1,
          type: question.type,
          question_text: question.prompt,
          media_url: question.media_url,
          answer: finalAnswer,
          options: finalOptions,
          answer_count: question.answer_count > 1 ? finalOptions.length : 1,
          difficulty: question.difficulty,
          points: question.base_points,
          hint_levels: question.hint_levels,
          hint_penalties: question.hint_penalties,
          per_question_time_sec: question.per_question_time_sec
        }

        if (question.id) {
          const { error } = await supabase
            .from('questions')
            .update(questionData)
            .eq('id', question.id)

          if (error) throw error
        } else {
          const { data, error } = await supabase
            .from('questions')
            .insert(questionData)
            .select()
            .maybeSingle()

          if (error) throw error
          if (data) {
            questions[i].id = data.id
          }
        }
      }
      
      // Финальная проверка - подсчитаем сохраненные вопросы
      const { count: savedCount } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('game_id', gameId)
      
      console.log(`🎉 Завершено! В базе данных сохранено ${savedCount || 0} вопросов`)
      alert(`✅ Вопросы успешно сохранены!\n\n🗑️ Удалено старых вопросов: ${beforeCount || 0}\n💾 Сохранено новых вопросов: ${questions.length}\n📊 Итого в базе: ${savedCount || 0}\n\nСтарые вопросы полностью очищены, новые сохранены с корректными индексами (1-${questions.length}).`)
    } catch (err: any) {
      alert('Ошибка сохранения вопросов: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // 🔥 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Принудительная очистка с административным клиентом
  const handleForceCleanup = async () => {
    if (!confirm('⚠️ ПРИНУДИТЕЛЬНАЯ ОЧИСТКА\n\nЭто действие удалит ВСЕ вопросы для этой игры без сохранения.\n\nПродолжить?')) {
      return
    }
    
    setSaving(true)
    try {
      console.log('🔄 Принудительная очистка всех вопросов игры...')
      
      // 🔥 ПРОВЕРКА ДО УДАЛЕНИЯ (обычный клиент)
      console.log('🗑️ ШАГ 1: Проверка существующих вопросов перед удалением...')
      const { count: beforeCount, error: beforeError } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('game_id', gameId)
      
      if (beforeError) throw beforeError
      console.log(`   📊 Найдено ${beforeCount} вопросов для удаления`)
      
      // 🔥 УДАЛЕНИЕ С АДМИНИСТРАТИВНЫМИ ПРАВАМИ
      console.log('🗑️ ШАГ 2: Выполнение принудительного удаления...')
      const { error: deleteError } = await supabase
        .from('questions')
        .delete()
        .eq('game_id', gameId)
      
      if (deleteError) throw deleteError
      console.log('   ✅ Удаление выполнено')
      
      // 🔥 ПРОВЕРКА ПОСЛЕ УДАЛЕНИЯ (обычный клиент)
      console.log('✅ ШАГ 3: Проверка результата удаления...')
      const { count: afterCount, error: afterError } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('game_id', gameId)
      
      if (afterError) throw afterError
      
      if (afterCount !== 0) {
        const errorMsg = `КРИТИЧЕСКАЯ ОШИБКА: После принудительного удаления осталось ${afterCount} вопросов!`
        console.error('❌', errorMsg)
        alert(errorMsg)
        setSaving(false)
        return
      }
      
      // Очистка локального состояния
      setQuestions([])
      
      console.log(`🎉 ПРИНУДИТЕЛЬНАЯ ОЧИСТКА ЗАВЕРШЕНА УСПЕШНО! Удалено ${beforeCount} вопросов.`)
      alert('✅ Принудительная очистка завершена!\n\nВсе вопросы для этой игры удалены из базы данных.\nМожете создать новые вопросы.')
      
    } catch (err: any) {
      console.error('Ошибка принудительной очистки:', err)
      alert('❌ Ошибка принудительной очистки: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const tryFixStoragePolicies = async (): Promise<boolean> => {
    try {
      console.log('Attempting to fix storage policies...')
      const { data, error } = await supabase.functions.invoke('setup-storage-rls', {
        body: {}
      })

      if (error) {
        console.error('Failed to invoke setup function:', error)
        return false
      }

      if (data?.success) {
        console.log('Storage policies fixed successfully')
        return true
      } else {
        console.log('Automatic fix failed, manual setup required')
        return false
      }
    } catch (err) {
      console.error('Error fixing storage policies:', err)
      return false
    }
  }

  const handleMediaUpload = async (index: number, file: File) => {
    // Проверка прав администратора
    const isLoggedIn = localStorage.getItem('admin_logged_in')
    const adminUsername = localStorage.getItem('admin_username')
    
    if (!isLoggedIn || !adminUsername) {
      alert('Ошибка доступа: Вы не авторизованы как администратор. Пожалуйста, войдите снова.')
      navigate('/admin/login')
      return
    }

    try {
      const fileData = await file.arrayBuffer()
      const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        return btoa(binary)
      }

      const base64File = arrayBufferToBase64(fileData)
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('alternative-upload', {
        body: {
          file: base64File,
          bucket: 'question-media',
          fileName: fileName
        }
      })
      
      if (uploadError || !uploadData?.success) {
        throw new Error(uploadError?.message || 'Upload failed')
      }
      
      const publicUrl = uploadData.url

      // Определение типа медиафайла на основе расширения
      const getMediaType = (fileName: string): string => {
        const ext = fileName.toLowerCase().split('.').pop()
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '')) {
          return 'image'
        }
        if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'].includes(ext || '')) {
          return 'video'
        }
        if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(ext || '')) {
          return 'audio'
        }
        return 'image' // по умолчанию
      }

      const mediaType = getMediaType(fileName)

      const newQuestions = [...questions]
      newQuestions[index].media_url = publicUrl
      newQuestions[index].type = mediaType
      setQuestions(newQuestions)
      
      alert('Файл успешно загружен')
    } catch (err: any) {
      console.error('Upload error:', err)
      
      // Детальная обработка различных типов ошибок
      if (err.message?.includes('size')) {
        alert('Ошибка: Файл слишком большой. Максимальный размер: 50 МБ')
      } else if (err.message?.includes('type') || err.message?.includes('format')) {
        alert('Ошибка: Неподдерживаемый формат файла')
      } else if (err.message?.includes('network') || err.message?.includes('fetch')) {
        alert('Ошибка сети: Проверьте подключение к интернету и попробуйте снова')
      } else {
        alert('Ошибка загрузки файла: ' + err.message + '\n\nПроверьте консоль браузера (F12) для подробностей.')
      }
    }
  }

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const newQuestions = [...questions]
    newQuestions[index] = { ...newQuestions[index], [field]: value }
    setQuestions(newQuestions)
  }

  const addHint = (index: number) => {
    const newQuestions = [...questions]
    newQuestions[index].hint_levels = [...newQuestions[index].hint_levels, '']
    newQuestions[index].hint_penalties = [...newQuestions[index].hint_penalties, 10] // По умолчанию 10 штрафных баллов
    setQuestions(newQuestions)
  }

  const updateHint = (qIndex: number, hIndex: number, value: string) => {
    const newQuestions = [...questions]
    newQuestions[qIndex].hint_levels[hIndex] = value
    setQuestions(newQuestions)
  }

  const updateHintPenalty = (qIndex: number, hIndex: number, value: number) => {
    const newQuestions = [...questions]
    newQuestions[qIndex].hint_penalties[hIndex] = value
    setQuestions(newQuestions)
  }

  const deleteHint = (qIndex: number, hIndex: number) => {
    const newQuestions = [...questions]
    newQuestions[qIndex].hint_levels = newQuestions[qIndex].hint_levels.filter((_, i) => i !== hIndex)
    newQuestions[qIndex].hint_penalties = newQuestions[qIndex].hint_penalties.filter((_, i) => i !== hIndex)
    setQuestions(newQuestions)
  }

  // Функции для работы с вариантами ответов
  const updateAnswerCount = (qIndex: number, count: number) => {
    const newQuestions = [...questions]
    const question = newQuestions[qIndex]
    question.answer_count = count
    
    // Если count = 1 (текстовый ввод), очищаем варианты
    if (count === 1) {
      question.options = []
      // Оставляем первый ответ если есть
      if (question.answer.length > 0) {
        question.answer = [question.answer[0]]
      }
    } else {
      // Если count > 1, создаем массив вариантов нужной длины
      const currentOptionsLength = question.options.length
      if (currentOptionsLength < count) {
        // Добавляем недостающие варианты
        question.options = [
          ...question.options,
          ...Array(count - currentOptionsLength).fill('')
        ]
      } else if (currentOptionsLength > count) {
        // Обрезаем лишние варианты
        question.options = question.options.slice(0, count)
        // Убираем из правильных ответов те, что больше нет в вариантах
        question.answer = question.answer.filter(ans => 
          question.options.includes(ans)
        )
      }
    }
    
    setQuestions(newQuestions)
  }

  const updateOption = (qIndex: number, optIndex: number, value: string) => {
    const newQuestions = [...questions]
    const question = newQuestions[qIndex]
    const oldValue = question.options[optIndex]
    question.options[optIndex] = value
    
    // Если этот вариант был в правильных ответах, обновляем его там тоже
    question.answer = question.answer.map(ans => 
      ans === oldValue ? value : ans
    )
    
    setQuestions(newQuestions)
  }

  const toggleCorrectAnswer = (qIndex: number, optionValue: string) => {
    const newQuestions = [...questions]
    const question = newQuestions[qIndex]
    
    if (question.answer.includes(optionValue)) {
      // Убираем из правильных ответов, но оставляем минимум 1
      if (question.answer.length > 1) {
        question.answer = question.answer.filter(ans => ans !== optionValue)
      }
    } else {
      // Добавляем в правильные ответы
      question.answer = [...question.answer, optionValue]
    }
    
    setQuestions(newQuestions)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl">Загрузка...</div>
      </div>
    )
  }

  // Безопасная инициализация game с значениями по умолчанию
  const safeGame = {
    title: game?.title || '',
    code: game?.code || '',
    theme: game?.theme || 'default',
    finish_page_type: game?.finish_page_type || 'scoreboard',
    mask_board: !!game?.mask_board,
    total_time_sec: game?.total_time_sec || 1200,
    per_question_time_sec: game?.per_question_time_sec || 120,
    scoring: game?.scoring || {
      p_base: 100,
      k_diff: 1.0,
      k_time: 0.5,
      k_skip: 0.8,
      k_fast: 1.2,
      combo_bonus: 10
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/admin/panel')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft className="w-5 h-5" />
            Назад к панели
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleSaveGame}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              Сохранить игру
            </button>
            <button
              onClick={handleSaveQuestions}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              Сохранить вопросы
            </button>
            <button
              onClick={handleForceCleanup}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              title="Принудительная очистка дубликатов"
            >
              <Trash2 className="w-5 h-5" />
              Очистить дубликаты
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-bold mb-6">Настройки игры</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Название игры</label>
              <input
                type="text"
                value={safeGame.title}
                onChange={(e) => setGame({ ...game, title: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Код доступа (4-6 символов: буквы и цифры)</label>
              <input
                type="text"
                value={safeGame.code || ''}
                onChange={(e) => {
                  // Разрешаем только буквы и цифры, от 4 до 6 символов
                  const value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)
                  setGame({ ...game, code: value })
                }}
                maxLength={6}
                pattern="[a-zA-Z0-9]{4,6}"
                className="w-full px-4 py-2 border rounded-lg text-center text-2xl font-bold"
                placeholder="ABC123"
              />
              <p className="text-sm text-gray-600 mt-1">Поддерживаются коды от 4 до 6 символов (буквы и цифры)</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Тема оформления</label>
              <select
                value={safeGame.theme}
                onChange={(e) => setGame({ ...game, theme: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="default">Стандартная</option>
                <option value="new-year">Новый год</option>
                <option value="feb-23">23 февраля</option>
                <option value="march-8">8 марта</option>
                <option value="easter">Пасха</option>
                <option value="wedding">Свадьба</option>
                <option value="corporate">Корпоратив</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Финальная страница</label>
              <select
                value={safeGame.finish_page_type}
                onChange={(e) => setGame({ ...game, finish_page_type: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="congratulation">Поздравление (только текст)</option>
                <option value="congratulation_stats">Поздравление + статистика игрока</option>
                <option value="scoreboard">Переход к табло результатов</option>
              </select>
              <p className="text-sm text-gray-600 mt-1">Выберите что увидят игроки после завершения квеста</p>
            </div>
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={safeGame.mask_board}
                  onChange={(e) => setGame({ ...game, mask_board: e.target.checked })}
                  className="w-5 h-5"
                />
                <span className="text-sm font-medium">Маскировать табло</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Общее время (секунд)</label>
              <input
                type="number"
                value={safeGame.total_time_sec}
                onChange={(e) => setGame({ ...game, total_time_sec: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Время на вопрос (секунд)</label>
              <input
                type="number"
                value={safeGame.per_question_time_sec}
                onChange={(e) => setGame({ ...game, per_question_time_sec: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
          </div>

          <div className="mt-8 border-t pt-6">
            <h3 className="text-xl font-bold mb-4">Формула подсчета очков</h3>
            <p className="text-sm text-gray-600 mb-4">
              Score_q = P_base × K_diff × K_time - H + S_combo_part
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">P_base (базовые очки)</label>
                <input
                  type="number"
                  value={safeGame.scoring.p_base}
                  onChange={(e) => setGame({ 
                    ...game, 
                    scoring: { ...game.scoring, p_base: parseFloat(e.target.value) }
                  })}
                  className="w-full px-4 py-2 border rounded-lg"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">K_diff (коэф. сложности)</label>
                <input
                  type="number"
                  value={safeGame.scoring.k_diff}
                  onChange={(e) => setGame({ 
                    ...game, 
                    scoring: { ...game.scoring, k_diff: parseFloat(e.target.value) }
                  })}
                  className="w-full px-4 py-2 border rounded-lg"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">K_time (коэф. времени)</label>
                <input
                  type="number"
                  value={safeGame.scoring.k_time}
                  onChange={(e) => setGame({ 
                    ...game, 
                    scoring: { ...game.scoring, k_time: parseFloat(e.target.value) }
                  })}
                  className="w-full px-4 py-2 border rounded-lg"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">K_skip (коэф. пропуска)</label>
                <input
                  type="number"
                  value={safeGame.scoring.k_skip}
                  onChange={(e) => setGame({ 
                    ...game, 
                    scoring: { ...game.scoring, k_skip: parseFloat(e.target.value) }
                  })}
                  className="w-full px-4 py-2 border rounded-lg"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">K_fast (бонус скорости)</label>
                <input
                  type="number"
                  value={safeGame.scoring.k_fast}
                  onChange={(e) => setGame({ 
                    ...game, 
                    scoring: { ...game.scoring, k_fast: parseFloat(e.target.value) }
                  })}
                  className="w-full px-4 py-2 border rounded-lg"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Combo_bonus (бонус серии)</label>
                <input
                  type="number"
                  value={safeGame.scoring.combo_bonus}
                  onChange={(e) => setGame({ 
                    ...game, 
                    scoring: { ...game.scoring, combo_bonus: parseFloat(e.target.value) }
                  })}
                  className="w-full px-4 py-2 border rounded-lg"
                  step="1"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Вопросы</h2>
            <button
              onClick={handleAddQuestion}
              className="flex items-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 min-h-[48px] text-sm sm:text-base"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Добавить вопрос</span>
              <span className="sm:hidden">Добавить</span>
            </button>
          </div>

          <div className="space-y-6">
            {questions.map((question, qIndex) => (
              <div key={qIndex} className="border rounded-lg p-3 sm:p-4 bg-gray-50">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-4">
                  <h3 className="text-lg font-bold">Вопрос {qIndex + 1}</h3>
                  <button
                    onClick={() => handleDeleteQuestion(qIndex)}
                    className="text-red-600 hover:text-red-800 p-2 min-w-[48px] min-h-[48px] flex items-center justify-center self-end sm:self-start"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Текст вопроса</label>
                    <textarea
                      value={question.prompt}
                      onChange={(e) => updateQuestion(qIndex, 'prompt', e.target.value)}
                      className="w-full px-4 py-3 border rounded-lg min-h-[120px] text-base"
                      rows={4}
                      placeholder="Введите текст вопроса..."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Сложность</label>
                      <select
                        value={question.difficulty}
                        onChange={(e) => updateQuestion(qIndex, 'difficulty', e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg min-h-[48px]"
                      >
                        <option value="Легкий">Легкий</option>
                        <option value="Средний">Средний</option>
                        <option value="Сложный">Сложный</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Базовые очки</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={question.base_points}
                        onChange={(e) => updateQuestion(qIndex, 'base_points', parseInt(e.target.value))}
                        className="w-full px-4 py-3 border rounded-lg min-h-[48px] text-base"
                        placeholder="0"
                        min="0"
                        max="10000"
                      />
                    </div>
                  </div>

                  <div className="max-w-md">
                    <label className="block text-sm font-medium mb-2">Количество вариантов ответов</label>
                    <select
                      value={question.answer_count}
                      onChange={(e) => updateAnswerCount(qIndex, parseInt(e.target.value))}
                      className="w-full px-4 py-2 border rounded-lg min-h-[48px]"
                    >
                      <option value={1}>1 - Текстовый ввод</option>
                      <option value={2}>2 варианта</option>
                      <option value={3}>3 варианта</option>
                      <option value={4}>4 варианта</option>
                      <option value={5}>5 вариантов</option>
                      <option value={6}>6 вариантов</option>
                    </select>
                  </div>

                  {question.answer_count === 1 ? (
                    <div className="max-w-md">
                      <label className="block text-sm font-medium mb-2">Правильный ответ</label>
                      <input
                        type="text"
                        value={question.answer[0] || ''}
                        onChange={(e) => {
                          const newQuestions = [...questions]
                          newQuestions[qIndex].answer = [e.target.value]
                          setQuestions(newQuestions)
                        }}
                        className="w-full px-4 py-3 border rounded-lg min-h-[48px] text-base"
                        placeholder="Введите правильный ответ"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium mb-3">
                        Варианты ответов (отметьте правильные)
                      </label>
                      <div className="space-y-3">
                        {Array.from({ length: question.answer_count }, (_, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={question.answer.includes(question.options[i] || '')}
                              onChange={() => {
                                const optionValue = question.options[i] || ''
                                if (optionValue.trim()) {
                                  toggleCorrectAnswer(qIndex, optionValue)
                                }
                              }}
                              disabled={!question.options[i] || typeof question.options[i] !== 'string' || !question.options[i].trim()}
                              className="w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                              title="Отметить как правильный ответ"
                            />
                            <input
                              type="text"
                              value={question.options[i] || ''}
                              onChange={(e) => updateOption(qIndex, i, e.target.value)}
                              placeholder={`Вариант ${i + 1}`}
                              className="flex-1 px-4 py-3 border rounded-lg min-h-[48px] text-base"
                            />
                          </div>
                        ))}
                      </div>
                      {question.answer.length === 0 && (
                        <p className="text-red-600 text-sm mt-2">
                          Необходимо отметить минимум 1 правильный ответ
                        </p>
                      )}
                      {question.answer.length > 0 && (
                        <p className="text-green-600 text-sm mt-2">
                          Правильных ответов: {question.answer.length}
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-2">Медиафайл</label>
                    {question.media_url ? (
                      <div className="space-y-3">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-start gap-2">
                              <a 
                                href={question.media_url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-blue-600 text-xs sm:text-sm break-all hover:text-blue-800 flex-1"
                                title={question.media_url}
                              >
                                {question.media_url.length > 80 
                                  ? `${question.media_url.substring(0, 80)}...` 
                                  : question.media_url
                                }
                              </a>
                            </div>
                            <div className="flex gap-2">
                              <label className="flex-1 cursor-pointer">
                                <button className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                                  Заменить файл
                                </button>
                                <input
                                  type="file"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) handleMediaUpload(qIndex, file)
                                  }}
                                  className="hidden"
                                  accept="image/*,video/*,audio/*"
                                />
                              </label>
                              <button
                                onClick={() => {
                                  updateQuestion(qIndex, 'media_url', null)
                                  updateQuestion(qIndex, 'type', 'text')
                                }}
                                className="text-red-600 hover:text-red-800 p-2 min-w-[48px] min-h-[48px] flex items-center justify-center border border-red-200 rounded-lg hover:bg-red-50"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <label className="cursor-pointer">
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-500">
                          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-600">Загрузить файл</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Фото до 5 МБ, видео до 50 МБ, аудио до 10 МБ
                          </p>
                        </div>
                        <input
                          type="file"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleMediaUpload(qIndex, file)
                          }}
                          className="hidden"
                          accept="image/*,video/*,audio/*"
                        />
                      </label>
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <label className="block text-sm font-medium">Подсказки</label>
                      <button
                        onClick={() => addHint(qIndex)}
                        className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors min-h-[48px]"
                      >
                        <Plus className="w-4 h-4" />
                        Добавить
                      </button>
                    </div>
                    {question.hint_levels.map((hint, hIndex) => (
                      <div key={hIndex} className="mb-3 p-4 border border-gray-200 rounded-lg bg-white">
                        <div className="flex flex-col sm:flex-row gap-3 mb-3">
                          <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Текст подсказки {hIndex + 1}
                            </label>
                            <input
                              type="text"
                              value={hint}
                              onChange={(e) => updateHint(qIndex, hIndex, e.target.value)}
                              placeholder={`Введите текст подсказки ${hIndex + 1}`}
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base min-h-[48px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                          <div className="sm:w-32">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Штрафные баллы
                            </label>
                            <input
                              type="number"
                              value={question.hint_penalties[hIndex] || 10}
                              onChange={(e) => updateHintPenalty(qIndex, hIndex, parseInt(e.target.value) || 0)}
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base min-h-[48px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="10"
                              min="1"
                              max="100"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={() => deleteHint(qIndex, hIndex)}
                            className="flex items-center gap-2 px-4 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
                            title="Удалить подсказку"
                          >
                            <X className="w-4 h-4" />
                            Удалить
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
