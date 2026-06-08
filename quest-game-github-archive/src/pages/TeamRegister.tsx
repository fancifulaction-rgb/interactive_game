import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { isTransientNetworkError, registerTeamDirect } from '../lib/teamRegister'
import type { TeamSnapshot } from '../lib/gamePlayCache'
import { compressImageForAvatar } from '../lib/compressImage'
import {
  agentDebugLog,
  debugLog,
  reportDebugToServer,
  saveRegistrationError,
} from '../lib/debugLog'

const DEV_BUILD_MARKER = import.meta.env.DEV
  ? new Date().toISOString().slice(0, 19).replace('T', ' ')
  : ''
import { fetchGameStateForGame } from '../lib/fetchGameState'
import { getGamePlayCache, setGamePlayCache } from '../lib/gamePlayCache'
import { prefetchQuestionsForGame } from '../lib/prefetchGameQuestions'
import { fetchLobbyTeams } from '../lib/fetchLobbyTeams'
import { fetchGameByCode, getCachedGameByCode } from '../lib/gameLookupCache'
import { markPlayerFetchBoost } from '../lib/playerFetchBoost'
import { markRegistrationSubmitBoost } from '../lib/registrationBoost'
import { saveTeamSession } from '../lib/playerSession'
import { rememberSessionSnapshot } from '../lib/gameSessionSnapshotCache'
import { getRegistrationDenialFromState } from '../lib/participantAccess'
import { downloadClientLogsJson } from '../lib/clientLogCollector'
import { readRegistrationCodeFromSearch } from '../lib/registrationUrl'
import { ArrowLeft, Users, User, Upload, Hash } from 'lucide-react'

type GameRow = {
  id: string
  code: string
  title: string
  theme: string | null
  per_question_time_sec: number | null
  finish_page_type: string | null
  scoring: unknown
  mask_board: boolean | null
  total_time_sec: number | null
}

export default function TeamRegister() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [gameCode, setGameCode] = useState('')
  const [teamName, setTeamName] = useState('')
  const [captainName, setCaptainName] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [errorDetail, setErrorDetail] = useState('')
  const [copyHint, setCopyHint] = useState('')
  const [reportHint, setReportHint] = useState('')
  const [loading, setLoading] = useState(false)
  const submittingRef = useRef(false)
  const submitSpinnerStartedRef = useRef(0)

  useEffect(() => {
    markPlayerFetchBoost()
    agentDebugLog(
      'TeamRegister.tsx',
      'page load',
      {
        ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : '',
        host: typeof window !== 'undefined' ? window.location.host : '',
      },
      'H10'
    )
  }, [])

  useEffect(() => {
    const fromUrl = readRegistrationCodeFromSearch(searchParams.toString())
    if (fromUrl.length >= 4) {
      setGameCode(fromUrl)
    }
  }, [searchParams])

  // Прогрев lookup игры и game_state до submit — debounce, иначе каждый символ = GET в очередь.
  useEffect(() => {
    const normalizedCode = gameCode.trim().toUpperCase()
    if (normalizedCode.length < 4) return

    const warmState = (gameId: string) => {
      void fetchGameStateForGame(gameId).catch(() => {})
    }

    const cached = getCachedGameByCode(normalizedCode)
    if (cached) {
      warmState(cached.id)
      return
    }

    const timer = setTimeout(() => {
      void fetchGameByCode(normalizedCode)
        .then((game) => {
          if (game) warmState(game.id)
        })
        .catch(() => {})
    }, 400)
    return () => clearTimeout(timer)
  }, [gameCode])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const prepared = await compressImageForAvatar(file)
      setAvatarFile(prepared)
      const reader = new FileReader()
      reader.onloadend = () => setAvatarPreview(reader.result as string)
      reader.readAsDataURL(prepared)
      if (file.size > prepared.size) {
        setError('')
      }
    } catch {
      setError('Не удалось обработать изображение')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
    setError('')
    setErrorDetail('')
    setCopyHint('')
    setLoading(true)
    submitSpinnerStartedRef.current = Date.now()
    markPlayerFetchBoost()
    markRegistrationSubmitBoost()
    const normalizedCode = gameCode.trim().toUpperCase()
    debugLog('TeamRegister.tsx:submit', 'start', { normalizedCode, hasAvatar: !!avatarFile }, 'D')
    // #region agent log
    agentDebugLog(
      'TeamRegister.tsx',
      'submit start',
      {
        normalizedCode,
        hasAvatar: !!avatarFile,
        ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : '',
      },
      'H1'
    )
    // #endregion

    try {
      type RegOutcome =
        | { kind: 'not_found' }
        | { kind: 'denied'; message: string }
        | {
            kind: 'ok'
            game: GameRow
            team: Awaited<ReturnType<typeof registerTeamDirect>>['team']
          }

      // Регистрация без enqueueCritical — HTTP уже в очереди supabase; иначе iPhone ждёт prefetch/ответы других вкладок.
      const regStarted = Date.now()
      const outcome = await (async (): Promise<RegOutcome> => {
        const cachedGame = getCachedGameByCode(normalizedCode)
        let gameData: GameRow | null = cachedGame as GameRow | null

        if (!cachedGame) {
          const fetched = await fetchGameByCode(normalizedCode)
          if (!fetched) {
            debugLog('TeamRegister.tsx', 'game not found', { normalizedCode }, 'D')
            return { kind: 'not_found' }
          }
          gameData = fetched as GameRow
        } else {
          agentDebugLog(
            'TeamRegister.tsx',
            'games cache hit',
            { gameId: cachedGame.id, ms: Date.now() - regStarted },
            'H12'
          )
          void fetchGameByCode(normalizedCode).catch(() => {})
        }

        agentDebugLog(
          'TeamRegister.tsx',
          'games loaded',
          { ms: Date.now() - regStarted, fromCache: !!cachedGame },
          'H12'
        )

        let stateRow = null
        try {
          stateRow = await fetchGameStateForGame(gameData!.id, { force: true })
        } catch (stateErr: unknown) {
          const stateMsg = stateErr instanceof Error ? stateErr.message : String(stateErr)
          agentDebugLog(
            'TeamRegister.tsx',
            'state fetch failed',
            { gameId: gameData!.id, stateMsg },
            'H9'
          )
          if (isTransientNetworkError(stateErr)) {
            return {
              kind: 'denied',
              message:
                'Не удалось связаться с сервером. Проверьте Wi‑Fi и попробуйте снова.',
            }
          }
        }
        const registrationDenial = getRegistrationDenialFromState(stateRow)
        agentDebugLog(
          'TeamRegister.tsx',
          'state check',
          {
            gameId: gameData!.id,
            current_state: stateRow?.current_state ?? null,
            denial: registrationDenial,
            stateSkipped: stateRow === null,
          },
          'H2'
        )
        if (registrationDenial) {
          return { kind: 'denied', message: registrationDenial }
        }

        rememberSessionSnapshot(gameData!.id, {
          inLobby: true,
          isPaused: false,
          isFinished: false,
          isClosed: false,
          sessionUnknown: false,
        })

        agentDebugLog(
          'TeamRegister.tsx',
          'before insert',
          { ms: Date.now() - regStarted },
          'H12'
        )

        const regInsertDone = Date.now()
        const { team } = await registerTeamDirect({
          gameId: gameData!.id,
          gameCode: normalizedCode,
          teamName,
          captainName,
          avatarFile,
        })
        agentDebugLog(
          'TeamRegister.tsx',
          'register direct done',
          { ms: Date.now() - regStarted, insertMs: Date.now() - regInsertDone },
          'H12'
        )

        debugLog('TeamRegister.tsx', 'game found', { gameId: gameData!.id }, 'D')
        return { kind: 'ok', game: gameData as GameRow, team }
      })()

      if (outcome.kind === 'not_found') {
        setErrorDetail('')
        setError(`Игра с кодом «${normalizedCode}» не найдена. Проверьте код в админ-панели.`)
        return
      }
      if (outcome.kind === 'denied') {
        // #region agent log
        agentDebugLog('TeamRegister.tsx', 'denied', { message: outcome.message }, 'H2')
        // #endregion
        setErrorDetail('')
        setError(outcome.message)
        return
      }

      const { game, team } = outcome
      // #region agent log
      agentDebugLog('TeamRegister.tsx', 'register ok', { gameId: game.id, teamId: team.id }, 'H1')
      // #endregion

      const teamSnapshot: TeamSnapshot = {
        id: team.id,
        team_name: (team.team_name || team.name) as string,
        captain_name: team.captain_name as string,
        avatar_url: (team.avatar_url || team.avatar) as string | null,
        total_score: Number(team.total_score) || 0,
        registration_time: (team.registration_time || team.created_at) as string,
      }

      const teamsSnapshot: TeamSnapshot[] = [teamSnapshot]

      setGamePlayCache(normalizedCode, {
        game,
        questions: [],
        teamsSnapshot,
      })

      void prefetchQuestionsForGame(game.id)
        .then((questions) => {
          if (!questions.length) return
          const cached = getGamePlayCache(normalizedCode)
          setGamePlayCache(normalizedCode, {
            game,
            questions,
            teamsSnapshot: cached?.teamsSnapshot ?? teamsSnapshot,
            questionsLobbyOnly: true,
          })
        })
        .catch((err) => {
          agentDebugLog(
            'TeamRegister.tsx',
            'prefetch failed',
            { msg: err instanceof Error ? err.message : String(err) },
            'H14'
          )
        })

      try {
        saveTeamSession(team)
        localStorage.setItem('game_code', normalizedCode)
        localStorage.setItem(
          'current_team',
          JSON.stringify({
            id: team.id,
            name: team.team_name || team.name,
            captain_name: team.captain_name,
            players: [team.captain_name || captainName],
            avatar_url: team.avatar_url || team.avatar,
            total_score: 0,
          })
        )
      } catch (storageErr: unknown) {
        const storageMsg =
          storageErr instanceof Error ? storageErr.message : String(storageErr)
        agentDebugLog('TeamRegister.tsx', 'storage failed', { storageMsg }, 'H8')
        throw new Error(
          'Не удалось сохранить сессию в браузере. Отключите режим инкогнито/Private и повторите.'
        )
      }

      debugLog('TeamRegister.tsx', 'navigate', { path: `/game/${normalizedCode}` }, 'E')
      // #region agent log
      agentDebugLog('TeamRegister.tsx', 'navigate', { gameId: game.id, teamId: team.id }, 'H8')
      // #endregion
      setLoading(false)
      navigate(`/game/${normalizedCode}`)

      void fetchLobbyTeams(game.id, { force: true })
        .then((lobbyRows) => {
          if (lobbyRows.length === 0) return
          const fullSnapshot = lobbyRows.map((row) => ({
            id: row.id,
            team_name: (row.team_name || row.name || 'Команда').trim(),
            captain_name: row.captain_name ?? '',
            avatar_url: null,
            total_score: 0,
            registration_time: undefined,
          }))
          const cached = getGamePlayCache(normalizedCode)
          setGamePlayCache(normalizedCode, {
            game,
            questions: cached?.questions ?? [],
            teamsSnapshot: fullSnapshot,
          })
          agentDebugLog(
            'TeamRegister.tsx',
            'teams snapshot bg',
            { gameId: game.id, count: fullSnapshot.length },
            'H6'
          )
        })
        .catch(() => {})

      return
    } catch (err: any) {
      const msg = err?.message || String(err)
      debugLog('TeamRegister.tsx', 'error', { msg }, 'A')
      const errMeta = {
        ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : '',
        host: typeof window !== 'undefined' ? window.location.host : '',
      }
      saveRegistrationError(msg, errMeta)
      void reportDebugToServer({ phase: 'registration-catch', msg })
      setErrorDetail(msg)
      setError(
        msg.includes('listener indicated an asynchronous response')
          ? 'Сбой расширения браузера. Отключите блокировщики на этом сайте или попробуйте в режиме инкогнито.'
          : isTransientNetworkError(err) ||
              msg.includes('Failed to fetch') ||
              msg.includes('Load failed') ||
              msg.includes('aborted') ||
              msg.includes('timeout')
            ? `Сбой сети при сохранении. Если команда уже есть в лобби — обновите страницу или откройте игру по коду. Используйте http://${typeof window !== 'undefined' ? window.location.host : '192.168.x.x:5174'} (не localhost).`
            : 'Ошибка регистрации: ' + msg
      )
    } finally {
      submittingRef.current = false
      setLoading(false)
      if (submitSpinnerStartedRef.current > 0) {
        agentDebugLog(
          'TeamRegister.tsx',
          'register spinner end',
          { totalMs: Date.now() - submitSpinnerStartedRef.current },
          'H10'
        )
        submitSpinnerStartedRef.current = 0
      }
      debugLog('TeamRegister.tsx', 'finally loading=false', {}, 'E')
    }
    // navigate path returns early above
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <button
          onClick={() => navigate('/')}
          className="mb-6 text-white/80 hover:text-white flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Назад
        </button>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800">Регистрация команды</h1>
            <p className="text-gray-600 mt-2">Заполните данные для участия в игре</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Код игры
              </label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={gameCode}
                  onChange={(e) => {
                    // Разрешаем только буквы и цифры, от 4 до 6 символов
                    const value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)
                    setGameCode(value)
                  }}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl font-bold tracking-widest"
                  placeholder="ABC123"
                  maxLength={6}
                  pattern="[a-zA-Z0-9]{4,6}"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Название команды
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Введите название команды"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Имя капитана
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={captainName}
                  onChange={(e) => setCaptainName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Введите имя капитана"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Аватар команды (необязательно)
              </label>
              <div className="flex items-center gap-4">
                {avatarPreview && (
                  <img
                    src={avatarPreview}
                    alt="Preview"
                    className="w-20 h-20 rounded-full object-cover border-4 border-blue-500"
                  />
                )}
                <label className="flex-1 cursor-pointer">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-500 transition-colors text-center">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {avatarFile ? avatarFile.name : 'Загрузить изображение'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Большие фото сжимаются автоматически</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg space-y-2">
                <p className="text-sm font-medium">{error}</p>
                {errorDetail && (
                  <>
                    <textarea
                      readOnly
                      className="w-full text-xs font-mono text-red-900 bg-red-100/50 border border-red-200 rounded p-2 min-h-[4.5rem] select-all"
                      value={errorDetail}
                      onFocus={(e) => e.target.select()}
                    />
                    <p className="text-xs text-red-600">
                      Зажмите поле выше → «Выбрать всё» → «Копировать» (на iPhone без Mac).
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        className="text-xs underline text-red-800"
                        onClick={async () => {
                          const text = `${error}\n\nТехнически: ${errorDetail}`
                          try {
                            await navigator.clipboard.writeText(text)
                            setCopyHint('Скопировано — вставьте в чат')
                          } catch {
                            setCopyHint('Используйте поле выше: зажмите → Выбрать всё → Копировать')
                          }
                        }}
                      >
                        Скопировать текст ошибки
                      </button>
                      <button
                        type="button"
                        className="text-xs underline text-red-800"
                        onClick={async () => {
                          setReportHint('Отправка…')
                          const ok = await reportDebugToServer({ phase: 'manual', error, errorDetail })
                          setReportHint(
                            ok
                              ? 'Отчёт отправлен на ПК — можно повторить попытку'
                              : 'Не удалось отправить. Скопируйте текст из поля выше.'
                          )
                        }}
                      >
                        Отправить отчёт на ПК
                      </button>
                      {import.meta.env.DEV && (
                        <button
                          type="button"
                          className="text-xs underline text-red-800"
                          onClick={() => {
                            downloadClientLogsJson()
                            setReportHint('JSON с логами скачан — передайте файл на ПК')
                          }}
                        >
                          Скачать диагностику
                        </button>
                      )}
                    </div>
                    {copyHint && <p className="text-xs text-red-600">{copyHint}</p>}
                    {reportHint && <p className="text-xs text-red-600">{reportHint}</p>}
                  </>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Регистрация...' : 'Зарегистрироваться'}
            </button>
          </form>
          {import.meta.env.DEV && DEV_BUILD_MARKER && (
            <p className="text-center text-[10px] text-gray-400 mt-4 select-all">
              dev {DEV_BUILD_MARKER}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
