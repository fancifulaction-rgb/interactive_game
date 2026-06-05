# Разработка

## Требования

- Node.js 18+
- npm
- Аккаунт Supabase + проект
- (Опционально) Supabase CLI для Edge Functions

## Первый запуск

```bash
cd quest-game-github-archive
cp .env.example .env
# Заполнить VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

URL: http://localhost:5173/

## Переменные окружения

Полная таблица — [ENV_AND_DATABASE.md](ENV_AND_DATABASE.md).

| Переменная | Назначение |
|------------|------------|
| `VITE_SUPABASE_URL` | URL проекта |
| `VITE_SUPABASE_ANON_KEY` | Публичный ключ (в bundle) |
| `SUPABASE_SERVICE_ROLE_KEY` | Скрипты, Edge |
| `DATABASE_URL` / `DATABASE_URL_SESSION_POOLER` | `apply-migrations.mjs` |
| `VITE_DEBUG_LOG=1` | Только DEV: отладочные логи в `debugLog.ts` |

## npm scripts

| Команда | Действие |
|---------|----------|
| `npm run dev` | install + Vite dev server |
| `npm run build` | tsc + production build |
| `npm run lint` | ESLint |
| `npm run preview` | Просмотр `dist/` |
| `npm run db:migrate` | SQL миграции |
| `npm run db:verify` | Проверка таблиц и buckets |
| `npm run db:test-connection` | Postgres connect |
| `npm run db:storage` | SQL 006 buckets |
| `npm run docker:up` | Self-host: build + `docker compose up -d` |
| `npm run docker:down` | Остановить compose |

## Скрипты `scripts/`

| Скрипт | Использование |
|--------|---------------|
| `apply-migrations.mjs` | Применить миграции к Postgres |
| `create_admin_script.js` | Создать admin@quest.game |
| `e2e-game-flow.mjs` | Автотест: игра → команда → ответ |
| `measure-latency.mjs <CODE>` | RTT Supabase из Node |
| `verify-db.mjs` | Sanity check схемы |
| `test-db-connection.mjs` | Подключение к БД |
| `run-sql.mjs` | Выполнить один SQL файл |

## Типичный workflow разработчика

1. Ветка `feature/<name>`.
2. Изменения в `src/lib` для логики, `src/pages` для UI.
3. `npm run build` — без ошибок TS.
4. Ручной тест: register → 2 вопроса → scoreboard.
5. Обновить docs при изменении схемы/потоков.
6. PR (commit только по просьбе владельца).

## Отладка зависаний

1. `measure-latency.mjs` — если Node быстрый, проблема в браузере/параллели.
2. DevTools Network — waterfall `supabase.co`.
3. Убедиться, что новый код использует `enqueueCritical`.
4. Не включать `VITE_DEBUG_LOG` без нужды.

## Supabase локально

Проект использует **облачный** Supabase. Локальный `supabase start` опционален, не описан в основном flow.

## Стиль и линтер

См. [CONTRIBUTING.md](../CONTRIBUTING.md).

## Документация при изменениях

| Изменили | Обновить |
|----------|----------|
| Таблицу / миграцию | DATABASE.md, sql-migrations |
| Новый маршрут | FRONTEND.md, API_AND_FLOWS.md |
| Upload / bucket | STORAGE.md |
| Edge function | EDGE_FUNCTIONS.md |
| Новую фичу из каталога | IMPROVEMENTS_CATALOG (статус), CHANGELOG |

## Связанные документы

- [TESTING.md](TESTING.md)
- [AGENTS.md](../AGENTS.md)
