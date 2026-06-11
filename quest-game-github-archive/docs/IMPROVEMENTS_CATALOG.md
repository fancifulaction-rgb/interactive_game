# Каталог улучшений Quest Game

Нумерованный реестр идей для принятия решений: **брать в разработку** или **отклонить**.  
При работе ссылайтесь на ID (например: «реализуем IMP-UX-001»).

**Статус по умолчанию:** `proposed`, если не указано иное.

**Спринты:** [ROADMAP.md](ROADMAP.md).

---

## Как пользоваться

1. Обсуждаете фичу → находите ID или добавляете новый в конец категории.
2. Решение «берём» → статус `accepted`, привязка к спринту в ROADMAP.
3. Реализовали → `done` + CHANGELOG.
4. Не нужно → `rejected` + причина в примечании.

---

## A. Инфраструктура и масштабирование (IMP-INF)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-INF-001 | Deploy `player-upload` | Edge upload с service role, меньше сбоев RLS | Buzzr, Zappy | 1 | done |
| IMP-INF-002 | Deploy `delete-game` | Удаление игры + Storage без сирот | DATA_LIFECYCLE | 1 | done |
| IMP-INF-003 | RPC `increment_team_score` | Атомарный UPDATE счёта в Postgres | Quizz, best practice | 1 | done |
| IMP-INF-004 | Docker Compose self-host | `docker compose up` — nginx + dist, `.env.docker.example`, [DOCKER_COMPOSE.md](DOCKER_COMPOSE.md) | Quizz, ClassQuiz | 3 | done |
| IMP-INF-005 | CI build + tests | GHA: `test:unit`, `build`, Playwright E2E, `e2e-game-flow.mjs` | Standard | 1 | done |
| IMP-INF-006 | Load test 20–100 VU | k6/Artillery, отчёт LOAD_TEST | QuizLive scale | 3 | proposed |
| IMP-INF-007 | CDN / Image Transform | Supabase transform или Cloudflare перед Storage | Production | 3 | proposed |
| IMP-INF-008 | Мониторинг 429/reset | Алерты Supabase Dashboard + runbook | Operations | 1 | done |

---

## B. Realtime и табло (IMP-RT)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-RT-001 | Realtime Broadcast для счёта | `channel.send` вместо части postgres_changes | Supabase docs | 3 | done |
| IMP-RT-002 | Убрать poll 5s AdminScoreboard | Снизить REST при проекторе | Внутренний техдолг | 3 | done |
| IMP-RT-003 | Единый канал на game_id | Один channel/game для state+score | Architecture | 3 | proposed |
| IMP-RT-004 | Отложенный Realtime 8s → настройка | Флаг в settings игры | PlayerScoreboard | — | proposed |
| IMP-RT-005 | Poll-fallback табло | 20с REST + postgres UPDATE teams; HostView список команд | BUG_AUDIT_HANDOFF H6 | 1 | done |
| IMP-RT-006 | Ephemeral publish channel | Broadcast без orphan hub (refCount 0) | BUG_AUDIT_HANDOFF L1 | 1 | done |

---

## C. Игровая логика и честность (IMP-LOG)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-LOG-001 | Серверный scoring для авто-вопросов | RPC `submit_auto_answer`: answer+time+hints; сервер считает points | QuizLive SCORING | 3 | done |
| IMP-LOG-002 | Speed-bonus режим (опционально) | 500 + бонус за скорость + streak | Quizz | — | proposed |
| IMP-LOG-003 | Tie-aware ranking на табло | 1-2-2-4 как QuizLive | QuizLive | — | proposed |
| IMP-LOG-004 | Пересмотр штрафов подсказок | Исправить пропадающие hints | BACKLOG | — | proposed |
| IMP-LOG-005 | Пауза и итоговый счёт | Проверить формулу при is_paused | BACKLOG | — | proposed |
| IMP-LOG-006 | Множественные варианты ответов | Полная поддержка в UI/БД | guides/MULTIPLE_ANSWERS | — | proposed |
| IMP-LOG-007 | Возврат в лобби после restart_to_lobby | `shouldBlockLobbyRegression`: разрешать playing→lobby при новее `updated_at` или `lobbyEpoch++` | BUG_AUDIT_HANDOFF C1 | 1 | done |
| IMP-LOG-008 | Проверка доступа игрока вне лобби | `getPlayAccessDenial` при `sessionKnown`, fail-closed + retry при сетевой ошибке | BUG_AUDIT_HANDOFF H2/H3 | 1 | done |
| IMP-LOG-009 | Живая проверка доступа (без кэша) | `force` + invalidate `game_state`; повтор при lobby→playing; честный статус сети в лобби | BUG_AUDIT H3 QA | 1 | done |
| IMP-LOG-010 | Не скипать первый вопрос при timeLeft=0 | `timerArmedRef` + инициализация таймера при prefetch/входе в игру | BUG_AUDIT_HANDOFF H1 | 1 | done |
| IMP-LOG-011 | Счёт чужих команд в кэше игрока | `syncPlayerTeamScoreFromServer` сохраняет `t.total_score` для остальных | BUG_AUDIT_HANDOFF H7 | 1 | done |
| IMP-LOG-012 | Очистка таймера broadcast send | `clearTimeout` в `finally` у `channelSendWithTimeout` | BUG_AUDIT_HANDOFF H4 | 1 | done |
| IMP-LOG-013 | Таймаут broadcast на mobile | 6с на mobile UA, 1.5с на desktop | BUG_AUDIT_HANDOFF M7 | 1 | done |
| IMP-LOG-014 | Завершение игры на /host | `loadExportData` без `enqueueCritical`; boost на host-route | BUG_AUDIT_HANDOFF H5 | 1 | done |
| IMP-LOG-015 | Гонка force в fetchGameState | generation-token: inflight/lastOk только для актуального gen | BUG_AUDIT_HANDOFF C2 | 1 | done |
| IMP-LOG-016 | Гонки lobby teams + lookup cache | generation-token в `fetchLobbyTeams`; SWR в `gameLookupCache` | BUG_AUDIT_HANDOFF M6 | 1 | done |
| IMP-LOG-017 | Full questions после lobby prefetch | `questionsLobbyOnly` в кэше; при выходе из лобби — `fetchQuestionsFullForGame` | BUG_AUDIT_HANDOFF M1 | 1 | done |
| IMP-LOG-018 | Гонка таймера и submit | `advancingRef` + `isSubmittingRef` — один advance на вопрос | BUG_AUDIT_HANDOFF M2 | 1 | done |
| IMP-LOG-019 | Спиннер «Обновить» без вопросов | `reloadQuestions` → `finally { setLoading(false) }` | BUG_AUDIT_HANDOFF M4 | 1 | done |
| IMP-LOG-020 | Realtime после delete команд | `broadcastTeamsChanged` в TeamManagement; `enqueueCritical` delete game | BUG_AUDIT_HANDOFF M5 | 1 | done |
| IMP-LOG-021 | Двойные очки при fallback | Закрыто после IMP-SEC: только RPC, без client bump fallback | BUG_AUDIT_HANDOFF M3 | — | rejected |
| IMP-LOG-022 | Настраиваемая проверка ответов (`answer_grading`) | Пресеты + группы в `games.settings`; пайплайн normalize → text_match / MCQ → routing; fuzzy только для `answer_count=1`; спека: [guides/ANSWER_GRADING.md](guides/ANSWER_GRADING.md) | Продукт / Kahoot-LMS | post | done |

### IMP-LOG-022 — детализация (фазы)

| Фаза | Содержание | Статус |
|------|------------|--------|
| 0 | Спека `guides/ANSWER_GRADING.md`, решения владельца | done |
| 1 | punctuation, ё/е, fuzzy + penalty; UI пресеты; SQL + `gameSettings` | done |
| 2 | `grading_status`, hybrid/manual, badge табло; keywords, numeric; панель модерации | done |
| 3 | Очередь модерации, post-hoc, **resubmit penalty** | done |
| 4 | regex, jury, per-question override | done |

---

## D. UX на мероприятии (IMP-UX)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-UX-001 | Комната ожидания | Общий старт после регистрации всех | Zappy, BACKLOG | 2 | done |
| IMP-UX-002 | QR-код на регистрацию | `?code=XXXX` deep link | QuizLive | 2 | done |
| IMP-UX-003 | Экран ведущего (host view) | Проектор: код, QR, старт, пауза | TimesUp, QuizLive | 2 | done |
| IMP-UX-004 | PWA | manifest + SW, иконка на телефоне | QuizLive, BACKLOG | 2 | done |
| IMP-UX-005 | Скрыть табло до финиша | Настройка игры | BACKLOG | 2 | done |
| IMP-UX-006 | Финиш: только поздравление vs табло | `finish_page_type` расширить | BACKLOG | proposed | proposed |
| IMP-UX-007 | Улучшить табло (фото команд) | Крупные аватары, анимации | BACKLOG | proposed | proposed |
| IMP-UX-008 | Темы: фон без налезания на вопрос | Снег/анимации | BACKLOG | proposed | proposed |
| IMP-UX-009 | Уникальная ссылка регистрации (`join_token`) | QR и «Скопировать ссылку» → `/team/register?join=<uuid>`; lookup по `games.join_token`; новый токен при клоне | Чат 2026-06-10 | post | done |

---

## E. Продукт и контент (IMP-PRD)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-PRD-001 | Код игры 6 символов + буквы | Уникальность, читаемость | BACKLOG | 2 | done |
| IMP-PRD-002 | AI-генерация вопросов | Edge `generate-questions` + **Qwen или DeepSeek**; панель в GameEditor | Zappy, Buzzr | 3 | done |
| IMP-PRD-003 | Team chat в discussion phase | Приватный чат команды | Zappy | — | proposed |
| IMP-PRD-004 | Co-op mode (все ответили) | Режим гонки команд | Zappy | — | proposed |
| IMP-PRD-005 | Дата создания в списке игр | AdminPanel | BACKLOG | 2 | done |
| IMP-PRD-007 | Клонирование игры (новый заезд) | Новый код, название, тема; без команд/ответов | BACKLOG | 2 | done |
| IMP-PRD-006 | Упростить типы вопросов в редакторе | UX GameEditor | BACKLOG | proposed | proposed |
| IMP-PRD-011 | Логотип на приветственной | Home + settings | BACKLOG | proposed | proposed |
| IMP-PRD-008 | Расширить оповещения админа | Broadcast всем игрокам | BACKLOG | proposed | proposed |
| IMP-PRD-009 | Мульти-медиа вопросов и подсказок (этап 1) | `media_items` / `hints` JSONB; carousel в GamePlay; multi-upload + сжатие в редакторе; migrate 030–031 | Plan multi-media | 1 | done |
| IMP-PRD-010 | Мульти-медиа (этап 2): layout / timeline / live-cue | Композитор раскладки, таймлайн подсказок, пульт ведущего | Plan multi-media | post | done |

---

## F. Данные и жизненный цикл (IMP-DATA)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-DATA-001 | Архив сессии + CSV | `event_archive` при финише; история в AdminPanel + CSV | QuizLive | 3 | done |
| IMP-DATA-002 | Мягкое удаление games | `deleted_at` + retention | DATA_LIFECYCLE | proposed | proposed |
| IMP-DATA-003 | Очистка Storage в client fallback | deleteGame без Edge | DATA_LIFECYCLE | 1 | done |
| IMP-DATA-004 | Таблица event_archive | Агрегаты после игры | GDPR/отчёты | 3 | done |
| IMP-DATA-005 | Product events | `product_events` + RPC `track_product_events`; воронка регистрация→игра→финиш | Product analytics | 1 | done |

---

## G. Безопасность (IMP-SEC)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-SEC-001 | Ужесточить RLS | Игрок только своя game; админ auth | Security best practice | 1–2 | done |
| IMP-SEC-002 | Private buckets + signed URLs | Медиа не по guess path | Production | 3 | proposed |
| IMP-SEC-003 | Убрать service role с клиента | Только Edge/scripts | BACKLOG | 1 | done |
| IMP-SEC-004 | Смена пароля админа без plaintext | AdminPanel | BACKLOG | proposed | proposed |
| IMP-SEC-005 | Регистрация админа по email | Self-service | BACKLOG | proposed | proposed |
| IMP-SEC-006 | Документ PRIVACY_GDPR | EU корпоративы | Optional doc | proposed | proposed |
| IMP-SEC-007 | Team session token | `register_team` выдаёт токен; `submit_auto_answer` проверяет | BUG_AUDIT S5 | 1 | done |
| IMP-SEC-008 | Закрыть `increment_team_score` для anon | Только через `submit_auto_answer` / service_role | BUG_AUDIT S4 | 1 | done |
| IMP-SEC-009 | View `questions_player` | Эталон `answer` не на клиенте игрока | BUG_AUDIT S5 | 1 | done |
| IMP-SEC-010 | Убрать anon UPDATE/INSERT на teams/answers/scores | Миграция 018 | BUG_AUDIT S3 | 1 | done |
| IMP-SEC-011 | Защита `player-upload` + `confirm-admin-email` | Team session + bucket whitelist; setup secret | BUG_AUDIT S2 | 1 | done |
| IMP-SEC-012 | JWT на delete Edge | `verify_jwt` + `requireAuthenticatedUser` | BUG_AUDIT S1 | 1 | done |

---

## H. Storage и медиа (IMP-ST)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-ST-001 | Лимит длительности видео на клиенте | Сжатие перед upload (часть IMP-PRD-009: `compressQuestionMedia`, ffmpeg WASM lazy) | Scale | 1 | done |
| IMP-ST-002 | Серверное перекодирование видео | Edge ffmpeg (тяжело) | — | proposed | proposed |
| IMP-ST-003 | Префикс game_id во всех paths | Упрощение delete-game | DATA_LIFECYCLE | 1 | done |
| IMP-ST-004 | MIME/size guard upload | `uploadFileGuard.ts` + magic bytes в player-upload | BUG_AUDIT_HANDOFF L4 | 1 | done |

---

## P. Производительность клиента (IMP-PERF)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-PERF-001 | Admin+player HTTP contention | In-flight dedupe games/questions; player fetch boost; lighter lobby SELECT; coalesce admin poll | iPhone jsonl QA038Q | 1 | done |
| IMP-PERF-002 | Priority buckets fetch queue | Без sort на каждом drain в `requestQueue` | BUG_AUDIT_HANDOFF L2 | 1 | done |
| IMP-PERF-003 | Critical starvation escape | После 5с в critical разрешить fetch prio ≥ 6 | BUG_AUDIT_HANDOFF L3 | 1 | done |

---

## I. Техдолг и качество кода (IMP-TD)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-TD-001 | Заменить select('*') | AdminScoreboard, Scoreboard, export | Audit | 1 | done |
| IMP-TD-002 | Удалить debug #region agent log | ingest :7862 убран; `agentDebugLog` → `collectClientLog` | BUGS_FOUND | post | done |
| IMP-TD-003 | Playwright E2E | smoke + UI `register→lobby→play→scoreboard` (`e2e/full-game-flow.spec.ts`); API — `scripts/e2e-game-flow.mjs` | Testing | 1 | done |
| IMP-TD-004 | Code-split xlsx/jspdf | `exportData.ts` dynamic import; страницы player — lazy routes | Bundle size | 1 | done |
| IMP-TD-005 | Unit-тесты scoring.ts | `src/lib/scoring.test.ts`, `npm run test:unit` | Testing | 1 | done |
| IMP-TD-006 | Консолидация Edge setup-* | Один setup script | EDGE_FUNCTIONS | proposed | proposed |
| IMP-TD-008 | Явные поля admin `.select()` | createGame, MessagePanel, SettingsManager | BUG_AUDIT_HANDOFF L5 | 1 | done |
| IMP-INF-009 | Schema drift verify (S7) | `db:verify-schema` включает 016–018; `00_run_all.sql` deprecated | BUG_AUDIT_HANDOFF S7 | 1 | done |
| IMP-INF-010 | Test Edge dev-only | `supabase/functions/README.md` — test-* не в edge:deploy | BUG_AUDIT_HANDOFF L6 | 1 | done |

---

## J. Архитектура (долгосрочно) (IMP-ARC)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-ARC-001 | Socket.IO + Redis game server | Синхронные раунды как Kahoot | Buzzr, ClassQuiz | — | proposed |
| IMP-ARC-002 | Offline-first LAN режим | Без интернета | AirQuiz | — | proposed |
| IMP-ARC-003 | Meilisearch для поиска игр | ClassQuiz | — | proposed | proposed |
| IMP-ARC-004 | ADR: Supabase-only vs WS | Документ решения | Architecture | proposed | proposed |

---

## K. Админка и настройки (IMP-ADM)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-ADM-001 | Редактирование категории «Время» | settings UI | BACKLOG | proposed | proposed |
| IMP-ADM-002 | Общая пауза UI в GameControls | Уже частично есть | BACKLOG | proposed | proposed |
| IMP-ADM-003 | Kick игрока/команды | Как Buzzr presenter | Buzzr | proposed | proposed |
| IMP-ADM-004 | Скрытие вопросов без удаления | `is_hidden` на `questions`; только до старта игры, в редакторе; клон — полная копия | Чат 2026-06-10 | post | done |

### IMP-ADM-004 — скрытие вопросов (детализация)

**Цель:** админ может исключить вопрос из заезда, не удаляя строку из БД (черновики, сезонные варианты, A/B).

**Зафиксированные решения (2026-06-10):**

| Тема | Решение |
|------|---------|
| Когда можно скрывать | **Только до начала игры** (`game_state` в lobby/waiting/closed). В UI редактора — toggle «Скрыть / Показать»; после `start_game` — read-only (или скрытые остаются как есть, без новых переключений). |
| Где управлять | **Редактор вопросов** (`GameEditor`), не отдельный экран. Удаление (`handleDeleteQuestion`) остаётся отдельным действием. |
| Нумерация | Перед стартом: видимым вопросам `question_number` 1..N; скрытые в списке редактора, но не в player payload. Безопасно — ответов ещё нет. |
| Клон игры | **Полная копия** всех полей вопроса, включая `is_hidden` (`cloneGame.ts` — spread через `QUESTION_DB_SELECT`). |
| Сервер | Колонка `questions.is_hidden BOOLEAN NOT NULL DEFAULT false`; view `questions_player` — `WHERE NOT is_hidden`; `get_team_progress` / `submit_auto_answer` — только видимые (defense in depth). |

**Критерии приёмки (MVP):**

1. В редакторе: иконка глаза, badge «Скрыт», счётчик «N вопросов (M в игре, K скрытых)».
2. Сохранение через `saveGameQuestions` с ≥1 видимым вопросом; при активной игре — блокировка смены `is_hidden`.
3. Игрок не получает скрытые вопросы (prefetch / `questions_player`).
4. Прогресс и финиш — по числу **видимых** вопросов.
5. Клон переносит флаги скрытия 1:1.

**План реализации (ориентир):** миграция `027_question_hidden.sql` → клиент (editor, save, prefetch) → `cloneGame` (поле в select) → QA в `MANUAL_QA_CHECKLIST.md`.

**Оценка:** ~1–1.5 дня MVP.

---

## L. Уже реализовано (для истории)

| ID | Название | Статус |
|----|----------|--------|
| IMP-DONE-001 | requestQueue critical/background | done |
| IMP-DONE-002 | gamePlayCache + teamsSnapshot | done |
| IMP-DONE-003 | Аватар после игры + jitter | done |
| IMP-DONE-004 | Ранняя navigate при регистрации | done |
| IMP-DONE-005 | Оптимистичный ответ + saveAnswer queue | done |
| IMP-DONE-006 | debugLog за флагом VITE_DEBUG_LOG | done |
| IMP-DONE-007 | Удалён fetchWithRetry | done |
| IMP-DONE-008 | builtinThemes на player routes | done |
| IMP-DONE-009 | SCALING.md + measure-latency.mjs | done |

---

## M. Аудит перед релизом (2026-06-11)

Источник всех записей ниже: [AUDIT_PRERELEASE_2026-06-11.md](AUDIT_PRERELEASE_2026-06-11.md). P0 = `accepted`, P1/P2 = `proposed`. Детали/файлы/фиксы — в документе аудита.

### Безопасность (P0)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-SEC-013 | anon SELECT утекает `answer` | migrate `035`: REVOKE questions/players для anon; только `questions_player` | AUDIT 2026-06-11 | 5 | done |
| IMP-SEC-014 | Утечка ответов через scoreboard/grading RPC | migrate `038`: auth guard + REVOKE anon на get_scoreboard_answers, list_pending_answers, get_teams_pending_review, list_posthoc_answers | AUDIT 2026-06-11 | 5 | done |
| IMP-SEC-015 | Публичная загрузка в Storage | запись по anon-пути без team session/whitelist | AUDIT 2026-06-11 | 5 | accepted |
| IMP-SEC-016 | IDOR удаление/правка чужих игр | migrate `036` owner_id + RLS; Edge delete-game ownership | AUDIT 2026-06-11 | 5 | done |
| IMP-SEC-017 | `process_game_schedule` доступен anon | убрать grant anon, только доверенный контекст | AUDIT 2026-06-11 | 5 | accepted |
| IMP-SEC-018 | Перехват сессии команды | `recover_team_session` по угадываемым данным | AUDIT 2026-06-11 | 5 | accepted |
| IMP-SEC-019 | `join_token` не enforced | регистрация без валидного токена | AUDIT 2026-06-11 | 5 | accepted |
| IMP-SEC-020 | Edge `generate-questions` без auth/rate-limit | жжёт токены LLM | AUDIT 2026-06-11 | 5 | accepted |
| IMP-SEC-021 | git-tracked `alternative-upload` | незащищённый upload-путь, удалить | AUDIT 2026-06-11 | 5 | accepted |
| IMP-SEC-022 | Захардкоженные JWT в репо | удалены root debug-скрипты; ключи старого проекта, не текущего prod | AUDIT 2026-06-11 | 5 | done |
| IMP-SEC-023 | Обход админ-доступа через localStorage | серверная валидация сессии | AUDIT 2026-06-11 | 5 | accepted |
| IMP-SEC-024 | Лишние anon-grants и CORS `*` | ревизия GRANT/CORS, в SECURITY.md | AUDIT 2026-06-11 | 5 | accepted |

### БД / манифест (P0)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-INF-011 | `013_realtime_game_state.sql` не в манифесте | `037_realtime_game_state.sql` в manifest + облако | AUDIT 2026-06-11 | 5 | done |
| IMP-INF-012 | `006_storage_buckets` / `007_fix_mojibake` не в манифесте | 006/007 в manifest; 006 на облако | AUDIT 2026-06-11 | 5 | done |

### Hot-path / realtime (P0)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-LOG-023 | Ответ мимо `enqueueCritical` | `enqueueSubmitAutoAnswer` → `enqueueCritical` | AUDIT 2026-06-11 | 5 | done |
| IMP-RT-007 | broadcast-шторм `teams_changed` | убран `broadcastTeamsChanged` на каждый ответ | AUDIT 2026-06-11 | 5 | done |
| IMP-PERF-004 | Storage upload параллелит с REST | провести через очередь/мьютекс | AUDIT 2026-06-11 | 5 | accepted |

### Стабильность (P1)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-LOG-024 | Гонка `force` в fetchGameState | single-flight по gen-token | AUDIT 2026-06-11 | 5 | proposed |
| IMP-LOG-025 | Дубль prefetch вопросов | in-flight dedupe | AUDIT 2026-06-11 | 5 | proposed |
| IMP-LOG-026 | `pendingAnswerQueue` не чистится | TTL + дедуп + флаш через critical | AUDIT 2026-06-11 | 5 | proposed |
| IMP-LOG-027 | Нет фидбэка при сбое ответа | toast + ретрай-статус | AUDIT 2026-06-11 | 5 | proposed |
| IMP-LOG-028 | Затык finish/export в critical | boost на host-route | AUDIT 2026-06-11 | 5 | proposed |
| IMP-RT-008 | Медленный poll-fallback на mobile | адаптивный интервал | AUDIT 2026-06-11 | 5 | proposed |
| IMP-ST-005 | Медиа грузится не лениво | `preload="none"`/lazy | AUDIT 2026-06-11 | 5 | proposed |
| IMP-ADM-005 | Правка вопросов во время игры | блокировать при `playing` | AUDIT 2026-06-11 | 5 | proposed |
| IMP-ADM-006 | Старт без видимых вопросов | guard перед стартом | AUDIT 2026-06-11 | 5 | proposed |
| IMP-ADM-007 | Удаление участников не по `game_id` | строгий scope | AUDIT 2026-06-11 | 5 | proposed |
| IMP-ADM-008 | Клон без rollback | транзакция + фидбэк | AUDIT 2026-06-11 | 5 | proposed |
| IMP-DATA-006 | Нет проверки целостности архива | не удалять при неполном архиве | AUDIT 2026-06-11 | 5 | proposed |

### CI / гигиена (P2)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-TD-009 | Неполный strict TS | включить strict-флаги поэтапно | AUDIT 2026-06-11 | 5 | proposed |
| IMP-TD-010 | ffmpeg в основном бандле | строго dynamic import | AUDIT 2026-06-11 | 5 | proposed |
| IMP-TD-011 | Нет bootstrap-с-нуля в CI | smoke на чистой БД | AUDIT 2026-06-11 | 5 | proposed |
| IMP-TD-012 | Агрессивный кэш PWA | стратегия обновления SW + гейт прод | AUDIT 2026-06-11 | 5 | proposed |
| IMP-TD-013 | Мусор в репо/нет `engines` | чистка, `engines`, lazy diag-panel | AUDIT 2026-06-11 | 5 | proposed |
| IMP-INF-013 | Нет security-заголовков nginx | CSP, X-Content-Type-Options и т.д. | AUDIT 2026-06-11 | 5 | proposed |
| IMP-INF-014 | Нет CI-гейтов lint/verify/audit | добавить шаги в CI | AUDIT 2026-06-11 | 5 | proposed |
| IMP-INF-015 | CI ходит в реальный Supabase | изолированный стейдж | AUDIT 2026-06-11 | 5 | proposed |
| IMP-INF-016 | env: нет fail-fast/проброса VITE_* | валидация на старте + compose | AUDIT 2026-06-11 | 5 | proposed |
| IMP-INF-017 | Нет наблюдаемости | Sentry фронт + алерты 429/5xx | AUDIT 2026-06-11 | 5 | proposed |

---

## Добавление новой идеи

Шаблон:

```markdown
| IMP-XX-NNN | Краткое имя | Описание 1-2 предложения | Откуда идея | Спринт? | proposed |
```

Выберите категорию (INF, RT, LOG, UX, PRD, DATA, SEC, ST, TD, ARC, ADM).

---

*Версия каталога: 2026-06-11. Спринты 1–4 (код): закрыты. Актуальный план: [ROADMAP.md](ROADMAP.md) **Спринт 5** — P0 prod → P1 желательно → P2 бэклог.*
