import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { uploadAnswerMediaQueued, cancelActiveStorageUpload } from '../lib/storageUpload'
import { applyOptimisticTeamScoreBump, syncPlayerTeamScoreFromServer } from '../lib/teamScore'
import { normalizeUserAnswers } from '../lib/answerGrading'
import { enqueueSubmitAutoAnswer } from '../lib/submitAutoAnswer'
import { postponeAvatarUntilAfterAnswer, flushPendingAvatarWhenIdle } from '../lib/pendingAvatar'
import { attachGameRealtime } from '../lib/gameRealtime'
import { recoverTeamSessionIfNeeded, ensureTeamSessionToken, isTransientNetworkError } from '../lib/teamRegister'
import { getTeamSessionToken } from '../lib/teamSession'
import {
  readStoredTeamIdForGame,
  readStoredCurrentTeam,
  writeStoredCurrentTeam,
} from '../lib/playerSession'
import { agentDebugLog, debugLog } from '../lib/debugLog'
import { getGamePlayCache, isGamePlayCacheFresh, setGamePlayCache, gamePlayCacheNeedsFullQuestions } from '../lib/gamePlayCache'
import {
  buildFinishNavigateState,
  navigateToFinish,
} from '../lib/finishNavigation'
import { enqueuePendingAnswer, startPendingAnswerFlushLoop } from '../lib/pendingAnswerQueue'
import { mapQuestionsForPlay, prefetchQuestionsForGame, fetchQuestionsFullForGame } from '../lib/prefetchGameQuestions'
import { markPlayerFetchBoost } from '../lib/playerFetchBoost'
import {
  revalidateGamePlayCritical,
  revalidateQuestionsForGameCritical,
  mapRevalidatedQuestions,
  pauseBackgroundRevalidate,
  resumeBackgroundRevalidate,
  isBackgroundRevalidatePaused,
} from '../lib/revalidateGamePlay'
import { markTeamFinished } from '../lib/markTeamFinished'
import { enqueueCritical } from '../lib/requestQueue'
import { usePlayerExtrasReady } from '../lib/usePlayerExtrasReady'
import { useTheme } from '../contexts/ThemeContext'
import { Clock, HelpCircle, Send, Upload, X, Image, Film, Music } from 'lucide-react'
import NotificationPopup from '../components/NotificationPopup'
import GameStateManager, { type GameSessionSnapshot } from '../components/GameStateManager'
import GameLobby from '../components/GameLobby'
import AccessDeniedScreen from '../components/AccessDeniedScreen'
import {
  getPlayAccessDenial,
  PLAY_MESSAGES,
  readStoredPlayerSession,
  isTeamStillRegistered,
} from '../lib/participantAccess'
import {
  effectiveQuestionTimeSec,
  formatCountdownMmSs,
  showQuestionTimer,
} from '../lib/gameTimeConfig'

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

const loadGameDataInflight = new Map<string, Promise<void>>()

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
  const [elapsedSec, setElapsedSec] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showHint, setShowHint] = useState(false)
  const [hintLevel, setHintLevel] = useState(0)
  const [currentHintDisplay, setCurrentHintDisplay] = useState(0)
  const [sessionKnown, setSessionKnown] = useState(false)
  const [inLobby, setInLobby] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [isClosed, setIsClosed] = useState(false)
  const [accessDenied, setAccessDenied] = useState<string | null>(null)
  const [accessDeniedRetryable, setAccessDeniedRetryable] = useState(false)
  const [playAccessPending, setPlayAccessPending] = useState(false)
  const [accessCheckNonce, setAccessCheckNonce] = useState(0)
  const [sessionUnknown, setSessionUnknown] = useState(true)
  const [pendingReviewNotice, setPendingReviewNotice] = useState<string | null>(
    null
  )
  useEffect(() => {
    startPendingAnswerFlushLoop()
    markPlayerFetchBoost()
  }, [])

  useEffect(() => {
    if (!loading) return
    const started = Date.now()
    agentDebugLog('GamePlay.tsx', 'ui.loading start', { gameCode }, 'H10')
    return () => {
      agentDebugLog(
        'GamePlay.tsx',
        'ui.loading end',
        { gameCode, durationMs: Date.now() - started },
        'H10'
      )
    }
  }, [loading, gameCode])

  useEffect(() => {
    agentDebugLog(
      'GamePlay.tsx',
      'waitingForSession',
      { sessionUnknown, sessionKnown, inLobby },
      'H7'
    )
  }, [sessionUnknown, sessionKnown, inLobby])

  const handleSessionChange = useCallback((session: GameSessionSnapshot) => {
    // #region agent log
    agentDebugLog('GamePlay.tsx', 'session change', { ...session }, 'H7')
    // #endregion
    setSessionUnknown(session.sessionUnknown)
    setSessionKnown(!session.sessionUnknown)
    setInLobby(session.inLobby)
    setIsPaused(session.isPaused)
    setIsFinished(session.isFinished)
    setIsClosed(session.isClosed)
  }, [])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  /** true после хотя бы одного тика от положительного timeLeft — иначе 0 не триггерит skip. */
  const timerArmedRef = useRef(false)
  const questionStartedAtRef = useRef(Date.now())
  /** Блокирует двойной advance: таймер vs submit (IMP-LOG-018 / M2). */
  const advancingRef = useRef(false)
  const isSubmittingRef = useRef(false)
  const loadGenRef = useRef(0)
  const finishedNavRef = useRef(false)
  /** Последняя успешная проверка: лобби и отдельно вход в игру (playing). */
  const playAccessPhaseRef = useRef<'none' | 'lobby' | 'playing'>('none')
  const [teamId, setTeamId] = useState<string | null>(() => {
    if (typeof window === 'undefined' || !gameCode) return null
    return readStoredTeamIdForGame(gameCode)
  })

  useEffect(() => {
    if (!gameCode) return
    setTeamId(readStoredTeamIdForGame(gameCode))
  }, [gameCode])
  const extrasReady = usePlayerExtrasReady(game?.id, loading)

  const resetQuestionTimer = useCallback(
    (q: Question, gameData?: Record<string, unknown> | null) => {
      questionStartedAtRef.current = Date.now()
      const gSec =
        (gameData?.per_question_time_sec as number | undefined) ??
        (game?.per_question_time_sec as number | undefined)
      const limit = effectiveQuestionTimeSec(gSec, q.per_question_time_sec)
      timerArmedRef.current = false
      setElapsedSec(0)
      if (limit === null) {
        setTimeLeft(0)
      } else {
        setTimeLeft(limit)
      }
    },
    [game]
  )

  const applyPlayData = (gameData: Record<string, unknown>, mappedQuestions: Question[]) => {
    setGame(gameData)
    if (gameData.theme) setTheme(gameData.theme as string)
    setQuestions(mappedQuestions as Question[])
    if (mappedQuestions.length > 0) {
      resetQuestionTimer(mappedQuestions[0], gameData)
    }
    setLoading(false)
  }

  const retryPlayAccessCheck = useCallback(() => {
    setAccessDenied(null)
    setAccessDeniedRetryable(false)
    playAccessPhaseRef.current = 'none'
    setAccessCheckNonce((n) => n + 1)
  }, [])

  const handleMyTeamRemoved = useCallback(() => {
    setAccessDenied(PLAY_MESSAGES.invalid_session)
    setAccessDeniedRetryable(false)
    setLoading(false)
  }, [])

  useEffect(() => {
    setSessionKnown(false)
    setSessionUnknown(true)
    setAccessDenied(null)
    setAccessDeniedRetryable(false)
    setPlayAccessPending(false)
    playAccessPhaseRef.current = 'none'
  }, [gameCode])

  useEffect(() => {
    if (!game?.id || !teamId || !gameCode || sessionUnknown) return

    const phase: 'lobby' | 'playing' = inLobby ? 'lobby' : 'playing'
    if (playAccessPhaseRef.current === phase) return

    // Полный экран только при первой проверке (лобби или холодный вход в playing).
    // lobby→playing: UI не прячем — иначе мелькает первый вопрос.
    const blockUi = phase === 'lobby' || playAccessPhaseRef.current === 'none'
    if (blockUi) setPlayAccessPending(true)

    const code = (gameCode ?? '').trim().toUpperCase()
    const stored = readStoredPlayerSession(code)
    if (!stored) {
      // #region agent log
      agentDebugLog(
        'GamePlay.tsx',
        'access invalid session',
        {
          code,
          teamId,
          storedGameCode: localStorage.getItem('game_code'),
        },
        'H8'
      )
      // #endregion
      setPlayAccessPending(false)
      setAccessDenied(PLAY_MESSAGES.invalid_session)
      setAccessDeniedRetryable(false)
      setLoading(false)
      return
    }

    void getPlayAccessDenial(game.id as string, teamId)
      .then((msg) => {
        setPlayAccessPending(false)
        if (msg) {
          // #region agent log
          agentDebugLog('GamePlay.tsx', 'access denied', { msg, teamId, phase }, 'H8')
          // #endregion
          setAccessDenied(msg)
          setAccessDeniedRetryable(false)
          setLoading(false)
          return
        }
        playAccessPhaseRef.current = phase
        agentDebugLog('GamePlay.tsx', 'access check ok', { teamId, phase }, 'H8')
      })
      .catch((err: unknown) => {
        const errMsg = err instanceof Error ? err.message : String(err)
        agentDebugLog('GamePlay.tsx', 'access check failed', { errMsg, teamId, phase }, 'H8')
        setPlayAccessPending(false)
        setAccessDenied(PLAY_MESSAGES.access_check_failed)
        setAccessDeniedRetryable(true)
        setLoading(false)
      })
  }, [game?.id, teamId, gameCode, sessionUnknown, inLobby, accessCheckNonce])

  useEffect(() => {
    if (!game?.id || !teamId || !inLobby) return
    const detach = attachGameRealtime(game.id as string, {
      onTeamsChanged: () => setAccessCheckNonce((n) => n + 1),
    })
    return detach
  }, [game?.id, teamId, inLobby])

  /** Повторная проверка при teams_changed — playAccessPhaseRef блокирует основной effect в лобби. */
  useEffect(() => {
    if (!game?.id || !teamId || !inLobby || sessionUnknown || accessDenied) return

    void isTeamStillRegistered(game.id as string, teamId)
      .then((exists) => {
        if (!exists) {
          setAccessDenied(PLAY_MESSAGES.invalid_session)
          setAccessDeniedRetryable(false)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (isTransientNetworkError(err)) return
        setAccessDenied(PLAY_MESSAGES.access_check_failed)
        setAccessDeniedRetryable(true)
        setLoading(false)
      })
  }, [game?.id, teamId, inLobby, sessionUnknown, accessCheckNonce, accessDenied])

  useEffect(() => {
    if (!inLobby || !extrasReady) return
    const timer = window.setTimeout(() => flushPendingAvatarWhenIdle(), 4000)
    return () => window.clearTimeout(timer)
  }, [inLobby, extrasReady])

  useEffect(() => {
    if (!game?.id || !teamId || getTeamSessionToken(teamId)) return
    const team = readStoredCurrentTeam(teamId)
    if (!team) return
    const name = (team.name ?? team.team_name ?? '').trim()
    const captain = (team.captain_name ?? '').trim()
    if (!name || !captain) return
    void recoverTeamSessionIfNeeded(game.id as string, name, captain, teamId)
  }, [game?.id, teamId])

  useEffect(() => {
    if (!teamId) {
      navigate('/team/register')
      return
    }

    const code = (gameCode ?? '').trim().toUpperCase()
    const cached = getGamePlayCache(code)
    const gen = ++loadGenRef.current

    if (cached && isGamePlayCacheFresh(code) && cached.questions.length > 0) {
      const mapped = mapQuestionsForPlay(cached.questions) as Question[]
      applyPlayData(cached.game, mapped)
      debugLog('GamePlay.tsx', 'hydrate from cache', { questions: mapped.length }, 'F')
      postponeAvatarUntilAfterAnswer()
      return
    }

    if (cached?.game && isGamePlayCacheFresh(code)) {
      applyPlayData(cached.game, [])
      debugLog('GamePlay.tsx', 'hydrate game only, questions pending', {}, 'H16')
      postponeAvatarUntilAfterAnswer()
      return
    }

    void loadGameData(gen, false)
  }, [gameCode, teamId, navigate])

  useEffect(() => {
    if (!inLobby || !game?.id || questions.length > 0) return
    const code = (gameCode ?? '').trim().toUpperCase()
    const cached = getGamePlayCache(code)
    if (cached?.questions?.length) {
      const mapped = mapQuestionsForPlay(cached.questions) as Question[]
      setQuestions(mapped)
      resetQuestionTimer(mapped[0], game)
      setLoading(false)
      return
    }
    agentDebugLog('GamePlay.tsx', 'lobby prefetch start', { gameId: game.id }, 'H14')
    void prefetchQuestionsForGame(game.id as string)
      .then((q) => {
        if (!q.length) return
        const mapped = mapQuestionsForPlay(q) as Question[]
        setQuestions(mapped)
        resetQuestionTimer(mapped[0], game)
        setGamePlayCache(code, {
          game,
          questions: q,
          teamsSnapshot: cached?.teamsSnapshot,
          questionsLobbyOnly: true,
        })
        setLoading(false)
        agentDebugLog('GamePlay.tsx', 'lobby prefetch applied', { count: q.length }, 'H14')
      })
      .catch((err) => {
        agentDebugLog(
          'GamePlay.tsx',
          'lobby prefetch failed',
          { msg: err instanceof Error ? err.message : String(err) },
          'H14'
        )
      })
  }, [inLobby, game, gameCode, questions.length])

  useEffect(() => {
    if (inLobby || !gameCode || sessionUnknown) return
    const code = (gameCode ?? '').trim().toUpperCase()
    const cached = getGamePlayCache(code)
    const gameRow = cached?.game ?? game
    if (!gameRow?.id) return

    if (!gamePlayCacheNeedsFullQuestions(cached) && questions.length > 0) return

    agentDebugLog(
      'GamePlay.tsx',
      'game start load questions',
      {
        code,
        hasCachedGame: !!cached?.game?.id,
        cachedQ: cached?.questions?.length ?? 0,
        lobbyOnly: cached?.questionsLobbyOnly,
      },
      'H15'
    )
    resumeBackgroundRevalidate()
    const gen = ++loadGenRef.current
    setLoading(true)
    void fetchQuestionsFullForGame(gameRow.id as string)
      .then(async (q) => {
        if (gen !== loadGenRef.current) return
        if (q.length > 0) {
          const mapped = mapQuestionsForPlay(q) as Question[]
          applyPlayData(gameRow, mapped)
          setGamePlayCache(code, {
            game: gameRow,
            questions: q,
            teamsSnapshot: cached?.teamsSnapshot,
            questionsLobbyOnly: false,
          })
          agentDebugLog('GamePlay.tsx', 'game start questions applied', { count: q.length }, 'H15')
          return
        }
        await loadGameData(gen, true)
      })
      .catch((err) => {
        agentDebugLog(
          'GamePlay.tsx',
          'game start questions failed',
          { msg: err instanceof Error ? err.message : String(err) },
          'H15'
        )
        if (gen === loadGenRef.current) void loadGameData(gen, true)
      })
      .finally(() => {
        if (gen === loadGenRef.current) setLoading(false)
      })
  }, [inLobby, gameCode, questions.length, game, sessionUnknown])

  useEffect(() => {
    if (!isFinished || !game || !gameCode || finishedNavRef.current) return
    finishedNavRef.current = true
    const code = (gameCode ?? '').trim().toUpperCase()
    const cached = getGamePlayCache(code)
    const finishState = buildFinishNavigateState(game, cached?.teamsSnapshot)
    navigateToFinish(navigate, code, game.finish_page_type as string | undefined, finishState)
  }, [isFinished, game, gameCode, navigate])

  useEffect(() => {
    if (!inLobby || !teamId) return

    setCurrentQuestionIndex(0)
    setAnswer('')
    setSelectedOptions([])
    setAnswerFile(null)
    setAnswerFilePreview(null)
    setShowHint(false)
    setHintLevel(0)
    setCurrentHintDisplay(0)
    finishedNavRef.current = false

    if (questions.length > 0) {
      resetQuestionTimer(questions[0], game)
    }
  }, [inLobby, teamId, gameCode, questions.length, game, resetQuestionTimer])

  useEffect(() => {
    if (inLobby || isPaused || isFinished || questions.length === 0) return
    const q = questions[currentQuestionIndex]
    if (!q || !game) return
    const limit = effectiveQuestionTimeSec(game.per_question_time_sec, q.per_question_time_sec)
    if (limit === null) {
      questionStartedAtRef.current = Date.now()
      return
    }
    if (timeLeft === 0 && !timerArmedRef.current) {
      timerArmedRef.current = false
      setTimeLeft(limit)
      questionStartedAtRef.current = Date.now()
      agentDebugLog(
        'GamePlay.tsx',
        'timer init on play entry',
        { index: currentQuestionIndex },
        'H1'
      )
    }
  }, [
    inLobby,
    isPaused,
    isFinished,
    questions,
    currentQuestionIndex,
    timeLeft,
    game,
  ])

  // Счёт с сервера (после сброса заезда админом) — после idle, чтобы не конкурировать с входом в лобби.
  useEffect(() => {
    if (!extrasReady || !inLobby || !teamId) return
    void syncPlayerTeamScoreFromServer(teamId, gameCode ?? undefined)
  }, [extrasReady, inLobby, teamId, gameCode])

  useEffect(() => {
    // Очистить предыдущий таймер
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    if (inLobby || isPaused || isFinished) {
      return
    }

    const q = questions[currentQuestionIndex]
    if (!q || !game) return

    const limit = effectiveQuestionTimeSec(game.per_question_time_sec, q.per_question_time_sec)

    if (limit === null) {
      if (showQuestionTimer(game.settings)) {
        timerRef.current = setTimeout(() => {
          setElapsedSec(Math.floor((Date.now() - questionStartedAtRef.current) / 1000))
        }, 1000)
      }
      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current)
        }
      }
    }

    if (timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        timerArmedRef.current = true
        setTimeLeft(timeLeft - 1)
      }, 1000)
    } else if (
      timeLeft === 0 &&
      questions.length > 0 &&
      timerArmedRef.current &&
      !isSubmittingRef.current &&
      !advancingRef.current
    ) {
      timerArmedRef.current = false
      void handleTimeExpired()
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [timeLeft, elapsedSec, inLobby, isPaused, isFinished, questions, currentQuestionIndex, game])

  // Очистка состояния при смене вопроса
  useEffect(() => {
    setAnswer('')
    setSelectedOptions([])
    setAnswerFile(null)
    setAnswerFilePreview(null)
    setShowHint(false)
    setHintLevel(0)
    setCurrentHintDisplay(0)
    if (questions.length === 0 || inLobby || isPaused || isFinished) return
    const q = questions[currentQuestionIndex]
    if (q && game) {
      resetQuestionTimer(q, game)
    }
  }, [currentQuestionIndex, questions, game, inLobby, isPaused, isFinished, resetQuestionTimer])

  const loadGameData = async (loadGen: number, staleCache: boolean) => {
    const code = (gameCode ?? '').trim().toUpperCase()
    const existing = loadGameDataInflight.get(code)
    if (existing) {
      agentDebugLog('GamePlay.tsx', 'loadGameData dedupe wait', { code }, 'H15')
      await existing
      return
    }

    const task = loadGameDataInner(loadGen, staleCache, code)
    loadGameDataInflight.set(code, task)
    try {
      await task
    } finally {
      loadGameDataInflight.delete(code)
    }
  }

  const loadGameDataInner = async (loadGen: number, staleCache: boolean, code: string) => {
    const cachedForLoad = getGamePlayCache(code)
    const gameId = cachedForLoad?.game?.id as string | undefined
    debugLog('GamePlay.tsx:loadGameData', 'start', { gameCode: code, staleCache, gameId }, 'E')
    agentDebugLog(
      'GamePlay.tsx',
      'loadGameData start',
      { code, staleCache, gameId: gameId ?? null },
      'H15'
    )

    if (staleCache) {
      const cached = getGamePlayCache(code)
      if (cached) {
        const mapped = mapQuestionsForPlay(cached.questions) as Question[]
        applyPlayData(cached.game, mapped)
        debugLog('GamePlay.tsx', 'stale cache shown', { questions: mapped.length }, 'F')
      }
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      if (loadGen !== loadGenRef.current) return
      try {
        const loadStarted = Date.now()
        const result =
          gameId && cachedForLoad?.game
            ? await revalidateQuestionsForGameCritical(gameId, code, cachedForLoad.game)
            : await revalidateGamePlayCritical(code)
        agentDebugLog(
          'GamePlay.tsx',
          'loadGameData fetch done',
          {
            attempt,
            questionsOnly: !!(gameId && cachedForLoad?.game),
            ms: Date.now() - loadStarted,
            count: result?.questions?.length ?? 0,
          },
          'H15'
        )
        if (loadGen !== loadGenRef.current) return
        if (!result) {
          if (isBackgroundRevalidatePaused() || staleCache || game) return
          alert('Игра не найдена')
          navigate('/')
          return
        }

        const mappedQuestions = mapRevalidatedQuestions(result.questions) as Question[]
        applyPlayData(result.game, mappedQuestions)
        debugLog('GamePlay.tsx', 'load ok', { questions: mappedQuestions.length, attempt }, 'E')
        return
      } catch (err: any) {
        if (loadGen !== loadGenRef.current) return
        debugLog('GamePlay.tsx', 'load error', { msg: err?.message, attempt, staleCache }, 'E')
        agentDebugLog(
          'GamePlay.tsx',
          'loadGameData error',
          { msg: err?.message, attempt, staleCache },
          'H15'
        )
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
          continue
        }
        if (!staleCache && !game) {
          console.error('Ошибка загрузки данных:', err)
          alert('Не удалось загрузить игру. Проверьте интернет и обновите страницу.')
          setLoading(false)
        }
      }
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

  const updateStoredTeamScore = (total: number) => {
    const stored = readStoredCurrentTeam(teamId!)
    if (stored) {
      writeStoredCurrentTeam({ ...stored, total_score: total })
    }
  }

  const handleSubmitAnswer = async (options?: { timeoutSkip?: boolean }) => {
    if (isSubmittingRef.current || advancingRef.current) return

    const currentQuestion = questions[currentQuestionIndex]
    const hasTextAnswer = currentQuestion.answer_count === 1 && answer.trim()
    const hasSelectedOptions = currentQuestion.answer_count > 1 && selectedOptions.length > 0
    const timeoutSkip = options?.timeoutSkip === true

    if (!timeoutSkip && !hasTextAnswer && !hasSelectedOptions && !answerFile) return
    if (!teamId) return
    if (!game?.id) {
      alert('Игра ещё загружается. Подождите секунду и попробуйте снова.')
      return
    }

    pauseBackgroundRevalidate()
    cancelActiveStorageUpload()
    isSubmittingRef.current = true
    timerArmedRef.current = false
    setUploadingFile(true)
    const submitStarted = Date.now()
    debugLog('GamePlay.tsx:submit', 'start', { hasFile: !!answerFile, q: currentQuestionIndex, timeoutSkip }, 'H')

    let advanceAfterSave = false

    try {
      let mediaUrl: string | null = null

      if (answerFile && !timeoutSkip) {
        try {
          mediaUrl = await uploadAnswerMediaQueued(answerFile, game.id)
          debugLog('GamePlay.tsx:submit', 'media ok', { ms: Date.now() - submitStarted }, 'H')
        } catch (err) {
          debugLog('GamePlay.tsx:submit', 'media fail', {
            ms: Date.now() - submitStarted,
            msg: err instanceof Error ? err.message : String(err),
          }, 'H')
          console.error('Ошибка загрузки файла:', err)
          alert('Предупреждение: не удалось загрузить файл. Ответ будет сохранён без медиа.')
        }
      }

      let userAnswerText = ''
      let userAnswers: string[] = []

      if (timeoutSkip) {
        userAnswerText = '—'
        userAnswers = ['—']
      } else if (currentQuestion.answer_count === 1) {
        userAnswerText = answer.toLowerCase().trim()
        userAnswers = [answer.trim()]
      } else {
        userAnswerText = selectedOptions.join(', ')
        userAnswers = selectedOptions
      }

      const limit = effectiveQuestionTimeSec(
        game.per_question_time_sec,
        currentQuestion.per_question_time_sec
      )
      let timeTaken: number
      if (timeoutSkip && limit !== null) {
        timeTaken = limit
      } else if (limit !== null) {
        timeTaken = limit - timeLeft
      } else {
        timeTaken = Math.floor((Date.now() - questionStartedAtRef.current) / 1000)
      }
      const questionNumber = currentQuestion.order_index ?? currentQuestionIndex + 1
      const answerPayload = userAnswers.length ? userAnswers : [userAnswerText]
      normalizeUserAnswers(answerPayload)

      let sessionToken = getTeamSessionToken(teamId)
      if (!sessionToken) {
        sessionToken = await ensureTeamSessionToken(game.id, teamId)
      }
      if (!sessionToken) {
        alert('Сессия команды не найдена. Обновите страницу или зарегистрируйтесь заново в лобби.')
        return
      }

      const submitReq = {
        game_id: game.id,
        team_id: teamId,
        question_number: questionNumber,
        answer: answerPayload,
        media_urls: mediaUrl ? [mediaUrl] : [],
        time_spent: timeTaken,
        hints_used: hintLevel,
        session_token: sessionToken,
      }

      try {
        const result = await enqueueSubmitAutoAnswer(submitReq)
        debugLog('GamePlay.tsx:submit', 'saved', {
          totalMs: Date.now() - submitStarted,
          via: result.via,
          isCorrect: result.is_correct,
          score: result.points_earned,
        }, 'H')
        if (result.points_earned > 0) {
          applyOptimisticTeamScoreBump(teamId, result.points_earned, gameCode ?? '')
        }
        if (result.team_total_score >= 0) {
          updateStoredTeamScore(result.team_total_score)
        }
        if (result.grading_status === 'pending') {
          setPendingReviewNotice(
            'Ответ отправлен на проверку ведущему. Очки появятся после принятия.'
          )
        }
        advanceAfterSave = true
      } catch (saveErr: unknown) {
        const msg = saveErr instanceof Error ? saveErr.message : String(saveErr)
        debugLog('GamePlay.tsx:submit', 'save failed', {
          totalMs: Date.now() - submitStarted,
          msg,
        }, 'H7')
        if (isTransientNetworkError(saveErr)) {
          enqueuePendingAnswer(submitReq, gameCode ?? '')
          advanceAfterSave = true
        } else {
          alert(
            'Не удалось сохранить ответ на сервере. Проверьте сеть и попробуйте ещё раз.\n\n' + msg
          )
        }
      }

      if (advanceAfterSave) {
        debugLog('GamePlay.tsx:submit', 'advance ui', {
          ms: Date.now() - submitStarted,
        }, 'H')
        await handleNextQuestion(sessionToken)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      debugLog('GamePlay.tsx:submit', 'error', {
        totalMs: Date.now() - submitStarted,
        msg: message,
      }, 'H')
      console.error('Ошибка отправки ответа:', err)

      if (message.includes('answers')) {
        alert('Ошибка сохранения ответа в базу данных. Попробуйте еще раз или обратитесь к администратору.')
      } else if (message.includes('teams') || message.includes('total_score')) {
        alert('Ошибка обновления счета команды. Ваш ответ сохранен, но очки могут быть обновлены с задержкой.')
      } else {
        alert('Ошибка отправки ответа: ' + message + '\n\nПопробуйте еще раз.')
      }
    } finally {
      setUploadingFile(false)
      isSubmittingRef.current = false
    }
  }

  const handleTimeExpired = () => {
    if (isSubmittingRef.current || advancingRef.current) return
    const currentQuestion = questions[currentQuestionIndex]
    const hasTextAnswer = currentQuestion.answer_count === 1 && answer.trim()
    const hasSelectedOptions = currentQuestion.answer_count > 1 && selectedOptions.length > 0
    if (hasTextAnswer || hasSelectedOptions || answerFile) {
      void handleSubmitAnswer()
      return
    }
    void handleSubmitAnswer({ timeoutSkip: true })
  }

  const handleNextQuestion = async (sessionToken?: string | null) => {
    if (advancingRef.current) return
    advancingRef.current = true
    try {
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1)
        setAnswer('')
        setSelectedOptions([])
        setAnswerFile(null)
        setAnswerFilePreview(null)
        setShowHint(false)
        setHintLevel(0)
        setCurrentHintDisplay(0)
      } else {
        const gameId = game?.id as string | undefined
        let token = sessionToken ?? getTeamSessionToken(teamId)
        if (gameId && teamId && !token) {
          token = await ensureTeamSessionToken(gameId, teamId)
        }
        if (!gameId || !teamId || !token) {
          alert('Не удалось завершить игру: сессия команды не найдена. Обновите страницу или перерегистрируйтесь.')
          return
        }
        const finishResult = await enqueueCritical(() => markTeamFinished(gameId, teamId, token))
        if (!finishResult?.success) {
          alert(
            'Не удалось отметить завершение игры на сервере. Проверьте сеть и попробуйте снова — без этого админка не увидит результат.'
          )
          return
        }
        const code = (gameCode ?? '').trim().toUpperCase()
        const cached = getGamePlayCache(code)
        const finishState = buildFinishNavigateState(game, cached?.teamsSnapshot)
        navigateToFinish(navigate, code, game?.finish_page_type as string | undefined, finishState)
      }
    } finally {
      advancingRef.current = false
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

  const codeForSession = (gameCode ?? '').trim().toUpperCase()
  const cachedForSession = codeForSession ? getGamePlayCache(codeForSession) : null
  const sessionGameId =
    (game?.id as string | undefined) ?? (cachedForSession?.game?.id as string | undefined)

  const sessionManager = sessionGameId ? (
    <GameStateManager gameId={String(sessionGameId)} onSessionChange={handleSessionChange} />
  ) : null

  const notificationOverlay =
    extrasReady && game?.id ? <NotificationPopup gameId={game.id} teamId={teamId} /> : null

  const playShell = (body: React.ReactNode, notifications: React.ReactNode = null) => (
    <>
      {sessionManager}
      {body}
      {notifications}
    </>
  )

  if (accessDenied) {
    return playShell(
      <AccessDeniedScreen
        message={accessDenied}
        showRegisterLink={!accessDeniedRetryable}
        onRetry={accessDeniedRetryable ? retryPlayAccessCheck : undefined}
      />
    )
  }

  if (isClosed && sessionKnown && game) {
    return playShell(
      <AccessDeniedScreen
        title="Игра закрыта"
        message={PLAY_MESSAGES.closed}
        showRegisterLink={false}
      />
    )
  }

  const hasFreshPlayCache = codeForSession.length > 0 && isGamePlayCacheFresh(codeForSession)
  const waitingForSession = !!(game && sessionUnknown && !hasFreshPlayCache)

  if (playAccessPending) {
    return playShell(
      <div
        className="min-h-screen theme-background flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)',
        }}
      >
        <div className="text-white text-xl">Проверка доступа...</div>
      </div>
    )
  }

  if ((!game && loading) || waitingForSession) {
    return playShell(
      <div
        className="min-h-screen theme-background flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)',
        }}
      >
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    )
  }

  const myTeamName =
    (() => {
      try {
        const raw = localStorage.getItem('current_team')
        if (!raw) return null
        const t = JSON.parse(raw) as { name?: string }
        return t.name ?? null
      } catch {
        return null
      }
    })()

  if (inLobby && game) {
    return playShell(
      <GameLobby
        gameId={game.id as string}
        gameCode={gameCode}
        gameTitle={(game.title as string) || 'Квест'}
        myTeamName={myTeamName}
        myTeamId={teamId}
        onMyTeamRemoved={handleMyTeamRemoved}
      />,
      notificationOverlay
    )
  }

  if (questions.length === 0) {
    const reloadQuestions = () => {
      const gen = ++loadGenRef.current
      setLoading(true)
      void loadGameData(gen, false).finally(() => {
        if (gen === loadGenRef.current) setLoading(false)
      })
    }

    return playShell(
      <div
        className="min-h-screen theme-background flex items-center justify-center p-4"
        style={{
          background: 'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)',
        }}
      >
        <div className="bg-white rounded-2xl p-8 max-w-md text-center">
          {loading ? (
            <>
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mb-4" />
              <h2 className="text-xl font-bold text-gray-800 mb-2">Загрузка вопросов…</h2>
              <p className="text-gray-600 text-sm">Подождите, обновляем данные с сервера</p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Вопросов пока нет</h2>
              <p className="text-gray-600 mb-6">
                Вопросы не найдены. Если администратор только что их добавил, нажмите «Обновить».
                Иначе попросите ведущего сохранить вопросы в редакторе игры.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  type="button"
                  onClick={reloadQuestions}
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Обновить
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/team/register')}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  К регистрации
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  const currentQuestion = questions[currentQuestionIndex]
  const hints = currentQuestion.hint_levels || []
  const questionTimeLimit = effectiveQuestionTimeSec(
    game?.per_question_time_sec,
    currentQuestion?.per_question_time_sec
  )
  const displayQuestionTimer = showQuestionTimer(game?.settings)
  
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

  return playShell(
    <div
      className="min-h-screen theme-background p-4"
      style={{
        background: 'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-secondary) 100%)',
      }}
    >
      <div className="max-w-4xl mx-auto">
        {pendingReviewNotice && (
          <div
            className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 text-sm sm:text-base flex items-start justify-between gap-3"
            role="status"
          >
            <span>{pendingReviewNotice}</span>
            <button
              type="button"
              onClick={() => setPendingReviewNotice(null)}
              className="shrink-0 text-amber-700 hover:text-amber-900 font-medium"
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold truncate">{game?.title}</h2>
                <p className="text-sm sm:text-base text-white/80">
                  Вопрос {currentQuestionIndex + 1} из {questions.length}
                </p>
              </div>
              {displayQuestionTimer && (
                <div className="text-center sm:text-right flex-shrink-0">
                  <div className="flex items-center justify-center sm:justify-end gap-2 text-2xl sm:text-3xl font-bold">
                    <Clock className="w-6 h-6 sm:w-8 sm:h-8" />
                    {formatCountdownMmSs(
                      questionTimeLimit === null ? elapsedSec : timeLeft
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-white/80">
                    {questionTimeLimit === null ? 'На вопросе' : 'Осталось времени'}
                  </p>
                </div>
              )}
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
                  onClick={() => void handleSubmitAnswer()}
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
    </div>,
    notificationOverlay
  )
}
