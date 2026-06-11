import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isAdminPanelLoggedIn } from '../lib/adminAuth'
import { uploadQuestionMediaQueued } from '../lib/storageUpload'
import { confirmLargeVideoUpload } from '../lib/compressQuestionMedia'
import { QUESTION_DB_SELECT } from '../lib/prefetchGameQuestions'
import { formatErrorMessage } from '../lib/errorMessage'
import { enqueueCritical } from '../lib/requestQueue'
import { saveQuestionsForGame } from '../lib/saveGameQuestions'
import { generateQuestionsWithAi, type AiQuestionProvider } from '../lib/generateQuestions'
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Upload,
  X,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
} from 'lucide-react'
import {
  createMediaItem,
  inferMediaKind,
  legacyHintArraysFromHints,
  legacyMediaFromItems,
  moveMediaItem,
  normalizeHintsFromRow,
  normalizeMediaItemsFromRow,
  reindexMediaItems,
  removeMediaItemAt,
  type QuestionHint,
  type QuestionMediaItem,
} from '../lib/questionMediaTypes'
import CollapsibleSection from '../components/CollapsibleSection'
import MediaLayoutComposer from '../components/MediaLayoutComposer'
import { canToggleQuestionHidden, type GameStateRow } from '../lib/gameSessionState'
import {
  parseQuestionGradingOverride,
  type AnswerGradingRouting,
  type QuestionGradingOverride,
  type TextMatchMode,
} from '../lib/answerGradingConfig'
import { mergeGameSettings, parseGameSettings } from '../lib/gameSettings'
import {
  DEFAULT_QUESTION_TIME_SEC,
  DEFAULT_TOTAL_TIME_SEC,
  isTotalTimeUnlimited,
  normalizeQuestionTimeSec,
  normalizeTotalTimeSec,
} from '../lib/gameTimeConfig'

interface Question {
  id?: string
  game_id: string
  order_index: number
  type: string
  prompt: string
  media_url: string | null
  media_items: QuestionMediaItem[]
  answer: string[]
  options: string[]
  answer_count: number
  difficulty: string
  base_points: number
  hint_levels: string[]
  hint_penalties: number[]
  hints: QuestionHint[]
  per_question_time_sec: number | null
  grading_override: QuestionGradingOverride | null
  is_hidden: boolean
}

type MediaUploadState = {
  qIndex: number
  hIndex?: number
  pct: number
  label: string
} | null

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
  const [gameSessionState, setGameSessionState] = useState<GameStateRow | null>(null)
  const [mediaUploadState, setMediaUploadState] = useState<MediaUploadState>(null)

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

  const syncQuestionLegacy = (q: Question): Question => {
    const media_items = reindexMediaItems(q.media_items ?? [])
    const legacy = legacyMediaFromItems(media_items)
    const hints = (q.hints ?? []).map((h) => ({
      text: h.text ?? '',
      penalty: typeof h.penalty === 'number' ? h.penalty : 10,
      media_items: reindexMediaItems(h.media_items ?? []),
    }))
    const { hint_levels, hint_penalties } = legacyHintArraysFromHints(hints)
    return {
      ...q,
      media_items,
      hints,
      media_url: legacy.media_url,
      type: legacy.type,
      hint_levels,
      hint_penalties,
    }
  }

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

    const media_items = normalizeMediaItemsFromRow(q)
    const hints = normalizeHintsFromRow(q)
    const legacy = legacyMediaFromItems(media_items)
    const { hint_levels, hint_penalties } = legacyHintArraysFromHints(hints)

    return syncQuestionLegacy({
      id: q.id as string | undefined,
      game_id: (q.game_id as string) || gameId!,
      order_index: (q.order_index as number) ?? (q.question_number as number) ?? 0,
      type: legacy.type,
      prompt: (q.question_text as string) || (q.prompt as string) || '',
      media_url: legacy.media_url,
      media_items,
      answer,
      options: options.length ? options : Array(answerCount).fill(''),
      answer_count: answerCount,
      difficulty: (q.difficulty as string) || 'Средний',
      base_points: (q.points as number) ?? (q.base_points as number) ?? 100,
      hint_levels,
      hint_penalties,
      hints,
      per_question_time_sec: (q.per_question_time_sec as number | null) ?? null,
      grading_override: parseQuestionGradingOverride(q.grading_override),
      is_hidden: Boolean(q.is_hidden),
    })
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

      const { data: sessionRow } = await supabase
        .from('game_state')
        .select('current_state, is_paused, updated_at')
        .eq('game_id', gameId)
        .maybeSingle()
      if (gen !== loadGenRef.current) return
      setGameSessionState(sessionRow as GameStateRow | null)

      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select(QUESTION_DB_SELECT)
        .eq('game_id', gameId)
        .order('order_index', { ascending: true })

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
      const { error } = await enqueueCritical(async () =>
        supabase
          .from('games')
          .update({
            total_time_sec: normalizeTotalTimeSec(game?.total_time_sec),
            per_question_time_sec: normalizeQuestionTimeSec(game?.per_question_time_sec),
            settings: mergeGameSettings(game?.settings, parseGameSettings(game?.settings)),
            scoring: game?.scoring || {
              p_base: 100,
              k_diff: 1.0,
              k_time: 0.5,
              k_skip: 0.8,
              k_fast: 1.2,
              combo_bonus: 10,
            },
          })
          .eq('id', gameId)
      )

      if (error) throw error
      showStatus('Настройки времени сохранены')
    } catch (err: unknown) {
      alert('Ошибка сохранения: ' + formatErrorMessage(err))
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
      const perQuestionTime =
        game?.per_question_time_sec === 0
          ? null
          : (game?.per_question_time_sec ?? DEFAULT_QUESTION_TIME_SEC)

      const mapped: Question[] = drafts.map((d, i) => {
        const hintTexts = d.hint_levels?.length ? d.hint_levels : ['Подсказка']
        const hintPenalties = d.hint_penalties?.length ? d.hint_penalties : [10]
        const hints: QuestionHint[] = hintTexts.map((text, hi) => ({
          text,
          penalty: hintPenalties[hi] ?? 10,
          media_items: [],
        }))
        return syncQuestionLegacy({
          game_id: gameId,
          order_index: baseIndex + i + 1,
          type: d.type || 'text',
          prompt: d.prompt,
          media_url: null,
          media_items: [],
          answer: d.answer ?? [],
          options: d.options ?? [],
          answer_count: d.answer_count > 1 ? d.answer_count : 1,
          difficulty: d.difficulty || aiDifficulty,
          base_points: d.base_points ?? 100,
          hint_levels: hintTexts,
          hint_penalties: hintPenalties,
          hints,
          per_question_time_sec: d.per_question_time_sec ?? perQuestionTime,
          grading_override: null,
          is_hidden: false,
        })
      })

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
      media_items: [],
      answer: [],
      options: [],
      answer_count: 1,
      difficulty: 'Средний',
      base_points: 100,
      hint_levels: [],
      hint_penalties: [],
      hints: [],
      per_question_time_sec: 60,
      grading_override: null,
      is_hidden: false,
    }
    setQuestions([...questions, newQuestion])
  }

  const handleDeleteQuestion = async (index: number) => {
    const question = questions[index]
    if (question.id) {
      try {
        const { error } = await enqueueCritical(async () =>
          supabase.from('questions').delete().eq('id', question.id)
        )

        if (error) throw error
      } catch (err: any) {
        alert('Ошибка удаления: ' + err.message)
        return
      }
    }
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const handleToggleHidden = (index: number) => {
    if (!canToggleQuestionHidden(gameSessionState)) {
      alert('Скрывать и показывать вопросы можно только до старта заезда')
      return
    }
    const question = questions[index]
    if (!question.is_hidden) {
      const visibleCount = questions.filter((q) => !q.is_hidden).length
      if (visibleCount <= 1) {
        alert('Нельзя скрыть последний видимый вопрос')
        return
      }
    }
    setQuestions(
      questions.map((q, i) => (i === index ? { ...q, is_hidden: !q.is_hidden } : q))
    )
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

    const visibleQuestions = questions.filter((q) => !q.is_hidden)
    if (visibleQuestions.length === 0) {
      alert('Должен остаться хотя бы один видимый вопрос')
      return
    }
    if (!visibleQuestions.some((q) => q.prompt?.trim())) {
      alert('Должен быть хотя бы один видимый вопрос с текстом')
      return
    }

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i]
      if (question.is_hidden) continue

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
      setQuestions((merged as Record<string, unknown>[]).map((q) => normalizeQuestion(q)))
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

  const uploadMediaFiles = async (
    qIndex: number,
    files: File[],
    target: 'question' | 'hint',
    hIndex?: number
  ) => {
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

    for (const file of files) {
      if (!confirmLargeVideoUpload(file)) continue

      setMediaUploadState({
        qIndex,
        hIndex: target === 'hint' ? hIndex : undefined,
        pct: 0,
        label: `Загрузка ${file.name}…`,
      })
      try {
        const publicUrl = await uploadQuestionMediaQueued(file, scopedGameId, {
          onCompressProgress: (pct, label) => {
            setMediaUploadState({
              qIndex,
              hIndex: target === 'hint' ? hIndex : undefined,
              pct,
              label,
            })
          },
        })
        const kind = inferMediaKind(file.name, file.type)

        setQuestions((prev) => {
          const next = [...prev]
          const q = { ...next[qIndex] }
          let order = 0
          if (target === 'question') {
            order = (q.media_items ?? []).length
            const item = createMediaItem(kind, publicUrl, order, file.size)
            q.media_items = reindexMediaItems([...(q.media_items ?? []), item])
          } else if (typeof hIndex === 'number') {
            const hints = [...(q.hints ?? [])]
            const hint = { ...hints[hIndex] }
            order = (hint.media_items ?? []).length
            const item = createMediaItem(kind, publicUrl, order, file.size)
            hint.media_items = reindexMediaItems([...(hint.media_items ?? []), item])
            hints[hIndex] = hint
            q.hints = hints
          }
          next[qIndex] = syncQuestionLegacy(q)
          return next
        })
      } catch (err: unknown) {
        console.error('Upload error:', err)
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('size') || msg.includes('больш')) {
          alert(msg || 'Ошибка: файл слишком большой. Фото — до 20 МБ до сжатия (в Storage до 10 МБ); видео — до 500 МБ до сжатия, в Storage — до 100 МБ.')
        } else if (msg.includes('type') || msg.includes('format')) {
          alert('Ошибка: Неподдерживаемый формат файла')
        } else if (msg.includes('network') || msg.includes('fetch')) {
          alert('Ошибка сети: Проверьте подключение к интернету и попробуйте снова')
        } else {
          alert('Ошибка загрузки файла: ' + msg)
        }
        break
      }
    }
    setMediaUploadState(null)
  }

  const removeQuestionMedia = (qIndex: number, mIndex: number) => {
    setQuestions((prev) => {
      const next = [...prev]
      const q = { ...next[qIndex] }
      q.media_items = removeMediaItemAt(q.media_items ?? [], mIndex)
      next[qIndex] = syncQuestionLegacy(q)
      return next
    })
  }

  const moveQuestionMedia = (qIndex: number, mIndex: number, dir: -1 | 1) => {
    setQuestions((prev) => {
      const next = [...prev]
      const q = { ...next[qIndex] }
      q.media_items = moveMediaItem(q.media_items ?? [], mIndex, dir)
      next[qIndex] = syncQuestionLegacy(q)
      return next
    })
  }

  const removeHintMedia = (qIndex: number, hIndex: number, mIndex: number) => {
    setQuestions((prev) => {
      const next = [...prev]
      const q = { ...next[qIndex] }
      const hints = [...(q.hints ?? [])]
      const hint = { ...hints[hIndex] }
      hint.media_items = removeMediaItemAt(hint.media_items ?? [], mIndex)
      hints[hIndex] = hint
      q.hints = hints
      next[qIndex] = syncQuestionLegacy(q)
      return next
    })
  }

  const moveHintMedia = (qIndex: number, hIndex: number, mIndex: number, dir: -1 | 1) => {
    setQuestions((prev) => {
      const next = [...prev]
      const q = { ...next[qIndex] }
      const hints = [...(q.hints ?? [])]
      const hint = { ...hints[hIndex] }
      hint.media_items = moveMediaItem(hint.media_items ?? [], mIndex, dir)
      hints[hIndex] = hint
      q.hints = hints
      next[qIndex] = syncQuestionLegacy(q)
      return next
    })
  }

  const renderMediaItemRow = (
    item: QuestionMediaItem,
    mIndex: number,
    total: number,
    onMoveUp: () => void,
    onMoveDown: () => void,
    onRemove: () => void
  ) => (
    <div
      key={item.id}
      className="flex flex-col sm:flex-row gap-3 p-3 border border-gray-200 rounded-lg bg-white"
    >
      <div className="flex-shrink-0 w-full sm:w-24 h-20 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
        {item.kind === 'image' ? (
          <img src={item.url} alt="" className="max-w-full max-h-full object-contain" />
        ) : item.kind === 'video' ? (
          <video src={item.url} className="max-w-full max-h-full" muted />
        ) : (
          <audio src={item.url} controls className="w-full px-1" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className="inline-block text-xs font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-800 mb-1">
          {item.kind === 'image' ? 'Фото' : item.kind === 'video' ? 'Видео' : 'Аудио'}
        </span>
        <p className="text-xs text-gray-500 truncate" title={item.url}>
          {item.url.length > 60 ? `${item.url.slice(0, 60)}…` : item.url}
        </p>
      </div>
      <div className="flex gap-1 self-start sm:self-center">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={mIndex === 0}
          className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-40"
          title="Выше"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={mIndex >= total - 1}
          className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-40"
          title="Ниже"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="p-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
          title="Удалить"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )

  const patchGradingOverride = (
    index: number,
    patch: Partial<QuestionGradingOverride> | null
  ) => {
    setQuestions((prev) => {
      const next = [...prev]
      const q = next[index]
      if (patch === null) {
        next[index] = { ...q, grading_override: null }
      } else {
        next[index] = {
          ...q,
          grading_override: { ...(q.grading_override ?? {}), ...patch },
        }
      }
      return next
    })
  }

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const newQuestions = [...questions]
    newQuestions[index] = { ...newQuestions[index], [field]: value }
    setQuestions(newQuestions)
  }

  const addHint = (index: number) => {
    setQuestions((prev) => {
      const next = [...prev]
      const q = { ...next[index] }
      q.hints = [...(q.hints ?? []), { text: '', penalty: 10, media_items: [] }]
      next[index] = syncQuestionLegacy(q)
      return next
    })
  }

  const updateHint = (qIndex: number, hIndex: number, value: string) => {
    setQuestions((prev) => {
      const next = [...prev]
      const q = { ...next[qIndex] }
      const hints = [...(q.hints ?? [])]
      hints[hIndex] = { ...hints[hIndex], text: value }
      q.hints = hints
      next[qIndex] = syncQuestionLegacy(q)
      return next
    })
  }

  const updateHintPenalty = (qIndex: number, hIndex: number, value: number) => {
    setQuestions((prev) => {
      const next = [...prev]
      const q = { ...next[qIndex] }
      const hints = [...(q.hints ?? [])]
      hints[hIndex] = { ...hints[hIndex], penalty: value }
      q.hints = hints
      next[qIndex] = syncQuestionLegacy(q)
      return next
    })
  }

  const deleteHint = (qIndex: number, hIndex: number) => {
    setQuestions((prev) => {
      const next = [...prev]
      const q = { ...next[qIndex] }
      q.hints = (q.hints ?? []).filter((_, i) => i !== hIndex)
      next[qIndex] = syncQuestionLegacy(q)
      return next
    })
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

  const gameSettings = parseGameSettings(game?.settings)
  const safeGame = {
    total_time_sec: normalizeTotalTimeSec(game?.total_time_sec),
    per_question_time_sec: normalizeQuestionTimeSec(game?.per_question_time_sec),
    scoring: game?.scoring || {
      p_base: 100,
      k_diff: 1.0,
      k_time: 0.5,
      k_skip: 0.8,
      k_fast: 1.2,
      combo_bonus: 10,
    },
  }

  const visibleInGameCount = questions.filter((q) => !q.is_hidden).length
  const hiddenQuestionCount = questions.filter((q) => q.is_hidden).length
  const toggleHiddenAllowed = canToggleQuestionHidden(gameSessionState)
  const questionsSectionTitle =
    hiddenQuestionCount > 0
      ? `Вопросы (${questions.length} всего — ${visibleInGameCount} в игре, ${hiddenQuestionCount} скрытых)`
      : `Вопросы (${questions.length})`

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
              Сохранить задания
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

        <CollapsibleSection title="Время и таймеры" defaultOpen>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isTotalTimeUnlimited(game?.total_time_sec)}
                  onChange={(e) =>
                    setGame({
                      ...game,
                      total_time_sec: e.target.checked
                        ? 0
                        : normalizeTotalTimeSec(
                            game?.total_time_sec === 0 ? undefined : game?.total_time_sec
                          ),
                    })
                  }
                />
                <span>Без ограничения (общее время)</span>
              </label>
              <label className="block text-sm font-medium">Общее время (секунд)</label>
              <input
                type="number"
                min={1}
                disabled={isTotalTimeUnlimited(game?.total_time_sec)}
                value={
                  isTotalTimeUnlimited(game?.total_time_sec) ? '' : safeGame.total_time_sec
                }
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!Number.isNaN(v) && v > 0) setGame({ ...game, total_time_sec: v })
                }}
                className="w-full px-4 py-2 border rounded-lg disabled:bg-gray-100 disabled:text-gray-500"
                placeholder={String(DEFAULT_TOTAL_TIME_SEC)}
              />
              <div className="space-y-1.5 pt-1">
                <p className="text-xs text-gray-500">Видимость для игроков</p>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={gameSettings.show_total_elapsed !== false}
                    onChange={(e) =>
                      setGame({
                        ...game,
                        settings: mergeGameSettings(game?.settings, {
                          show_total_elapsed: e.target.checked,
                        }),
                      })
                    }
                  />
                  <span>Показывать прошедшее время</span>
                </label>
                <label
                  className={`flex items-center gap-2 text-sm ${
                    isTotalTimeUnlimited(game?.total_time_sec)
                      ? 'text-gray-400'
                      : 'text-gray-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={isTotalTimeUnlimited(game?.total_time_sec)}
                    checked={
                      !isTotalTimeUnlimited(game?.total_time_sec) &&
                      gameSettings.show_total_countdown !== false
                    }
                    onChange={(e) =>
                      setGame({
                        ...game,
                        settings: mergeGameSettings(game?.settings, {
                          show_total_countdown: e.target.checked,
                        }),
                      })
                    }
                  />
                  <span>
                    Показывать обратный отсчёт
                    {isTotalTimeUnlimited(game?.total_time_sec) && (
                      <span className="text-xs"> (недоступно без лимита)</span>
                    )}
                  </span>
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={game?.per_question_time_sec === 0}
                  onChange={(e) =>
                    setGame({
                      ...game,
                      per_question_time_sec: e.target.checked
                        ? 0
                        : normalizeQuestionTimeSec(
                            game?.per_question_time_sec === 0
                              ? undefined
                              : game?.per_question_time_sec
                          ),
                    })
                  }
                />
                <span>Без ограничения (на вопрос)</span>
              </label>
              <label className="block text-sm font-medium">Время на вопрос (секунд)</label>
              <input
                type="number"
                min={1}
                disabled={game?.per_question_time_sec === 0}
                value={game?.per_question_time_sec === 0 ? '' : safeGame.per_question_time_sec}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!Number.isNaN(v) && v > 0)
                    setGame({ ...game, per_question_time_sec: v })
                }}
                className="w-full px-4 py-2 border rounded-lg disabled:bg-gray-100 disabled:text-gray-500"
                placeholder={String(DEFAULT_QUESTION_TIME_SEC)}
              />
              <div className="space-y-1.5 pt-1">
                <p className="text-xs text-gray-500">Видимость для игроков</p>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={gameSettings.show_question_elapsed !== false}
                    onChange={(e) =>
                      setGame({
                        ...game,
                        settings: mergeGameSettings(game?.settings, {
                          show_question_elapsed: e.target.checked,
                        }),
                      })
                    }
                  />
                  <span>Показывать прошедшее время</span>
                </label>
                <label
                  className={`flex items-center gap-2 text-sm ${
                    game?.per_question_time_sec === 0 ? 'text-gray-400' : 'text-gray-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={game?.per_question_time_sec === 0}
                    checked={
                      game?.per_question_time_sec !== 0 &&
                      gameSettings.show_question_countdown !== false
                    }
                    onChange={(e) =>
                      setGame({
                        ...game,
                        settings: mergeGameSettings(game?.settings, {
                          show_question_countdown: e.target.checked,
                        }),
                      })
                    }
                  />
                  <span>
                    Показывать обратный отсчёт
                    {game?.per_question_time_sec === 0 && (
                      <span className="text-xs"> (недоступно без лимита)</span>
                    )}
                  </span>
                </label>
              </div>
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
          title={questionsSectionTitle}
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
              <div key={question.id ?? `draft-${qIndex}`} className={`border rounded-lg overflow-hidden ${question.is_hidden ? 'bg-gray-100 border-dashed opacity-90' : 'bg-gray-50'}`}>
                <div className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => toggleQuestionExpanded(qIndex)}
                    className="flex-1 flex items-center justify-between gap-3 p-3 sm:p-4 text-left hover:bg-gray-100"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold">Вопрос {qIndex + 1}</h3>
                        {question.is_hidden && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                            Скрыт
                          </span>
                        )}
                      </div>
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
                    onClick={() => handleToggleHidden(qIndex)}
                    disabled={!toggleHiddenAllowed}
                    className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 border-l disabled:opacity-40 disabled:cursor-not-allowed"
                    title={
                      toggleHiddenAllowed
                        ? question.is_hidden
                          ? 'Показать в заезде'
                          : 'Скрыть из заезда'
                        : 'Только до старта заезда'
                    }
                  >
                    {question.is_hidden ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
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
                    <label className="block text-sm font-medium mb-2">Медиафайлы</label>
                    {(question.media_items ?? []).length > 0 && (
                      <div className="space-y-2 mb-3">
                        {(question.media_items ?? []).map((item, mIndex) =>
                          renderMediaItemRow(
                            item,
                            mIndex,
                            question.media_items!.length,
                            () => moveQuestionMedia(qIndex, mIndex, -1),
                            () => moveQuestionMedia(qIndex, mIndex, 1),
                            () => removeQuestionMedia(qIndex, mIndex)
                          )
                        )}
                      </div>
                    )}
                    {(question.media_items ?? []).length > 0 && (
                      <MediaLayoutComposer
                        items={question.media_items ?? []}
                        onChange={(media_items) => {
                          const next = [...questions]
                          next[qIndex] = { ...next[qIndex], media_items }
                          setQuestions(next)
                        }}
                      />
                    )}
                    {mediaUploadState?.qIndex === qIndex &&
                      mediaUploadState.hIndex === undefined && (
                        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm text-blue-800 mb-2">{mediaUploadState.label}</p>
                          <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 transition-all duration-300"
                              style={{ width: `${mediaUploadState.pct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    <label className="cursor-pointer">
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-500">
                        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-600">Добавить файлы</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Фото до 20 МБ (сжимается, в Storage до 10 МБ); видео до 500 МБ → 720p (в Storage до 100 МБ); аудио до 10 МБ
                        </p>
                      </div>
                      <input
                        type="file"
                        multiple
                        onChange={(e) => {
                          const files = e.target.files
                          if (files?.length) uploadMediaFiles(qIndex, Array.from(files), 'question')
                          e.target.value = ''
                        }}
                        className="hidden"
                        accept="image/*,video/*,audio/*"
                      />
                    </label>
                  </div>

                  <div className="mb-4 p-4 border border-purple-100 rounded-lg bg-purple-50/40">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!question.grading_override}
                        onChange={(e) => {
                          if (e.target.checked) {
                            patchGradingOverride(qIndex, { text_match: 'strict' })
                          } else {
                            patchGradingOverride(qIndex, null)
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium text-gray-800">
                        Свои правила проверки для этого вопроса
                      </span>
                    </label>
                    {question.grading_override && (
                      <div className="mt-3 ml-6 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Режим текста
                          </label>
                          <select
                            value={question.grading_override.text_match ?? 'strict'}
                            onChange={(e) =>
                              patchGradingOverride(qIndex, {
                                text_match: e.target.value as TextMatchMode,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="strict">Точное</option>
                            <option value="fuzzy">Fuzzy</option>
                            <option value="keywords">Ключевые слова</option>
                            <option value="numeric">Число</option>
                            <option value="regex">Regex</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Маршрутизация
                          </label>
                          <select
                            value={question.grading_override.routing ?? 'auto'}
                            onChange={(e) =>
                              patchGradingOverride(qIndex, {
                                routing: e.target.value as AnswerGradingRouting,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="auto">Авто</option>
                            <option value="hybrid">Гибрид</option>
                            <option value="manual">Только модератор</option>
                          </select>
                        </div>
                        {question.grading_override.text_match === 'regex' && (
                          <>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Regex-паттерн
                              </label>
                              <input
                                type="text"
                                value={question.grading_override.regex?.pattern ?? ''}
                                onChange={(e) =>
                                  patchGradingOverride(qIndex, {
                                    regex: {
                                      pattern: e.target.value,
                                      flags:
                                        question.grading_override?.regex?.flags ?? '',
                                    },
                                  })
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Флаги
                              </label>
                              <input
                                type="text"
                                value={question.grading_override.regex?.flags ?? ''}
                                onChange={(e) =>
                                  patchGradingOverride(qIndex, {
                                    regex: {
                                      pattern:
                                        question.grading_override?.regex?.pattern ?? '',
                                      flags: e.target.value,
                                    },
                                  })
                                }
                                placeholder="i"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                              />
                            </div>
                          </>
                        )}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Штраф пересдачи (%)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={
                              question.grading_override.resubmit?.penalty_percent ?? 0
                            }
                            onChange={(e) => {
                              const pct = Math.max(
                                0,
                                Math.min(100, Number(e.target.value) || 0)
                              )
                              patchGradingOverride(
                                qIndex,
                                pct > 0 ? { resubmit: { penalty_percent: pct } } : { resubmit: undefined }
                              )
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-2 ml-6">
                      Перекрывает настройки игры только для этого вопроса (жюри — только в профиле игры).
                    </p>
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
                    {(question.hints ?? []).map((hint, hIndex) => (
                      <div key={hIndex} className="mb-3 p-4 border border-gray-200 rounded-lg bg-white">
                        <div className="flex flex-col sm:flex-row gap-3 mb-3">
                          <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Текст подсказки {hIndex + 1}
                            </label>
                            <input
                              type="text"
                              value={hint.text}
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
                              value={hint.penalty ?? question.hint_penalties[hIndex] ?? 10}
                              onChange={(e) => updateHintPenalty(qIndex, hIndex, parseInt(e.target.value) || 0)}
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base min-h-[48px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="10"
                              min="1"
                              max="100"
                            />
                          </div>
                        </div>
                        <div className="mb-3">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Медиа подсказки
                          </label>
                          {(hint.media_items ?? []).length > 0 && (
                            <div className="space-y-2 mb-2">
                              {(hint.media_items ?? []).map((item, mIndex) =>
                                renderMediaItemRow(
                                  item,
                                  mIndex,
                                  hint.media_items!.length,
                                  () => moveHintMedia(qIndex, hIndex, mIndex, -1),
                                  () => moveHintMedia(qIndex, hIndex, mIndex, 1),
                                  () => removeHintMedia(qIndex, hIndex, mIndex)
                                )
                              )}
                            </div>
                          )}
                          {(hint.media_items ?? []).length > 0 && (
                            <MediaLayoutComposer
                              items={hint.media_items ?? []}
                              onChange={(media_items) => {
                                const next = [...questions]
                                const hints = [...(next[qIndex].hints ?? [])]
                                hints[hIndex] = { ...hints[hIndex], media_items }
                                next[qIndex] = { ...next[qIndex], hints }
                                setQuestions(next)
                              }}
                            />
                          )}
                          {mediaUploadState?.qIndex === qIndex &&
                            mediaUploadState.hIndex === hIndex && (
                              <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-sm text-blue-800 mb-2">{mediaUploadState.label}</p>
                                <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-600 transition-all duration-300"
                                    style={{ width: `${mediaUploadState.pct}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          <label className="cursor-pointer inline-block">
                            <span className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                              <Upload className="w-4 h-4" />
                              Добавить медиа
                            </span>
                            <input
                              type="file"
                              multiple
                              onChange={(e) => {
                                const files = e.target.files
                                if (files?.length) {
                                  uploadMediaFiles(qIndex, Array.from(files), 'hint', hIndex)
                                }
                                e.target.value = ''
                              }}
                              className="hidden"
                              accept="image/*,video/*,audio/*"
                            />
                          </label>
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
