import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Trophy, Medal, Award, ArrowLeft, Download, FileText, FileSpreadsheet, BarChart3 } from 'lucide-react'
import { exportToExcel, exportToPDF, exportToCSV, exportAllFormats } from '../utils/exportData'

interface TeamScore {
  id: string
  team_name: string
  captain_name: string
  avatar_url: string | null
  total_score: number
  registration_time: string
}

interface QuestionResult {
  question_id: string
  question_text: string
  question_number: number
  is_correct: boolean
  score: number
  time_taken: number
  answer_text: string
  hints_used: number
}

interface TeamDetails {
  total_time: number
  correct_answers: number
  total_questions: number
  hint_penalties: number
  questions: QuestionResult[]
}

export default function ScoreboardDetailed() {
  const { gameCode } = useParams()
  const navigate = useNavigate()
  const [teams, setTeams] = useState<TeamScore[]>([])
  const [game, setGame] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [teamDetails, setTeamDetails] = useState<{[teamId: string]: TeamDetails}>({})
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [selectedQuestion, setSelectedQuestion] = useState<{
    team: TeamScore
    result: QuestionResult
    question: any
  } | null>(null)
  const loadSeqRef = useRef(0)
  const inFlightRef = useRef(false)
  const cachedGameIdRef = useRef<string | null>(null)
  const cachedQuestionsRef = useRef<any[]>([])

  useEffect(() => {
    const adminLoggedIn = localStorage.getItem('admin_logged_in')
    setIsAdmin(!!adminLoggedIn)
  }, [])

  const buildTeamDetails = (
    teamsData: TeamScore[],
    questionsData: any[],
    answersData: Array<{
      team_id: string
      question_id: string
      is_correct: boolean | null
      score: number | null
      time_taken: number | null
      answer_text: string | null
      hints_used: unknown
    }>
  ) => {
    const details: { [teamId: string]: TeamDetails } = {}

    for (const team of teamsData) {
      const teamAnswers = answersData.filter((answer) => answer.team_id === team.id)
      const questionsResults: QuestionResult[] = []
      let totalTime = 0
      let correctAnswers = 0
      let hintPenalties = 0

      for (const question of questionsData) {
        const answer = teamAnswers.find((a) => a.question_id === question.id)

        if (answer) {
          const hintsUsed = Array.isArray(answer.hints_used) ? answer.hints_used.length : 0
          const hintPenalty = hintsUsed * 10

          questionsResults.push({
            question_id: question.id,
            question_text: question.prompt,
            question_number: question.order_index,
            is_correct: answer.is_correct || false,
            score: answer.score || 0,
            time_taken: answer.time_taken || 0,
            answer_text: answer.answer_text || '',
            hints_used: hintsUsed,
          })

          totalTime += answer.time_taken || 0
          if (answer.is_correct) correctAnswers++
          hintPenalties += hintPenalty
        } else {
          questionsResults.push({
            question_id: question.id,
            question_text: question.prompt,
            question_number: question.order_index,
            is_correct: false,
            score: 0,
            time_taken: 0,
            answer_text: 'Не отвечено',
            hints_used: 0,
          })
        }
      }

      details[team.id] = {
        total_time: totalTime,
        correct_answers: correctAnswers,
        total_questions: questionsData.length,
        hint_penalties: hintPenalties,
        questions: questionsResults,
      }
    }

    return details
  }

  const loadData = useCallback(
    async (options?: { refreshOnly?: boolean }) => {
      if (!gameCode || inFlightRef.current) return

      const refreshOnly = options?.refreshOnly ?? false
      const seq = ++loadSeqRef.current
      inFlightRef.current = true

      if (!refreshOnly) {
        setLoading(true)
      }

      try {
        let gameId = cachedGameIdRef.current
        let questionsData = cachedQuestionsRef.current

        if (!refreshOnly || !gameId) {
          const { data: gameData, error: gameError } = await supabase
            .from('games')
            .select('id, code, title, mask_board')
            .eq('code', gameCode)
            .maybeSingle()

          if (gameError) throw gameError
          if (!gameData || seq !== loadSeqRef.current) return

          gameId = gameData.id
          cachedGameIdRef.current = gameId
          setGame(gameData)

          const questionsRes = await supabase
            .from('questions')
            .select('id, order_index, prompt, question_text')
            .eq('game_id', gameId)
            .order('order_index', { ascending: true })

          if (questionsRes.error) throw questionsRes.error
          if (seq !== loadSeqRef.current) return

          questionsData = questionsRes.data ?? []
          cachedQuestionsRef.current = questionsData
          setQuestions(questionsData)
        }

        if (!gameId) return

        const teamsRes = await supabase
          .from('teams')
          .select('id, team_name, captain_name, avatar_url, total_score, registration_time')
          .eq('game_id', gameId)
          .order('total_score', { ascending: false })

        if (teamsRes.error) throw teamsRes.error
        if (seq !== loadSeqRef.current) return

        const teamsData = teamsRes.data ?? []
        setTeams(teamsData)

        const answersRes = await supabase
          .from('answers')
          .select('team_id, question_id, is_correct, score, time_taken, answer_text, hints_used')
          .eq('game_id', gameId)

        if (answersRes.error) throw answersRes.error
        if (seq !== loadSeqRef.current) return

        setTeamDetails(buildTeamDetails(teamsData, questionsData, answersRes.data ?? []))
      } catch (err: unknown) {
        if (seq === loadSeqRef.current) {
          console.error('Ошибка загрузки табло:', err)
        }
      } finally {
        inFlightRef.current = false
        if (seq === loadSeqRef.current) {
          setLoading(false)
        }
      }
    },
    [gameCode]
  )

  useEffect(() => {
    if (!gameCode) return

    cachedGameIdRef.current = null
    cachedQuestionsRef.current = []
    void loadData({ refreshOnly: false })

    const interval = setInterval(() => {
      if (document.hidden) return
      void loadData({ refreshOnly: true })
    }, 10_000)

    return () => {
      clearInterval(interval)
      loadSeqRef.current++
    }
  }, [gameCode, loadData])

  const getMedalIcon = (position: number) => {
    if (position === 0) return <Trophy className="w-8 h-8 text-yellow-500" />
    if (position === 1) return <Medal className="w-8 h-8 text-gray-400" />
    if (position === 2) return <Award className="w-8 h-8 text-amber-700" />
    return null
  }

  const handleExport = async (format: 'excel' | 'pdf' | 'csv' | 'all') => {
    if (!game) return
    
    setExporting(true)
    setShowExportMenu(false)
    
    try {
      switch (format) {
        case 'excel':
          await exportToExcel(game.id, game.title)
          break
        case 'pdf':
          await exportToPDF(game.id, game.title)
          break
        case 'csv':
          await exportToCSV(game.id, game.title)
          break
        case 'all':
          await exportAllFormats(game.id, game.title)
          break
      }
      alert('Экспорт завершен успешно')
    } catch (error) {
      console.error('Ошибка экспорта:', error)
      alert('Ошибка при экспорте данных')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
        <div className="text-white text-xl">Загрузка табло...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-pink-600 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          {isAdmin && (
            <button
              onClick={() => navigate('/admin/panel')}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
              В панель администратора
            </button>
          )}

          <h1 className="text-3xl font-bold text-white">Детализированное табло результатов</h1>

          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={exporting}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-all disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              {exporting ? 'Экспорт...' : 'Экспорт'}
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-2 bg-white rounded-lg shadow-lg z-10 min-w-[200px]">
                <button
                  onClick={() => handleExport('excel')}
                  className="flex items-center gap-2 w-full px-4 py-3 hover:bg-gray-50 text-gray-800 transition-all"
                >
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  Excel
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  className="flex items-center gap-2 w-full px-4 py-3 hover:bg-gray-50 text-gray-800 transition-all"
                >
                  <FileText className="w-4 h-4 text-red-600" />
                  PDF
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="flex items-center gap-2 w-full px-4 py-3 hover:bg-gray-50 text-gray-800 transition-all"
                >
                  <FileText className="w-4 h-4 text-blue-600" />
                  CSV
                </button>
                <button
                  onClick={() => handleExport('all')}
                  className="flex items-center gap-2 w-full px-4 py-3 hover:bg-gray-50 text-gray-800 transition-all border-t"
                >
                  <Download className="w-4 h-4 text-purple-600" />
                  Все форматы
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">
              {game?.title || 'Загрузка...'}
            </h2>
            <p className="text-white/80">
              Код игры: {gameCode} • {teams.length} команд участвует
            </p>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-2 text-sm text-white/80">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span>Правильно</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-white/80">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span>Неправильно</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-white/80">
                <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                <span>Не отвечено</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-white/80">
                <div className="w-3 h-3 bg-yellow-400 rounded-full relative">
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full"></div>
                </div>
                <span>С подсказками</span>
              </div>
            </div>
          </div>

          <div className="p-6">
            {teams.length === 0 ? (
              <div className="text-center py-12">
                <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">Пока нет зарегистрированных команд</p>
              </div>
            ) : (
              <div className="space-y-6">
                {teams.map((team, index) => (
                  <div
                    key={team.id}
                    className={`rounded-xl p-6 transition-all ${
                      index === 0
                        ? 'bg-gradient-to-r from-yellow-100 to-yellow-50 border-2 border-yellow-400 shadow-lg scale-105'
                        : index === 1
                        ? 'bg-gradient-to-r from-gray-100 to-gray-50 border-2 border-gray-400'
                        : index === 2
                        ? 'bg-gradient-to-r from-orange-100 to-orange-50 border-2 border-orange-400'
                        : 'bg-white border-2 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-6 mb-4">
                      <div className="flex-shrink-0 w-16 text-center">
                        {getMedalIcon(index) || (
                          <span className="text-3xl font-bold text-gray-500">
                            {index + 1}
                          </span>
                        )}
                      </div>

                      {team.avatar_url && !game?.mask_board && (
                        <img
                          src={team.avatar_url}
                          alt={team.team_name}
                          className="w-16 h-16 rounded-full object-cover border-4 border-white shadow-md"
                        />
                      )}

                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <h3 className="text-2xl font-bold text-gray-800">
                            {game?.mask_board ? '***' : team.team_name}
                          </h3>
                          {index < 3 && (
                            <div className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                              Топ {index + 1}
                            </div>
                          )}
                        </div>
                        <p className="text-gray-600 mb-3">
                          Капитан: {game?.mask_board ? '***' : team.captain_name}
                        </p>
                        
                        {/* Детальная статистика */}
                        {teamDetails[team.id] && (
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div className="bg-blue-50 p-3 rounded-lg">
                              <div className="text-blue-600 font-semibold">Время</div>
                              <div className="text-blue-800 font-bold">
                                {Math.floor(teamDetails[team.id].total_time / 60)}:
                                {(teamDetails[team.id].total_time % 60).toString().padStart(2, '0')}
                              </div>
                            </div>
                            <div className="bg-green-50 p-3 rounded-lg">
                              <div className="text-green-600 font-semibold">Правильных</div>
                              <div className="text-green-800 font-bold">
                                {teamDetails[team.id].correct_answers}/{teamDetails[team.id].total_questions}
                              </div>
                            </div>
                            <div className="bg-orange-50 p-3 rounded-lg">
                              <div className="text-orange-600 font-semibold">Штраф за подсказки</div>
                              <div className="text-orange-800 font-bold">
                                -{teamDetails[team.id].hint_penalties}%
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="text-right">
                        <div className="text-4xl font-bold text-purple-600">
                          {team.total_score}
                        </div>
                        <p className="text-sm text-gray-600">очков</p>
                      </div>
                    </div>

                    {/* Визуализация результатов по вопросам */}
                    {teamDetails[team.id] && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-600">Результаты по вопросам:</span>
                          <span className="text-xs text-gray-500">
                            {teamDetails[team.id].correct_answers} из {teamDetails[team.id].total_questions} правильных
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {teamDetails[team.id].questions.map((result, qIndex) => (
                            <button
                              key={result.question_id}
                              onClick={() => setSelectedQuestion({ 
                                team, 
                                result, 
                                question: questions.find(q => q.id === result.question_id) 
                              })}
                              className={`
                                relative w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold
                                transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-purple-400
                                ${result.is_correct 
                                  ? 'bg-green-500 border-green-600 text-white hover:bg-green-600' 
                                  : result.answer_text === 'Не отвечено'
                                  ? 'bg-gray-300 border-gray-400 text-gray-600'
                                  : 'bg-red-500 border-red-600 text-white hover:bg-red-600'
                                }
                              `}
                              title={`Вопрос ${result.question_number}: ${result.is_correct ? 'Правильно' : 'Неправильно'} (${result.score} очков)`}
                            >
                              {result.question_number}
                              {result.hints_used > 0 && (
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full text-xs flex items-center justify-center">
                                  {result.hints_used}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 text-center">
            <p className="text-white/80 text-sm">
              Обновляется автоматически каждые 5 секунд
            </p>
          </div>
        </div>
      </div>

      {/* Модальное окно с деталями вопроса */}
      {selectedQuestion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-800">
                  Вопрос {selectedQuestion.result.question_number}
                </h3>
                <button
                  onClick={() => setSelectedQuestion(null)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-700 mb-2">Вопрос:</h4>
                  <p className="text-gray-800">{selectedQuestion.result.question_text}</p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-700 mb-2">Ответ команды "{selectedQuestion.team.team_name}":</h4>
                  <p className="text-gray-800">
                    {selectedQuestion.result.answer_text || 'Не отвечено'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-700 mb-1">Результат:</h4>
                    <div className={`text-lg font-bold ${selectedQuestion.result.is_correct ? 'text-green-600' : 'text-red-600'}`}>
                      {selectedQuestion.result.is_correct ? '✓ Правильно' : '✗ Неправильно'}
                    </div>
                  </div>

                  <div className="bg-purple-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-purple-700 mb-1">Очки:</h4>
                    <div className="text-lg font-bold text-purple-600">
                      {selectedQuestion.result.score} / {selectedQuestion.question?.base_points || 0}
                    </div>
                  </div>

                  <div className="bg-orange-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-orange-700 mb-1">Время:</h4>
                    <div className="text-lg font-bold text-orange-600">
                      {selectedQuestion.result.time_taken} сек
                    </div>
                  </div>

                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-yellow-700 mb-1">Подсказки:</h4>
                    <div className="text-lg font-bold text-yellow-600">
                      {selectedQuestion.result.hints_used} 
                      {selectedQuestion.result.hints_used > 0 && (
                        <span className="text-sm">(-{selectedQuestion.result.hints_used * 10}% штраф)</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}