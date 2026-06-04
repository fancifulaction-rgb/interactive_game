# Руководство для AI-агентов (Quest Game)

Краткий онбординг перед любой задачей в репозитории `quest-game-github-archive`.

## Что это за проект

**Quest Game** (v1.2.13) — веб-платформа **командных квестов** на корпоративных мероприятиях: админ создаёт игру и вопросы, команды регистрируются по коду, проходят квест на телефонах (текст + медиа-ответы), табло и уведомления в реальном времени.

- **Стек:** React 18 + TypeScript + Vite + Tailwind; бэкенд — **Supabase** (Postgres, Storage, Realtime, Edge Functions).
- **Активный Supabase ref (пример):** `tvytsnnujaucoluoyvjq` (Frankfurt) — см. `.env.example`.
- **Не коммитить:** `.env`, секреты, `dist/`.

## Подключение нового агента

Полный промпт для копирования в новый чат: **[docs/AI_AGENT_ONBOARDING_PROMPT.md](docs/AI_AGENT_ONBOARDING_PROMPT.md)**.

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
