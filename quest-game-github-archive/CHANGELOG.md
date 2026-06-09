# Changelog

Все значимые изменения в проекте Quest Game документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
и этот проект следует [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.16] — 2026-06-08

### Добавлено
- `VITE_PUBLIC_URL` — QR и ссылки регистрации работают по LAN, не только localhost (P-001)
- `useGameFinishedRedirect` — авто-переход на табло после финиша при разрешённых результатах
- `docs/MANUAL_QA_CHECKLIST.md` — ручной QA с отметками тестировщика и ответами агента
- `scripts/security-smoke.mjs` — API-smoke для IMP-SEC без браузера

### Исправлено
- Сообщения админа доходят до всех команд; типы и poll/realtime в NotificationPopup (P-002)
- Аватары: отложенный upload, retry, broadcast после RPC — появляются на табло (P-003)
- PDF-экспорт с кириллицей (Roboto TTF) (P-005)
- Архив заездов: лимит списка, alert при ошибке финиша (P-008)
- Табло после финиша: очки, экран ожидания, блок прямого URL во время игры (P-010)
- Детализированное табло из админки: доступ Supabase Auth, без deadlock `enqueueCritical` (P-011, P-012)
- Удалённая команда сразу выходит из лобби на своём телефоне (P-009, P-013)
- GameControls: блок старта без вопросов; editor/admin fetch priorities

### Изменено
- `.gitignore`: вся папка `diagnostic/` локально (в git только `.gitkeep`)

## [1.2.15] — 2026-06-05

### Добавлено
- IMP-INF-004: Docker Compose self-host — `Dockerfile`, `docker-compose.yml`, nginx SPA, `docs/DOCKER_COMPOSE.md`

## [1.2.14] — 2026-06-05

### Добавлено
- IMP-DATA-001: архив заездов — таблица `event_archive`, автосохранение при «Завершить игру», история и CSV в AdminPanel

## [Unreleased] — Спринт 1 (стабильность сети)

### Исправлено
- IMP-LOG-007 / BUG_AUDIT C1: игрок возвращается в лобби после админского «Начать заново» (`restart_to_lobby`) — `updated_at` и `lobbyEpoch` в snapshot cache
- IMP-LOG-008 / BUG_AUDIT H2/H3: проверка доступа игрока при известной сессии (не только в лобби); сетевая ошибка — fail-closed и «Повторить»
- IMP-LOG-009 / H3: проверка доступа всегда с живым `game_state` (без кэша); повтор при входе в игру; индикатор связи в лобби
- IMP-LOG-010 / BUG_AUDIT H1: первый вопрос не пропускается при выходе из лобби с `timeLeft===0` (lobby-prefetch)
- IMP-LOG-011 / BUG_AUDIT H7: sync счёта игрока не обнуляет очки других команд в `teamsSnapshot`
- IMP-LOG-012 / BUG_AUDIT H4: `channelSendWithTimeout` очищает таймер после успешного broadcast (нет утечки/unhandled rejection)
- IMP-LOG-013 / BUG_AUDIT M7: таймаут broadcast send 6с на mobile, 1.5с на desktop
- IMP-LOG-014 / BUG_AUDIT H5: «Завершить игру» на `/host/` — export без deadlock в requestQueue
- IMP-RT-005 / BUG_AUDIT H6: poll-fallback табло 20с, postgres UPDATE на `teams`, список команд на HostView
- IMP-LOG-015 / BUG_AUDIT C2: generation-token в `fetchGameState` — force/invalidate не ломают coalesce
- IMP-LOG-016 / BUG_AUDIT M6: generation-token в `fetchLobbyTeams`; stale-while-revalidate lookup (60с)
- IMP-LOG-017 / BUG_AUDIT M1: full questions при старте игры — флаг `questionsLobbyOnly`, догруз hint/media
- IMP-LOG-018 / BUG_AUDIT M2: `advancingRef`/`isSubmittingRef` — таймер не skip'ит во время submit
- IMP-LOG-019 / BUG_AUDIT M4: кнопка «Обновить» без вопросов сбрасывает loading в `finally`
- IMP-LOG-020 / BUG_AUDIT M5: delete команд → `broadcastTeamsChanged`; delete игры через `enqueueCritical`
- IMP-RT-006 / BUG_AUDIT L1: broadcast без подписчиков — ephemeral канал, hub с refCount 0 не создаётся
- IMP-PERF-002 / BUG_AUDIT L2: priority buckets в `enqueueSupabaseFetch` — без sort на drain
- IMP-PERF-003 / BUG_AUDIT L3: escape starvation в critical — prio ≥ 6 после 5с ожидания
- IMP-TD-008 / BUG_AUDIT L5: явные поля в `.select()` (createGame, MessagePanel, SettingsManager)
- IMP-INF-010 / BUG_AUDIT L6: test Edge functions помечены dev-only, не в `edge:deploy`
- IMP-ST-004 / BUG_AUDIT L4: guard размера/MIME/magic bytes перед Storage upload (клиент + player-upload)

### Безопасность (миграция 018 + Edge deploy)
- IMP-SEC-007 / BUG_AUDIT S5: team session token — `register_team` выдаёт токен, `submit_auto_answer` и `verify_team_session` проверяют владельца
- IMP-SEC-008 / BUG_AUDIT S4: `increment_team_score` недоступен anon — только service_role / внутри RPC
- IMP-SEC-009: view `questions_player` без поля `answer` — эталон не уходит на клиент игрока
- IMP-SEC-010 / BUG_AUDIT S3: миграция 018 — убран anon UPDATE/INSERT на `teams`/`answers`/`team_scores`
- IMP-SEC-011 / BUG_AUDIT S2: `player-upload` — team session, whitelist bucket/path, лимит размера; `confirm-admin-email` — setup secret
- IMP-SEC-012 / BUG_AUDIT S1: `delete-game` / `delete-teams` — `verify_jwt` + проверка admin JWT внутри функции

### Добавлено
- DEV-диагностика: `clientLogCollector`, `vite-client-logs-plugin`, `DiagnosticLogsPanel`, `docs/DIAGNOSTICS.md`
- `fetchLobbyTeams`, `gameRealtime` hub, `pendingAnswerQueue`, coalesce `fetchGameState` / `prefetchGameQuestions`
- `scripts/test-game-session-state.mjs`, `scripts/qa-browser-inject.mjs`
- `gameLookupCache`, `playerFetchBoost`, `QUESTION_LOBBY_SELECT` / `fetchQuestionsFullForGame`

### Изменено
- IMP-INF-009 / BUG_AUDIT S7: `verify-schema-drift.mjs` — журнал 016–018, проверки `register_team`, `questions_player`; `00_run_all.sql` помечен deprecated
- `requestQueue`: `enqueueSupabaseFetch` 4/6 слотов, приоритеты URL, блок GET &lt;8 при critical, snapshot очереди при wait ≥3s
- `supabase.ts`: таймаут 45s, retry; player routes boost priority 9 для questions/games
- Админ «Начать с нуля»: `deleteTeamsAfterProgressReset`, `withTransientRetry`, `adminBusyRef`
- `GamePlay` / `TeamRegister` / `GameLobby` / `GameStateManager` — in-flight dedupe, UI spinner logs, lobby/light questions
- `GameControls`: poll 60s, coalesce teams/state, debounce 800ms
- `Home`: settings/logo не блокируют первый render; `Scoreboard` poll 20s; export — один fetch на все форматы
- Документация: AGENTS, REALTIME_AND_NETWORKING, FRONTEND, API_AND_FLOWS, BUGS_FOUND, OPERATIONS
- Промпты агентов v3: AI_AGENT_FOCUS_REMINDER (подчистка), AI_AGENT_HANDOFF_PROMPT, PROMPTS_SHORT §1–§3

## [Unreleased] — Спринт 3

### Добавлено
- IMP-LOG-001: серверный scoring — RPC `submit_auto_answer` (`013_submit_auto_answer.sql`), `answerGrading.ts`, `submitAutoAnswer.ts`
- IMP-RT-001: Realtime Broadcast для счёта — `gameRealtime.ts`, канал `game:{id}`, broadcast `score_update` после ответа
- IMP-PRD-002: AI-генерация вопросов — Edge `generate-questions` (Qwen / DeepSeek), панель в GameEditor, `generateQuestions.ts`
- `docs/TEST_BACKLOG.md` — чеклист отложенного ручного тестирования
- `npm run db:migrate:013` — только миграция серверного scoring; журнал `schema_migrations` в `apply-migrations.mjs`

### Изменено
- AdminScoreboard / PlayerScoreboard / ScoreboardDetailed: счёт через broadcast, postgres_changes только INSERT/DELETE команд
- `db:migrate`: пропуск уже применённых миграций; bootstrap для существующей БД (без повторного 001)
- `edge:deploy` / `verify-edge-functions`: добавлен `generate-questions`

## [Unreleased] — Спринт 2 (закрыт)

### Добавлено
- IMP-UX-001: комната ожидания — `GameLobby`, старт игры из AdminPanel (`current_state` waiting → playing)
- IMP-UX-002: QR и deep link на регистрацию — `/team/register?code=XXXX`, карточка QR в «Управление игрой»
- IMP-UX-003: экран ведущего — `/host/:gameCode` (код, QR, команды, старт/пауза для авторизованного админа)
- IMP-UX-004: PWA — `vite-plugin-pwa`, service worker, `icon.svg`, `manifest.webmanifest`
- IMP-UX-005: скрыть табло до финиша — флаг `games.settings.hide_scoreboard_until_finish`, чекбокс в GameEditor
- IMP-PRD-001: код игры 4–6 символов (буквы и цифры) — `gameAccessCode.ts`, валидация в редакторе
- IMP-PRD-005: дата создания в списке игр AdminPanel
- IMP-PRD-007: клонирование игры — новый заезд с редактируемым кодом, названием и темой (`cloneGame.ts`)

### Исправлено
- Синхронизация lobby → playing у игрока: Realtime для `game_state`, polling 2 с, устойчивый fetch состояния
- AdminPanel: защита от двойного создания игры, быстрое удаление (БД сразу, Storage в фоне), ошибки загрузки списка, проверка Supabase-сессии
- AdminPanel: единый источник списка игр; CollapsibleSection не дёргает `onOpen` на каждый ререндер
- Управление командами: прямой запрос без `requestQueue`, fallback удаления без Edge `delete-teams`
- AdminScoreboard / ScoreboardDetailed: realtime без утечек каналов, debounce, меньше REST (IMP-RT-002)

## [Unreleased] — Спринт 1 (закрыт)

### Добавлено
- RPC `increment_team_score` (миграция `010_increment_team_score.sql`)
- CI: `.github/workflows/ci.yml` (build + e2e на PR)
- Скрипты `npm run edge:deploy`, `npm run edge:verify`, `npm run cors:verify`
- Fallback upload через Edge `player-upload` в `storageUpload.ts`
- `src/lib/storagePaths.ts`, `src/lib/deleteGameStorage.ts` — очистка Storage при удалении игры
- Миграции `011_tighten_rls.sql`, `012_storage_delete_authenticated.sql`
- Runbook 429/rate limit в `docs/OPERATIONS.md`

### Изменено
- `teamScore.ts` — атомарный RPC вместо read-modify-write UPDATE
- Табло и экспорт: явные поля вместо `select('*')` (Scoreboard, AdminScoreboard, ScoreboardDetailed, exportData)
- Debug-скрипты: service role только из `.env`, без захардкоженных ключей
- Upload paths: префикс `{gameId}/` в answer-media, avatars, question-media (IMP-ST-003)
- `deleteGame` client fallback: best-effort очистка Storage перед CASCADE (IMP-DATA-003)
- Edge `delete-game`: list+delete по префиксу, `media_urls`, bucket avatars
- E2E: админ-шаги через `SUPABASE_SERVICE_ROLE_KEY`, счёт через RPC

### Инфраструктура
- Edge Functions `player-upload`, `delete-game` задеплоены на `tvytsnnujaucoluoyvjq` (ACTIVE)
- GitHub Actions e2e: secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## [1.2.13] - 2025-10-29

### 🚀 Добавлено
- **Полное удаление команд**: Создана Edge Function `delete-teams` для CASCADE удаления из всех связанных таблиц
- **Realtime синхронизация**: Добавлены Supabase subscriptions в PlayerScoreboard и AdminScoreboard
- **CASCADE правила БД**: Автоматическое удаление связанных данных при удалении команд
- **Конфигурация окружения**: Добавлен .env файл с переменными Supabase

### 🔧 Исправлено
- **Проблема удаления команд**: Команды теперь полностью удаляются из всех таблиц (teams, answers, message_reads, message_recipients, players)
- **Ошибка 405**: Заменен fetch на supabase.functions.invoke для корректных запросов к Edge Functions
- **Orphaned данные**: Устранена проблема с оставшимися данными в связанных таблицах
- **Синхронизация табло**: Заменен setInterval на realtime подписки для мгновенного обновления

### 🏗️ Изменено
- **TeamManagementManager.tsx**: Обновлена логика удаления команд для использования Edge Function
- **PlayerScoreboard.tsx**: Добавлена realtime подписка на изменения команд
- **AdminScoreboard.tsx**: Добавлена realtime подписка на изменения команд

## [1.2.12] - 2025-10-29

### 🔧 Исправлено
- **Частичное исправление удаления команд**: Первая попытка решения проблемы удаления

### ❌ Известные проблемы
- Ошибка 405 при удалении команд (исправлена в v1.2.13)

## [1.2.11] - 2025-10-29

### 🔧 Исправлено
- **Отображение результатов**: Исправлены fallback значения в CongratulationWithStats.tsx
  - Строка 176: `{game?.code || 'Квест'}`
  - Строка 193: `{team.name || 'Команда'}`
- **Валидация кодов игры**: Добавлена проверка длины 4-6 символов в GameEditor.tsx и Home.tsx
- **Дубликаты вопросов**: Использование Service Role Key для безопасного удаления в GameEditor.tsx
- **Валидация ответов**: Гибкая проверка массивов вариантов ответов
- **Отправка ответов**: Корректная обработка JSONB данных в GamePlay.tsx

### 🏗️ Изменено
- **GameEditor.tsx**: Улучшена система валидации и предотвращения дубликатов
- **GamePlay.tsx**: Исправлена обработка JSONB массивов при отправке ответов
- **Home.tsx**: Добавлена валидация длины кодов игры

## [1.2.10] - 2025-10-27

### 🚀 Добавлено
- **Система подсказок**: Настраиваемые подсказки для вопросов
- **Экспорт в Excel**: Функциональность выгрузки результатов
- **Мобильная адаптация**: Полная поддержка мобильных устройств

### 🔧 Исправлено
- **Система уведомлений**: Исправлена доставка сообщений командам
- **Загрузка медиа**: Улучшена стабильность загрузки файлов

## [1.2.9] - 2025-10-26

### 🚀 Добавлено
- **Темная тема**: Переключение между светлой и темной темами
- **Система администрирования**: Расширенная админ панель

### 🔧 Исправлено
- **RLS политики**: Настройка безопасности доступа к данным
- **Storage permissions**: Исправлены права доступа к файлам

## [1.2.8] - 2025-10-25

### 🚀 Добавлено
- **Realtime обновления**: Базовая реализация realtime функциональности
- **Система счета**: Автоматический подсчет очков с учетом времени

### 🔧 Исправлено
- **Регистрация команд**: Улучшена валидация данных при регистрации
- **Навигация**: Исправлена маршрутизация между страницами

## [1.0.0] - 2025-10-20

### 🎉 Первый релиз
- **Создание квестов**: Базовый редактор игр
- **Регистрация команд**: Система регистрации участников
- **Игровой процесс**: Основная логика прохождения квестов
- **Загрузка медиа**: Поддержка фото, видео, аудио файлов
- **Табло результатов**: Отображение результатов команд
- **Административная панель**: Базовое управление играми

### 🏗️ Техническая база
- **React 18** + **TypeScript**
- **Supabase** backend
- **Tailwind CSS** стилизация
- **Vite** сборка проекта

---

## Типы изменений
- `🎉` **Первый релиз** - первоначальный выпуск
- `🚀` **Добавлено** - новая функциональность
- `🔧` **Исправлено** - исправление ошибок
- `🏗️` **Изменено** - изменения в существующей функциональности
- `🗑️` **Удалено** - удаленная функциональность
- `🔒` **Безопасность** - исправления уязвимостей
- `❌` **Известные проблемы** - документированные проблемы