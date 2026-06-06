import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isAdminPanelLoggedIn } from '../lib/adminAuth'
import { uploadQuestionMediaQueued } from '../lib/storageUpload'
import { mergeGameSettings, parseGameSettings } from '../lib/gameSettings'
import { QUESTION_DB_SELECT } from '../lib/prefetchGameQuestions'
import { formatErrorMessage } from '../lib/errorMessage'
import { saveQuestionsForGame } from '../lib/saveGameQuestions'
import { ArrowLeft, Save, Plus, Trash2, Upload, X, Sparkles, ChevronDown } from 'lucide-react'
import { generateQuestionsWithAi, type AiQuestionProvider } from '../lib/generateQuestions'
import CollapsibleSection from '../components/CollapsibleSection'

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
  const loadGenRef = useRef(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aiTopic, setAiTopic] = useState('')
  const [aiCount, setAiCount] = useState(5)
  const [aiProvider, setAiProvider] = useState<AiQuestionProvider>('groq')
  const [aiDifficulty, setAiDifficulty] = useState('Средний')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [expandedQuestions, setExpandedQuestions] = useState<Record<number, boolean>>({})

  const showStatus = (message: string) => {
    setStatusMessage(message)
    window.setTimeout(() => setStatusMessage(null), 4000)
  }

  const isQuestionExpanded = (qIndex: number) =>
    expandedQuestions[qIndex] ?? questions.length <= 2

  const toggleQuestionExpanded = (qIndex: number) => {
    setExpandedQuestions((prev) => ({
      ...prev,
      [qIndex]: !isQuestionExpanded(qIndex),
    }))
  }

  useEffect(() => {
    const isLoggedIn = localStorage.getItem('admin_logged_in')
    if (!isLoggedIn) {
      setLoading(false)
      navigate('/admin/login')
      return
    }
    if (!gameId) {
      setLoading(false)
      navigate('/admin/panel')
      return
    }
    void loadGameData()
  }, [gameId])

  const normalizeQuestion = (q: Record<string, unknown>): Question => {
    let answer: string[] = []
    if (Array.isArray(q.answer)) {
      answer = q.answer.filter((a): a is string => typeof a === 'string')
    } else if (typeof q.correct_answer === 'string' && q.correct_answer) {
      answer = [q.correct_answer]
    }

    let options: string[] = []
    if (Array.isArray(q.options)) {
      options = q.options.map((o) => (typeof o === 'string' ? o : String(o ?? '')))
    }

    const answerCount =
      typeof q.answer_count === 'number' && q.answer_count > 1
        ? q.answer_count
        : answer.length > 1 || options.filter(Boolean).length > 1
          ? Math.max(2, options.length || 2)
          : 1

    return {
      id: q.id as string | undefined,
      game_id: (q.game_id as string) || gameId!,
      order_index: (q.order_index as number) ?? (q.question_number as number) ?? 0,
      type: (q.type as string) || (q.question_type as string) || 'text',
      prompt: (q.question_text as string) || (q.prompt as string) || '',
      media_url: (q.media_url as string | null) ?? null,
      answer,
      options: options.length ? options : Array(answerCount).fill(''),
      answer_count: answerCount,
      difficulty: (q.difficulty as string) || 'Средний',
      base_points: (q.points as number) ?? (q.base_points as number) ?? 100,
      hint_levels: Array.isArray(q.hint_levels) ? (q.hint_levels as string[]) : [],
      hint_penalties: Array.isArray(q.hint_penalties) ? (q.hint_penalties as number[]) : [],
      per_question_time_sec: (q.per_question_time_sec as number | null) ?? null,
    }
  }

  const loadGameData = async () => {
    const gen = ++loadGenRef.current
    setLoading(true)
    try {
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select(
          'id, title, code, theme, finish_page_type, mask_board, settings, total_time_sec, per_question_time_sec, scoring'
        )
        .eq('id', gameId)
        .maybeSingle()

      if (gameError) throw gameError
      if (gen !== loadGenRef.current) return
      if (!gameData) {
        alert('Игра не найдена')
        navigate('/admin/panel')
        return
      }

      const scoring =
        gameData.scoring && typeof gameData.scoring === 'object'
          ? gameData.scoring
          : {
              p_base: 100,
              k_diff: 1.0,
              k_time: 0.5,
              k_skip: 0.8,
              k_fast: 1.2,
              combo_bonus: 10,
            }
      if (gen !== loadGenRef.current) return
      setGame({ ...gameData, scoring })

      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select(QUESTION_DB_SELECT)
        .eq('game_id', gameId)
        .order('question_number', { ascending: true })

      if (questionsError) throw questionsError
      if (gen !== loadGenRef.current) return
      setQuestions((questionsData || []).map((q) => normalizeQuestion(q)))
    } catch (err: unknown) {
      if (gen !== loadGenRef.current) return
      console.error('Ошибка загрузки:', err)
      alert('Ошибка: ' + formatErrorMessage(err))
    } finally {
      if (gen === loadGenRef.current) {
        setLoading(false)
      }
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
          settings: parseGameSettings(game?.settings),
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
      showStatus('Игра сохранена')
    } catch (err: any) {
      alert('Ошибка сохранения: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateAiQuestions = async () => {
    if (!gameId) return
    const topic = aiTopic.trim() || game?.title?.trim() || ''
    if (!topic) {
      alert('Укажите тему или название игры для генерации')
      return
    }

    setAiGenerating(true)
    try {
      const drafts = await generateQuestionsWithAi({
        topic,
        count: aiCount,
        provider: aiProvider,
        difficulty: aiDifficulty,
      })

      const baseIndex = questions.length
      const perQuestionTime = game?.per_question_time_sec ?? 120

      const mapped: Question[] = drafts.map((d, i) => ({
        game_id: gameId,
        order_index: baseIndex + i + 1,
        type: d.type || 'text',
        prompt: d.prompt,
        media_url: null,
        answer: d.answer ?? [],
        options: d.options ?? [],
        answer_count: d.answer_count > 1 ? d.answer_count : 1,
        difficulty: d.difficulty || aiDifficulty,
        base_points: d.base_points ?? 100,
        hint_levels: d.hint_levels?.length ? d.hint_levels : ['Подсказка'],
        hint_penalties: d.hint_penalties?.length ? d.hint_penalties : [10],
        per_question_time_sec: d.per_question_time_sec ?? perQuestionTime,
      }))

      setQuestions([...questions, ...mapped])
      setExpandedQuestions((prev) => {
        const next = { ...prev }
        if (mapped.length > 2) {
          mapped.forEach((_, i) => {
            next[baseIndex + i] = i === 0
          })
        }
        return next
      })
      showStatus(
        `Сгенерировано ${mapped.length} вопросов (${aiProvider === 'groq' ? 'Groq' : aiProvider === 'qwen' ? 'Qwen' : 'DeepSeek'}). Проверьте и сохраните.`
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      alert(
        'AI-генерация не удалась: ' +
          msg +
          '\n\nПроверьте: npm run edge:deploy и секрет GROQ_API_KEY (или другой провайдер) в Supabase Edge Secrets.'
      )
    } finally {
      setAiGenerating(false)
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
    if (!gameId) {
      alert('Игра не выбрана')
      return
    }

    if (questions.length === 0) {
      alert('Добавьте хотя бы один вопрос перед сохранением')
      return
    }

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i]

      if (!question.prompt?.trim()) {
        alert(`Вопрос ${i + 1}: заполните текст вопроса`)
        return
      }

      if (question.answer_count === 1) {
        if (!question.answer?.[0]?.trim()) {
          alert(`Вопрос ${i + 1}: укажите правильный ответ`)
          return
        }
      } else {
        const filledOptions = (question.options ?? []).filter(
          (opt) => opt && typeof opt === 'string' && opt.trim()
        )
        if (filledOptions.length < 2) {
          alert(`Вопрос ${i + 1}: заполните минимум 2 варианта ответа`)
          return
        }
        const validAnswers = (question.answer ?? []).filter((ans) =>
          filledOptions.includes(ans)
        )
        if (validAnswers.length === 0) {
          alert(`Вопрос ${i + 1}: отметьте хотя бы один правильный вариант`)
          return
        }
      }
    }

    setSaving(true)
    try {
      const merged = await saveQuestionsForGame(gameId, questions)
      setQuestions(merged as Question[])
      showStatus(`Вопросы сохранены: ${questions.length}`)
    } catch (err: unknown) {
      console.error('Ошибка сохранения вопросов:', err)
      alert('Ошибка сохранения вопросов: ' + formatErrorMessage(err))
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
    if (!isAdminPanelLoggedIn()) {
      alert('Ошибка доступа: сессия администратора не найдена. Войдите снова.')
      navigate('/admin/login')
      return
    }

    const scopedGameId = gameId || game?.id
    if (!scopedGameId) {
      alert('Сначала сохраните игру — не задан идентификатор.')
      return
    }

    try {
      const publicUrl = await uploadQuestionMediaQueued(file, scopedGameId)

      const getMediaType = (name: string): string => {
        const ext = name.toLowerCase().split('.').pop()
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '')) {
          return 'image'
        }
        if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'].includes(ext || '')) {
          return 'video'
        }
        if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(ext || '')) {
          return 'audio'
        }
        return 'image'
      }

      const mediaType = getMediaType(file.name)

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
    hide_scoreboard_until_finish: parseGameSettings(game?.settings)
      .hide_scoreboard_until_finish,
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
          <div className="flex items-center gap-3">
            {statusMessage && (
              <span className="text-sm text-green-700 hidden sm:inline">{statusMessage}</span>
            )}
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

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {statusMessage && (
          <p className="text-sm text-green-700 sm:hidden">{statusMessage}</p>
        )}

        <CollapsibleSection title="Настройки игры" defaultOpen>
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
                <span className="text-sm font-medium">Маскировать табло (скрыть имена на экране)</span>
              </label>
            </div>
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={safeGame.hide_scoreboard_until_finish}
                  onChange={(e) =>
                    setGame({
                      ...game,
                      settings: mergeGameSettings(game?.settings, {
                        hide_scoreboard_until_finish: e.target.checked,
                      }),
                    })
                  }
                  className="w-5 h-5"
                />
                <span className="text-sm font-medium">Скрыть табло до финиша</span>
              </label>
              <p className="text-sm text-gray-600 mt-1 ml-7">
                Игроки не смогут открыть табло результатов, пока ведущий не завершит игру
              </p>
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
        </CollapsibleSection>

        <CollapsibleSection title="Формула подсчёта очков" defaultOpen={false}>
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
                    scoring: { ...safeGame.scoring, p_base: parseFloat(e.target.value) }
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
                    scoring: { ...safeGame.scoring, k_diff: parseFloat(e.target.value) }
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
                    scoring: { ...safeGame.scoring, k_time: parseFloat(e.target.value) }
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
                    scoring: { ...safeGame.scoring, k_skip: parseFloat(e.target.value) }
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
                    scoring: { ...safeGame.scoring, k_fast: parseFloat(e.target.value) }
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
                    scoring: { ...safeGame.scoring, combo_bonus: parseFloat(e.target.value) }
                  })}
                  className="w-full px-4 py-2 border rounded-lg"
                  step="1"
                />
              </div>
            </div>
        </CollapsibleSection>

        <CollapsibleSection
          title={`Вопросы (${questions.length})`}
          defaultOpen={questions.length > 0}
        >
          <div className="flex justify-end mb-4">
            <button
              onClick={handleAddQuestion}
              className="flex items-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 min-h-[48px] text-sm sm:text-base"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Добавить вопрос</span>
              <span className="sm:hidden">Добавить</span>
            </button>
          </div>

          <div className="mb-6 p-4 border border-violet-200 rounded-lg bg-violet-50">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-violet-600" />
              <h3 className="font-semibold text-violet-900">AI-генерация (Groq / Qwen / DeepSeek)</h3>
            </div>
            <p className="text-sm text-violet-800 mb-4">
              Вопросы добавляются в список ниже — проверьте и нажмите «Сохранить вопросы». Ключи API
              только в Supabase Edge secrets.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">Тема</label>
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder={game?.title ? `По умолчанию: «${game.title}»` : 'Например: История России'}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Количество</label>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={aiCount}
                  onChange={(e) => setAiCount(Math.min(15, Math.max(1, parseInt(e.target.value, 10) || 5)))}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Сложность</label>
                <select
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                >
                  <option value="Легкий">Легкий</option>
                  <option value="Средний">Средний</option>
                  <option value="Сложный">Сложный</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Провайдер</label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as AiQuestionProvider)}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                >
                  <option value="groq">Groq (бесплатно)</option>
                  <option value="qwen">Qwen (DashScope)</option>
                  <option value="deepseek">DeepSeek</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGenerateAiQuestions}
              disabled={aiGenerating || saving}
              className="flex items-center gap-2 px-4 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 min-h-[48px]"
            >
              <Sparkles className="w-5 h-5" />
              {aiGenerating ? 'Генерация…' : 'Сгенерировать вопросы'}
            </button>
          </div>

          <div className="space-y-3">
            {questions.map((question, qIndex) => {
              const expanded = isQuestionExpanded(qIndex)
              return (
              <div key={question.id ?? `draft-${qIndex}`} className="border rounded-lg bg-gray-50 overflow-hidden">
                <div className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => toggleQuestionExpanded(qIndex)}
                    className="flex-1 flex items-center justify-between gap-3 p-3 sm:p-4 text-left hover:bg-gray-100"
                  >
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold">Вопрос {qIndex + 1}</h3>
                      {!expanded && (
                        <p className="text-sm text-gray-600 truncate mt-1">
                          {question.prompt?.trim() || 'Текст не задан'}
                        </p>
                      )}
                    </div>
                    <ChevronDown
                      className={`w-5 h-5 shrink-0 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(qIndex)}
                    className="text-red-600 hover:text-red-800 hover:bg-red-50 px-3 border-l"
                    title="Удалить вопрос"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                {expanded && (
                <div className="grid gap-4 p-3 sm:p-4 border-t">
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
                )}
              </div>
            )})}
          </div>
        </CollapsibleSection>
      </div>
    </div>
  )
}
