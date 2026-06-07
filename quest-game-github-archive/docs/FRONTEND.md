# Frontend Quest Game

React 18 + TypeScript + Vite 6 + Tailwind. Точка входа: `src/main.tsx`, маршруты: `src/App.tsx`.

## Маршруты

| Path | Компонент | Доступ |
|------|-----------|--------|
| `/` | `Home` | Публичный |
| `/admin/login` | `AdminLogin` | Публичный |
| `/admin/reset-password` | `ResetPassword` | Публичный |
| `/admin/panel` | `AdminPanel` | Auth |
| `/admin/game/:gameId/edit` | `GameEditor` | Auth |
| `/team/register` | `TeamRegister` | Публичный (anon); `?code=XXXX` deep link |
| `/host/:gameCode` | `HostView` | Публичный дисплей; управление при Supabase Auth |
| `/game/:gameCode` | `GamePlay` | Команда (localStorage) |
| `/scoreboard/:gameCode` | `PlayerScoreboard` | Публичный |
| `/scoreboard-admin/:gameCode` | `AdminScoreboard` | Админ/публичный |
| `/scoreboard-detailed/:gameCode` | `ScoreboardDetailed` | Публичный |
| `/congratulation/:gameCode` | `Congratulation` | После игры |
| `/congratulation-with-stats/:gameCode` | `CongratulationWithStats` | После игры |

Код игры в URL — **верхний регистр** в кэше (`gamePlayCache`).

## Структура `src/`

```
src/
├── App.tsx
├── main.tsx
├── pages/           # Экраны по маршрутам
├── components/      # Переиспользуемый UI
├── contexts/        # ThemeContext
├── lib/             # Логика без UI (важно для агента)
├── utils/           # exportData и пр.
└── hooks/           # при наличии
```

## Страницы (кратко)

### `TeamRegister`

- Поиск игры по `code` через `enqueueCritical`.
- `teams.insert`, сохранение `current_team` в `localStorage`.
- **Navigate сразу** после insert; `prefetchGameQuestions` + `setGamePlayCache` в `enqueueBackground`.

### `GamePlay`

- Гидратация из `gamePlayCache` / Supabase; при кэше без вопросов — ждёт `prefetchQuestionsForGame` (dedupe), не полный `loadGameData`.
- Один `GameStateManager` на экран; лобби (`GameLobby`) без блокировки на `sessionKnown`.
- Ответ: optimistic → `handleNextQuestion` → `saveAnswerToServer` / `submitAutoAnswer` + `pendingAnswerQueue` при сбое.
- Финиш: `buildFinishNavigateState` → congratulation / scoreboard.
- `attachGameRealtime` из `gameRealtime.ts`.

### `GameControls` (в AdminPanel)

- Старт / пауза / финиш / «Запустить заново» / **«Начать с нуля»** через `runAction` + `enqueueCritical`.
- Poll команд 30 s; пауза при `adminBusyRef`; `fetchLobbyTeams` с `acceptEmpty` после сброса.
- Realtime через `attachGameRealtime` (не отдельный канал).

### `PlayerScoreboard`

- Мгновенный рендер из `location.state` / cache.
- `loadScoreboardTeams` (critical queue).
- Realtime подписка **отложена** (~8 с).

### `AdminPanel` / `GameEditor`

- CRUD игр и вопросов; `select('*')` в ряде мест (техдолг IMP-TD-001).
- Загрузка медиа вопросов → `question-media`.

### `AdminScoreboard`

- Poll + Realtime; тяжёлые запросы (оптимизировать в спринте 1).

## Модули `src/lib/` (справочник)

| Файл | Назначение |
|------|------------|
| `supabase.ts` | Клиент + fetch queue, таймаут, retry, приоритеты URL |
| `requestQueue.ts` | `enqueueCritical`, `enqueueBackground`, `enqueueSupabaseFetch` |
| `gameRealtime.ts` | Hub Realtime + broadcast session/teams/score |
| `fetchGameState.ts` | GET `game_state` с coalesce/throttle |
| `fetchLobbyTeams.ts` | Список команд лобби (кэш, очередь) |
| `gameSessionControl.ts` | Старт/пауза/финиш/сброс; `restartGameSessionFromScratch` |
| `gameSessionState.ts` | Константы состояний, `lobbyEpoch`, `getGameStartedAt` |
| `adminTeams.ts` | Удаление команд (direct DELETE → edge fallback) |
| `resetGameProgress.ts` | Сброс ответов/очков без удаления команд |
| `participantAccess.ts` | Допуск регистрации, late-join, финиш-страница |
| `gamePlayCache.ts` | sessionStorage кэш игры/вопросов/teams (+ in-memory fallback) |
| `gameLookupCache.ts` | Кэш игры по коду |
| `gameSessionSnapshotCache.ts` | Last-known-good сессии |
| `saveAnswer.ts` | Insert ответа, retry, critical queue |
| `submitAutoAnswer.ts` | RPC `submit_auto_answer` |
| `pendingAnswerQueue.ts` | Очередь ответов при offline |
| `storageUpload.ts` | Upload аватаров/медиа |
| `teamScore.ts` | Оптимистичный счёт + фоновый UPDATE |
| `pendingAvatar.ts` | Буфер аватара до конца игры |
| `avatarAfterGame.ts` | Jitter + background upload |
| `teamRegister.ts` | Регистрация + `withTransientRetry` |
| `prefetchGameQuestions.ts` | Prefetch вопросов (in-flight dedupe) |
| `playerSession.ts` | Сессия игрока в storage |
| `finishNavigation.ts` | State финиш-страниц (sessionStorage) |
| `loadScoreboardTeams.ts` | Команды для табло |
| `revalidateGamePlay.ts` | Фоновое обновление кэша |
| `networkMutex.ts` | `isAnswerSaveInFlight` |
| `scoring.ts` | `calculateQuestionScore` |
| `compressImage.ts` | Сжатие аватара (HEIC fallback) |
| `builtinThemes.ts` | Встроенные темы |
| `clientLogCollector.ts` | DEV ring buffer → `/__client_logs` |
| `debugLog.ts` | DEV логи + `agentDebugLog` (сессия отладки) |
| `deleteGame.ts` | Удаление игры |

## Контексты

### `ThemeContext`

- Админ: темы из БД `themes`.
- Игрок: `builtinThemes` (без лишнего API на hot path).

## LocalStorage / SessionStorage

| Ключ | Данные |
|------|--------|
| `current_team` | `{ id, team_name, total_score, … }` |
| `quest_play_<CODE>` | `gamePlayCache` (sessionStorage) |
| `team_registration_time` | Время регистрации (playerSession) |

## Сборка и чанки

`npm run build` → `dist/`. Крупные vendor: supabase, xlsx, jspdf, html2canvas.

Рекомендация: не тянуть xlsx на player routes (будущий code-split).

## Соглашения кода

- Новая сетевая логика игрока → через `requestQueue`.
- Не блокировать UI ожиданием Storage после ответа.
- Узкие `.select('col1,col2')` вместо `*`.
- TypeScript strict; избегать `any` в новом коде.

## Связанные документы

- [API_AND_FLOWS.md](API_AND_FLOWS.md)
- [REALTIME_AND_NETWORKING.md](REALTIME_AND_NETWORKING.md)
- [STORAGE.md](STORAGE.md)
