# Руководство для AI-агентов (Quest Game)

Краткий онбординг перед любой задачей в репозитории `quest-game-github-archive`.

## Что это за проект

**Quest Game** (v1.2.13) — веб-платформа **командных квестов** на корпоративных мероприятиях: админ создаёт игру и вопросы, команды регистрируются по коду, проходят квест на телефонах (текст + медиа-ответы), табло и уведомления в реальном времени.

- **Стек:** React 18 + TypeScript + Vite + Tailwind; бэкенд — **Supabase** (Postgres, Storage, Realtime, Edge Functions).
- **Активный Supabase ref (пример):** `tvytsnnujaucoluoyvjq` (Frankfurt) — см. `.env.example`.
- **Не коммитить:** `.env`, секреты, `dist/`.

## Подключение нового агента

| Когда | Документ |
|-------|----------|
| Первый вход / новый агент | **[docs/AI_AGENT_PROMPTS_SHORT.md](docs/AI_AGENT_PROMPTS_SHORT.md)** — короткий paste |
| Полный онбординг (опционально) | **[docs/AI_AGENT_ONBOARDING_PROMPT.md](docs/AI_AGENT_ONBOARDING_PROMPT.md)** |
| Смена агента в том же чате | paste «Handoff» из PROMPTS_SHORT + **`gstack-context-restore`** |
| Каждые 1–2 ч / агент «уплыл» | **[docs/AI_AGENT_FOCUS_REMINDER.md](docs/AI_AGENT_FOCUS_REMINDER.md)** |
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
| Использовать `enqueueCritical` / `enqueueBackground` из `src/lib/requestQueue.ts` | Уже внедрённая очередь 1+1 на вкладку |
| Аватар команды — **после игры** (`avatarAfterGame`, `pendingAvatar`), не в `saveAnswer` | Storage не конкурирует с `answers.insert` |
| `debugLog` только при `DEV && VITE_DEBUG_LOG=1` | Иначе лишний трафик |
| Не использовать `fetchWithRetry` на Supabase (удалён) | Зомби-запросы |
| Edge Functions `player-upload`, `delete-game` — **желательно задеплоить** | Сейчас часто 404, клиент fallback на прямой Storage |
| `npm run build` после существенных изменений | Проверка TypeScript |

### Git (по указанию владельца)

Агенты, подключённые по **[AI_AGENT_ONBOARDING_PROMPT.md](docs/AI_AGENT_ONBOARDING_PROMPT.md)**, **регулярно коммитят и пушат** прогресс (см. промпт). Иначе — коммит только по явной просьбе в чате.

## Ключевые пути

```
src/pages/          — маршруты (GamePlay, TeamRegister, AdminPanel, …)
src/lib/            — бизнес-логика (saveAnswer, gamePlayCache, teamScore, …)
src/components/     — UI (GameStateManager, NotificationPopup, …)
docs/sql-migrations/ — SQL 001–009
supabase/functions/ — Edge Functions (Deno)
scripts/            — e2e, migrate, measure-latency
```

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
- RLS сейчас permissive (`USING (true)`) — см. [docs/SECURITY.md](docs/SECURITY.md).

## Язык и стиль

- Документация и UI-тексты для пользователей — **русский**.
- Код: существующие соглашения (functional React, `src/lib` для логики).
- Минимальный diff; не рефакторить несвязанное.
