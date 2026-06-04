import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../contexts/ThemeContext'
import { Clock, HelpCircle, Send, Upload, X, Image, Film, Music } from 'lucide-react'
import NotificationPopup from '../components/NotificationPopup'
import GameStateManager from '../components/GameStateManager'

interface Question {
  id: string
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

export default function GamePlay() {
  const { gameCode } = useParams()
  const navigate = useNavigate()
  const { setTheme, applyThemeToDOM } = useTheme()
  const [game, setGame] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [answerFile, setAnswerFile] = useState<File | null>(null)
  const [answerFilePreview, setAnswerFilePreview] = useState<string | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showHint, setShowHint] = useState(false)
  const [hintLevel, setHintLevel] = useState(0)
  const [currentHintDisplay, setCurrentHintDisplay] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const teamId = localStorage.getItem('team_id')

  useEffect(() => {
    if (!teamId) {
      navigate('/team/register')
      return
    }
    loadGameData()
  }, [gameCode, teamId, navigate])

  useEffect(() => {
    // Очистить предыдущий таймер
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    // Если игра на паузе, не запускать таймер
    if (isPaused) {
      return
    }

    if (timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
    } else if (timeLeft === 0 && questions.length > 0) {
      handleNextQuestion()
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [timeLeft, isPaused])

  // Очистка состояния при смене вопроса
  useEffect(() => {
    setAnswer('')
    setSelectedOptions([])
    setAnswerFile(null)
    setAnswerFilePreview(null)
    setShowHint(false)
    setHintLevel(0)
    setCurrentHintDisplay(0)
  }, [currentQuestionIndex])

  const loadGameData = async () => {
    try {
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('code', gameCode)
        .maybeSingle()

      if (gameError) throw gameError
      if (!gameData) {
        alert('Игра не найдена')
        navigate('/')
        return
      }

      setGame(gameData)

      // Применяем тему игры
      if (gameData.theme) {
        setTheme(gameData.theme)
      }

      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('game_id', gameData.id)
        .order('question_number', { ascending: true })

      if (questionsError) throw questionsError
      // Преобразуем поля БД в поля компонента
      const mappedQuestions = (questionsData || []).map((q: any) => ({
        ...q,
        order_index: q.question_number,
        prompt: q.question_text,
        base_points: q.points
      }))
      setQuestions(mappedQuestions)
      
      if (mappedQuestions && mappedQuestions.length > 0) {
        setTimeLeft(mappedQuestions[0].per_question_time_sec || gameData.per_question_time_sec || 120)
      }
    } catch (err: any) {
      console.error('Ошибка загрузки данных:', err)
      alert('Ошибка: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Расчет общего штрафа за использованные подсказки
  const calculateTotalHintPenalty = (hintsUsed: number, hintPenalties: number[]): number => {
    let total = 0
    for (let i = 0; i < hintsUsed && i < hintPenalties.length; i++) {
      total += hintPenalties[i]
    }
    return total
  }

  const calculateScore = (
    isCorrect: boolean,
    basePoints: number,
    difficulty: string,
    timeTaken: number,
    maxTime: number,
    hintsUsed: number,
    hintPenalties: number[]
  ): number => {
    if (!isCorrect) return 0

    // Множитель сложности
    const difficultyMultiplier = {
      'Легкий': 1.0,
      'Средний': 1.5,
      'Сложный': 2.0,
      'easy': 1.0,
      'medium': 1.5,
      'hard': 2.0
    }[difficulty] || 1.0

    // Базовые очки с учетом сложности
    let score = basePoints * difficultyMultiplier

    // Бонус за скорость: +1 очко за каждые 10 секунд до конца
    const timeLeft = maxTime - timeTaken
    const speedBonus = Math.floor(timeLeft / 10)
    score += speedBonus

    // Штраф за подсказки: суммируем штрафы для каждой использованной подсказки
    let totalHintPenalty = 0
    for (let i = 0; i < hintsUsed && i < hintPenalties.length; i++) {
      totalHintPenalty += hintPenalties[i]
    }
    score = score - totalHintPenalty

    // Минимум 1 очко за правильный ответ
    return Math.max(1, Math.round(score))
  }

  const handleSubmitAnswer = async () => {
    const currentQuestion = questions[currentQuestionIndex]
    const hasTextAnswer = currentQuestion.answer_count === 1 && answer.trim()
    const hasSelectedOptions = currentQuestion.answer_count > 1 && selectedOptions.length > 0
    
    if ((!hasTextAnswer && !hasSelectedOptions && !answerFile) || !teamId) return

    setUploadingFile(true)
    
    try {
      let mediaUrl = null
      
      if (answerFile) {
        try {
          const fileName = `${Date.now()}-${answerFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
          
          // Convert file to base64
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve((reader.result as string).split(',')[1])
            reader.onerror = reject
            reader.readAsDataURL(answerFile)
          })
          
          // Upload using player-upload function
          const { data, error } = await supabase.functions.invoke('player-upload', {
            body: { 
              file: base64, 
              bucket: 'answer-media', 
              fileName: fileName,
              mimeType: answerFile.type
            }
          })
          
          if (error) {
            console.error('Ошибка загрузки файла:', error)
            alert('Предупреждение: Не удалось загрузить файл. Ответ будет сохранен без медиафайла.')
          } else if (data?.url) {
            mediaUrl = data.url
          }
        } catch (err) {
          console.error('Ошибка загрузки файла:', err)
          alert('Предупреждение: Не удалось загрузить файл. Ответ будет сохранен без медиафайла.')
        }
      }

      // Определяем ответ пользователя в зависимости от типа вопроса
      let userAnswerText = ''
      let userAnswers: string[] = []
      
      if (currentQuestion.answer_count === 1) {
        userAnswerText = answer.toLowerCase().trim()
        userAnswers = [answer.trim()]
      } else {
        userAnswerText = selectedOptions.join(', ')
        userAnswers = selectedOptions
      }

      // Проверка правильности ответа
      // Обеспечиваем обратную совместимость с разными форматами данных
      const extractAnswers = (answers: any): string[] => {
        if (!answers) return []
        // Если это массив массивов (новая структура), извлекаем первый элемент
        if (Array.isArray(answers) && answers.length > 0 && Array.isArray(answers[0])) {
          return answers[0].map((a: any) => String(a || '').toLowerCase().trim()).filter(Boolean)
        }
        // Если это обычный массив (старая структура)
        if (Array.isArray(answers)) {
          return answers.map((a: any) => String(a || '').toLowerCase().trim()).filter(Boolean)
        }
        // Если это строка
        return [String(answers || '').toLowerCase().trim()].filter(Boolean)
      }
      
      const correctAnswers = extractAnswers(currentQuestion.answer)
      const userAnswersNormalized = userAnswers.map(a => a.toLowerCase().trim())
      
      let isCorrect = false
      let scoreMultiplier = 0
      
      if (currentQuestion.answer_count === 1) {
        // Для текстового ввода - точное совпадение
        isCorrect = correctAnswers.includes(userAnswerText)
        scoreMultiplier = isCorrect ? 1 : 0
      } else {
        // Для множественного выбора - проверяем совпадение массивов
        const correctSet = new Set(correctAnswers)
        const userSet = new Set(userAnswersNormalized)
        
        // Все выбранные ответы должны быть правильными
        const allCorrect = userAnswersNormalized.every(ans => correctSet.has(ans))
        // Проверяем сколько правильных ответов выбрано
        const correctCount = userAnswersNormalized.filter(ans => correctSet.has(ans)).length
        const totalCorrect = correctAnswers.length
        
        if (allCorrect && correctCount === totalCorrect) {
          // 100% правильно - все правильные ответы выбраны, лишних нет
          isCorrect = true
          scoreMultiplier = 1
        } else if (correctCount > 0 && allCorrect) {
          // Частично правильно - выбраны только правильные, но не все
          isCorrect = true
          scoreMultiplier = 0.5
        } else if (correctCount > 0) {
          // Частично правильно - есть правильные, но есть и неправильные
          isCorrect = true
          scoreMultiplier = 0.3
        } else {
          // Полностью неправильно
          isCorrect = false
          scoreMultiplier = 0
        }
      }

      // Расчет времени и очков
      const maxTime = currentQuestion.per_question_time_sec || game.per_question_time_sec || 120
      const timeTaken = maxTime - timeLeft
      const baseScore = calculateScore(
        true, // передаем true для расчета базовых очков
        currentQuestion.base_points,
        currentQuestion.difficulty,
        timeTaken,
        maxTime,
        hintLevel,
        currentQuestion.hint_penalties || []
      )
      
      // Применяем множитель за правильность
      const score = Math.round(baseScore * scoreMultiplier)

      // Сохранение ответа
      const { error: answerError } = await supabase
        .from('answers')
        .insert({
          team_id: teamId,
          question_id: currentQuestion.id,
          answer_text: userAnswerText,
          media_url: mediaUrl,
          time_taken: timeTaken,
          is_correct: isCorrect,
          score: score
        })

      if (answerError) throw answerError

      // Обновление общего счета команды
      if (isCorrect && score > 0) {
        const { data: teamData, error: teamFetchError } = await supabase
          .from('teams')
          .select('total_score')
          .eq('id', teamId)
          .maybeSingle()

        if (teamFetchError) throw teamFetchError

        const newTotalScore = (teamData?.total_score || 0) + score

        const { error: teamUpdateError } = await supabase
          .from('teams')
          .update({ total_score: newTotalScore })
          .eq('id', teamId)

        if (teamUpdateError) throw teamUpdateError
      }

      handleNextQuestion()
    } catch (err: any) {
      console.error('Ошибка отправки ответа:', err)
      
      if (err.message?.includes('answers')) {
        alert('Ошибка сохранения ответа в базу данных. Попробуйте еще раз или обратитесь к администратору.')
      } else if (err.message?.includes('teams') || err.message?.includes('total_score')) {
        alert('Ошибка обновления счета команды. Ваш ответ сохранен, но очки могут быть обновлены с задержкой.')
      } else {
        alert('Ошибка отправки ответа: ' + err.message + '\n\nПопробуйте еще раз.')
      }
    } finally {
      setUploadingFile(false)
    }
  }

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setAnswer('')
      setSelectedOptions([])
      setAnswerFile(null)
      setAnswerFilePreview(null)
      setShowHint(false)
      setHintLevel(0)
      setCurrentHintDisplay(0)
      const nextQuestion = questions[currentQuestionIndex + 1]
      setTimeLeft(nextQuestion.per_question_time_sec || game.per_question_time_sec || 120)
    } else {
      // Перенаправление в зависимости от настройки финальной страницы
      const finishType = game?.finish_page_type || 'congratulation'
      switch (finishType) {
        case 'congratulation':
          navigate(`/congratulation/${gameCode}`)
          break
        case 'congratulation_stats':
          navigate(`/congratulation-with-stats/${gameCode}`)
          break
        case 'scoreboard':
        default:
          navigate(`/scoreboard/${gameCode}`) // Игроки попадают на чистое табло без админ-функций
          break
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const maxSize = file.type.startsWith('video/') ? 50 * 1024 * 1024 : 
                      file.type.startsWith('audio/') ? 10 * 1024 * 1024 : 
                      5 * 1024 * 1024

      if (file.size > maxSize) {
        alert(`Размер файла не должен превышать ${maxSize / (1024 * 1024)} МБ`)
        return
      }

      setAnswerFile(file)
      
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setAnswerFilePreview(reader.result as string)
        }
        reader.readAsDataURL(file)
      } else {
        setAnswerFilePreview(null)
      }
    }
  }

  const removeFile = () => {
    setAnswerFile(null)
    setAnswerFilePreview(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen theme-background flex items-center justify-center" style={{
        background: 'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)'
      }}>
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen theme-background flex items-center justify-center p-4" style={{
        background: 'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)'
      }}>
        <div className="bg-white rounded-2xl p-8 max-w-md text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Вопросов пока нет</h2>
          <p className="text-gray-600 mb-6">Администратор еще не добавил вопросы для этой игры</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 theme-primary rounded-lg theme-hover-primary"
          >
            Вернуться на главную
          </button>
        </div>
      </div>
    )
  }

  const currentQuestion = questions[currentQuestionIndex]
  const hints = currentQuestion.hint_levels || []
  
  // Извлечение вариантов ответов для отображения
  const extractOptions = (options: any): string[] => {
    if (!options) return []
    // Если это массив массивов (новая структура), извлекаем первый элемент
    if (Array.isArray(options) && options.length > 0 && Array.isArray(options[0])) {
      return options[0].map((o: any) => String(o || '')).filter(Boolean)
    }
    // Если это обычный массив (старая структура)
    if (Array.isArray(options)) {
      return options.map((o: any) => String(o || '')).filter(Boolean)
    }
    return []
  }
  
  const availableOptions = extractOptions(currentQuestion?.options)

  return (
    <div className="min-h-screen theme-background p-4" style={{
      background: 'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)'
    }}>
      <div className="max-w-4xl mx-auto">


        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold truncate">{game?.title}</h2>
                <p className="text-sm sm:text-base text-white/80">
                  Вопрос {currentQuestionIndex + 1} из {questions.length}
                </p>
              </div>
              <div className="text-center sm:text-right flex-shrink-0">
                <div className="flex items-center justify-center sm:justify-end gap-2 text-2xl sm:text-3xl font-bold">
                  <Clock className="w-6 h-6 sm:w-8 sm:h-8" />
                  {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                </div>
                <p className="text-xs sm:text-sm text-white/80">Осталось времени</p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-8">
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-semibold inline-block w-fit">
                  {currentQuestion.difficulty}
                </span>
                <span className="text-gray-600 text-sm sm:text-base">
                  {currentQuestion.base_points} очков
                </span>
              </div>

              <h3 className="text-lg sm:text-2xl font-bold text-gray-800 mb-4 leading-tight">
                {currentQuestion.prompt}
              </h3>

              {currentQuestion.media_url && (
                <div className="mb-6 rounded-lg overflow-hidden">
                  {currentQuestion.type === 'image' && (
                    <img
                      src={currentQuestion.media_url}
                      alt="Question media"
                      className="w-full max-h-96 object-contain"
                    />
                  )}
                  {currentQuestion.type === 'video' && (
                    <video controls className="w-full max-h-96">
                      <source src={currentQuestion.media_url} />
                    </video>
                  )}
                  {currentQuestion.type === 'audio' && (
                    <audio controls className="w-full">
                      <source src={currentQuestion.media_url} />
                    </audio>
                  )}
                </div>
              )}
            </div>

            {showHint && hints.length > 0 && hintLevel > 0 && (
              <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                {/* Заголовок с навигацией */}
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-yellow-800">
                    Подсказки ({currentHintDisplay + 1} из {hintLevel}):
                  </h4>
                  <div className="flex items-center gap-2">
                    {hintLevel > 1 && (
                      <>
                        <button
                          onClick={() => setCurrentHintDisplay(Math.max(0, currentHintDisplay - 1))}
                          disabled={currentHintDisplay === 0}
                          className="px-3 py-1 bg-yellow-200 text-yellow-800 rounded hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          ←
                        </button>
                        <span className="text-sm text-yellow-700 px-2">
                          {currentHintDisplay + 1} / {hintLevel}
                        </span>
                        <button
                          onClick={() => setCurrentHintDisplay(Math.min(hintLevel - 1, currentHintDisplay + 1))}
                          disabled={currentHintDisplay === hintLevel - 1}
                          className="px-3 py-1 bg-yellow-200 text-yellow-800 rounded hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          →
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Текущая подсказка */}
                <div className="mb-4">
                  <p className="text-yellow-900 text-lg">
                    {hints[currentHintDisplay]}
                  </p>
                </div>

                {/* Информация о штрафах и оставшихся подсказках */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-red-600 font-medium">
                    Штраф: {calculateTotalHintPenalty(hintLevel, currentQuestion?.hint_penalties || [])} очков
                  </span>
                  {hintLevel < hints.length && (
                    <span className="text-yellow-700">
                      Осталось подсказок: {hints.length - hintLevel}
                    </span>
                  )}
                </div>

                {/* Быстрая навигация по всем подсказкам */}
                {hintLevel > 1 && (
                  <div className="mt-4 flex flex-wrap gap-1">
                    {Array.from({ length: hintLevel }, (_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentHintDisplay(index)}
                        className={`px-3 py-1 rounded text-xs transition-colors ${
                          index === currentHintDisplay
                            ? 'bg-yellow-500 text-white'
                            : 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300'
                        }`}
                      >
                        {index + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              {currentQuestion.answer_count === 1 ? (
                // Текстовый ввод для вопросов с одним ответом
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Введите ваш ответ..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  rows={4}
                />
              ) : (
                // Варианты ответов для вопросов с несколькими вариантами
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700">Выберите правильные варианты:</p>
                  {availableOptions.length > 0 
                    ? availableOptions.map((option, index) => (
                    <label
                      key={index}
                      className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        selectedOptions.includes(option)
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-300 hover:border-purple-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedOptions.includes(option)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedOptions([...selectedOptions, option])
                          } else {
                            setSelectedOptions(selectedOptions.filter(opt => opt !== option))
                          }
                        }}
                        className="w-5 h-5 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                      />
                      <span className="text-base text-gray-800">{option}</span>
                    </label>
                  ))
                    : <div className="text-red-500">Ошибка: варианты ответов недоступны</div>
                  }
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Прикрепить медиафайл (необязательно)
                </label>
                {answerFile ? (
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {answerFile.type.startsWith('image/') && <Image className="w-6 h-6 text-blue-500" />}
                        {answerFile.type.startsWith('video/') && <Film className="w-6 h-6 text-purple-500" />}
                        {answerFile.type.startsWith('audio/') && <Music className="w-6 h-6 text-green-500" />}
                        <div>
                          <p className="font-medium">{answerFile.name}</p>
                          <p className="text-sm text-gray-600">
                            {(answerFile.size / (1024 * 1024)).toFixed(2)} МБ
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={removeFile}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    {answerFilePreview && (
                      <img
                        src={answerFilePreview}
                        alt="Preview"
                        className="mt-4 max-h-48 rounded-lg"
                      />
                    )}
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-purple-500 transition-colors text-center">
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm sm:text-base text-gray-600">Загрузить файл</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Фото до 5 МБ, видео до 50 МБ, аудио до 10 МБ
                      </p>
                    </div>
                    <input
                      type="file"
                      onChange={handleFileChange}
                      className="hidden"
                      accept="image/*,video/*,audio/*"
                    />
                  </label>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                {hints.length > 0 && (
                  <button
                    onClick={() => {
                      setShowHint(true)
                      if (hintLevel < hints.length) {
                        setHintLevel(prev => prev + 1)
                        // При получении первой подсказки показываем её
                        if (hintLevel === 0) {
                          setCurrentHintDisplay(0)
                        } else {
                          // При получении новой подсказки переключаем на неё
                          setCurrentHintDisplay(hintLevel)
                        }
                      }
                    }}
                    disabled={hintLevel >= hints.length}
                    className="flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                  >
                    <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="hidden sm:inline">
                      {hintLevel === 0 
                        ? `Получить подсказку (штраф - ${currentQuestion?.hint_penalties?.[0] || 10} очков)` 
                        : hintLevel < hints.length 
                          ? `Подсказка ${hintLevel + 1} (штраф - ${currentQuestion?.hint_penalties?.[hintLevel] || 10} очков)` 
                          : 'Все подсказки получены'
                      }
                    </span>
                    <span className="sm:hidden">
                      {hintLevel === 0 
                        ? `Подсказка (штраф - ${currentQuestion?.hint_penalties?.[0] || 10})`
                        : `Подск. ${hintLevel + 1} (штраф - ${currentQuestion?.hint_penalties?.[hintLevel] || 10})`
                      }
                    </span>
                  </button>
                )}
                <button
                  onClick={handleSubmitAnswer}
                  disabled={
                    (currentQuestion.answer_count === 1 && !answer.trim() && !answerFile) ||
                    (currentQuestion.answer_count > 1 && selectedOptions.length === 0 && !answerFile) ||
                    uploadingFile
                  }
                  className="flex-1 flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base min-h-[48px]"
                >
                  <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>{uploadingFile ? 'Отправка...' : 'Отправить ответ'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Компонент управления состоянием игры (пауза) */}
      {game && <GameStateManager gameId={game.id} onPauseChange={setIsPaused} />}

      {/* Компонент уведомлений от админа */}
      {game && <NotificationPopup gameId={game.id} />}
    </div>
  )
}
