# Руководство для AI-агентов (Quest Game)

Краткий онбординг перед любой задачей в репозитории `quest-game-github-archive`.

## Что это за проект

**Quest Game** (v1.2.16) — веб-платформа **командных квестов** на корпоративных мероприятиях: админ создаёт игру и вопросы, команды регистрируются по коду, проходят квест на телефонах (текст + медиа-ответы), табло и уведомления в реальном времени.

- **Стек:** React 18 + TypeScript + Vite + Tailwind; бэкенд — **Supabase** (Postgres, Storage, Realtime, Edge Functions).
- **Активный Supabase ref (пример):** `tvytsnnujaucoluoyvjq` (Frankfurt) — см. `.env.example`.
- **Не коммитить:** `.env`, секреты, `dist/`.

## Подключение нового агента

| Когда | Документ |
|-------|----------|
| Первый вход / новый агент | **[docs/AI_AGENT_PROMPTS_SHORT.md](docs/AI_AGENT_PROMPTS_SHORT.md)** §1 |
| Полный онбординг (опционально) | **[docs/AI_AGENT_ONBOARDING_PROMPT.md](docs/AI_AGENT_ONBOARDING_PROMPT.md)** |
| Каждые 1–2 ч / фокус + подчистка | **[docs/AI_AGENT_FOCUS_REMINDER.md](docs/AI_AGENT_FOCUS_REMINDER.md)** (PROMPTS_SHORT §2) |
| Конец сессии → новый агент | **[docs/AI_AGENT_HANDOFF_PROMPT.md](docs/AI_AGENT_HANDOFF_PROMPT.md)** (PROMPTS_SHORT §3) |
| Продолжение в том же чате | PROMPTS_SHORT §4 + **`gstack-context-restore`** |
| gstack (review, QA, handoff) | Project Rule `.cursor/rules/quest-game-gstack.mdc` + skills `~/.cursor/skills/gstack-*` |
| Установка gstack (Windows) | `scripts/install-gstack-cursor.ps1` + [CURSOR_SETUP_GUIDE.md](docs/CURSOR_SETUP_GUIDE.md) §7 |

## gstack (процесс, не домен)

Cursor Rule **`quest-game-gstack.mdc`** задаёт, когда вызывать gstack-skills. Домен Quest Game остаётся здесь и в `docs/`.

| Этап | Skill |
|------|--------|
| Старт / смена агента | `gstack-context-restore` |
| Перед push | `gstack-review` |
| Security (IMP-SEC-*) | `gstack-cso` |
| UI / игрок / табло | `gstack-qa` (`localhost:5173`) |
| Баг / сеть | `gstack-investigate` |
| Конец блока | `gstack-context-save` |

Подробная таблица — в `.cursor/rules/quest-game-gstack.mdc`.

## С чего начать

1. Прочитать **[docs/INDEX.md](docs/INDEX.md)** — полный каталог документов.
2. Для фич/багов в игроке: **[docs/API_AND_FLOWS.md](docs/API_AND_FLOWS.md)** + **[docs/REALTIME_AND_NETWORKING.md](docs/REALTIME_AND_NETWORKING.md)**.
3. Для БД/SQL: **[docs/DATABASE.md](docs/DATABASE.md)** + `docs/sql-migrations/`.
4. План работ: **[docs/ROADMAP.md](docs/ROADMAP.md)** (3 спринта).
5. Идеи «брать / не брать»: **[docs/IMPROVEMENTS_CATALOG.md](docs/IMPROVEMENTS_CATALOG.md)** — только по ID из каталога.

## Критические правила разработки

| Правило | Почему |
|---------|--------|
| Не добавлять параллельные Supabase-запросы на hot-path игрока | Один HTTP/2 к `*.supabase.co` → `ERR_CONNECTION_RESET`, зависания |
| **Два уровня очереди** в `requestQueue.ts`: `enqueueCritical` (логика 1+1) + `enqueueSupabaseFetch` (все HTTP через `supabase.ts`) | Critical не блокирует вложенные вызовы (`criticalDepth`); fetch — 4 desktop / 6 mobile слотов с приоритетами |
| При `criticalDepth > 0` — в fetch-очереди только priority ≥ 8 | Админ «Начать с нуля» не конкурирует с poll `teams` (priority 1) |
| Дедуп in-flight: `prefetchGameQuestions`, `fetchGameStateForGame`, `fetchLobbyTeams` | StrictMode / несколько экранов не шлют 5+ одинаковых GET |
| Аватар команды — **после игры** (`avatarAfterGame`, `pendingAvatar`), не в `saveAnswer` | Storage не конкурирует с `answers.insert` |
| DEV-логи: `collectClientLog` / `agentDebugLog` — только `import.meta.env.DEV` | См. [docs/DIAGNOSTICS.md](docs/DIAGNOSTICS.md); `debugLog` ещё требует `VITE_DEBUG_LOG=1` |
| Edge `delete-teams` — fallback; админка сначала **прямой DELETE** (RLS + Auth) | Edge 1 retry, таймаут 12s; см. `adminTeams.ts` |
| `npm run build` после существенных изменений | Проверка TypeScript |

### Git (по указанию владельца)

Агенты, подключённые по **[AI_AGENT_ONBOARDING_PROMPT.md](docs/AI_AGENT_ONBOARDING_PROMPT.md)**, **регулярно коммитят и пушат** прогресс (см. промпт). Иначе — коммит только по явной просьбе в чате.

## Ключевые пути

```
src/pages/          — маршруты (GamePlay, TeamRegister, AdminPanel, …)
src/lib/            — бизнес-логика (см. FRONTEND.md § src/lib)
src/components/     — UI (GameStateManager, GameControls, DiagnosticLogsPanel DEV)
docs/sql-migrations/ — SQL 001–015+
supabase/functions/ — Edge Functions (Deno)
scripts/            — e2e, migrate, measure-latency, test-game-session-state.mjs
diagnostic/         — client-logs.jsonl (DEV, gitignore), .gitkeep
vite-client-logs-plugin.ts — запись логов с браузера на диск в dev
```

### Модули стабильности (2026-06, Спринт 1)

| Модуль | Зачем |
|--------|--------|
| `requestQueue.ts` | `enqueueCritical`, `enqueueBackground`, `enqueueSupabaseFetch` |
| `supabase.ts` | Обёртка fetch: таймаут 45s, retry, приоритеты URL |
| `gameRealtime.ts` | Единый hub Realtime + broadcast `teams_changed` / `session_changed` |
| `fetchGameState.ts` | Coalesce + throttle GET `game_state` |
| `fetchLobbyTeams.ts` | Очередь + кэш списка команд лобби |
| `prefetchGameQuestions.ts` | In-flight dedupe одного GET `questions` на gameId |
| `gameSessionControl.ts` | Старт/пауза/финиш/«с нуля»; `restartGameSessionFromScratch` + retry |
| `adminTeams.ts` | Удаление команд (direct → edge fallback) |
| `participantAccess.ts` | Допуск регистрации/игры/финиша; grace late-join 2s |
| `pendingAnswerQueue.ts` | Очередь ответов при offline/сбое |
| `clientLogCollector.ts` | Ring buffer → `POST /__client_logs` (DEV) |

## Маршруты (игрок / админ)

| URL | Назначение |
|-----|------------|
| `/team/register` | Регистрация команды |
| `/game/:gameCode` | Прохождение квеста |
| `/scoreboard/:gameCode` | Табло игрока |
| `/scoreboard-admin/:gameCode` | Табло для проектора (админ) |
| `/admin/panel` | Админка |
| `/admin/game/:gameId/edit` | Редактор вопросов |

## Быстрые команды

```bash
npm run dev
npm run build
npm run db:migrate
node scripts/e2e-game-flow.mjs
node scripts/measure-latency.mjs <GAME_CODE>
```

## Известные узкие места (не ломать без плана)

- Масштаб 2–100 игроков: см. [docs/SCALING.md](docs/SCALING.md).
- Открытые баги/история: [docs/BUGS_FOUND.md](docs/BUGS_FOUND.md).
- RLS: IMP-SEC-001 применён для админа; anon — игровой поток. Детали: [docs/SECURITY.md](docs/SECURITY.md).
- **IMP-RT-003** (proposed): полностью единый канал Realtime на `game_id` — hub частично в `gameRealtime.ts`.
- Ручная проверка iPhone после изменений сети/очереди — обязательна (см. DIAGNOSTICS.md).

## Язык и стиль

- Документация и UI-тексты для пользователей — **русский**.
- Код: существующие соглашения (functional React, `src/lib` для логики).
- Минимальный diff; не рефакторить несвязанное.
