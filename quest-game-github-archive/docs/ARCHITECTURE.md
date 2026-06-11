# Архитектура Quest Game

## Обзор

```
┌─────────────────────────────────────────────────────────────────┐
│                        Браузеры на мероприятии                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Админ (PC)   │  │ Команды (N)  │  │ Проектор (табло)         │ │
│  │ AdminPanel   │  │ GamePlay     │  │ AdminScoreboard          │ │
│  │ GameEditor   │  │ TeamRegister │  │ PlayerScoreboard         │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘ │
│         │                 │                        │               │
│         └─────────────────┼────────────────────────┘               │
│                           │ HTTPS (HTTP/2 мультиплекс)               │
└───────────────────────────┼─────────────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────────┐
│                     Supabase Project (Frankfurt)                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌───────────┐ │
│  │ PostgREST   │  │ Realtime     │  │ Storage    │  │ Auth      │ │
│  │ (Postgres)  │  │ (WebSocket)  │  │ (S3-like)  │  │ (admins)  │ │
│  └─────────────┘  └──────────────┘  └────────────┘  └───────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Edge Functions (Deno): player-upload, delete-game, …         │ │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

**Паттерн:** SPA (Vite + React) напрямую обращается к Supabase SDK. Отдельного Node/WebSocket-сервера приложения **нет** (в отличие от Buzzr, ClassQuiz, Quizz).

## Слои приложения

| Слой | Расположение | Ответственность |
|------|--------------|-----------------|
| Presentation | `src/pages/`, `src/components/` | UI, роутинг, локальный state |
| Application | `src/lib/*.ts` | Очереди, кэш, сохранение ответов, счёт, загрузки |
| Integration | `src/lib/supabase.ts` | Клиент `@supabase/supabase-js` |
| Data | Postgres + Storage | Персистентность |
| Serverless | `supabase/functions/` | Операции с service role (опционально) |

## Ключевые архитектурные решения

### 1. Очередь запросов на вкладку (`requestQueue`)

**Проблема:** REST + Storage + Realtime на одном хосте `*.supabase.co` → одно HTTP/2-соединение; параллельные длинные запросы вызывают `ERR_CONNECTION_RESET` и таймауты 40–50 с.

**Решение:** В каждой вкладке максимум **1 critical** и **1 background** задача одновременно. Critical: регистрация, insert ответа, загрузка медиа ответа, refresh табло. Background: аватар, prefetch, revalidate, уведомления.

См. [REALTIME_AND_NETWORKING.md](REALTIME_AND_NETWORKING.md).

### 2. Кэш игровой сессии (`gamePlayCache`)

In-memory + `sessionStorage` для кода игры: метаданные игры, вопросы, снимок команд (`teamsSnapshot`). Снижает повторные `select` при навигации и на табло.

### 3. Оптимистичный UX

- Ответ: UI переходит к следующему вопросу до завершения `answers.insert`.
- Счёт: `localStorage` + `mergeTeamScoreInCache`, затем один `UPDATE teams` в фоне.
- Регистрация: `navigate` после INSERT команды; prefetch вопросов в background.

### 4. Отложенная загрузка аватара

Аватар **не** загружается в `saveAnswer`. Файл хранится в памяти (`pendingAvatar`), upload после игры с jitter по `teamId` (`avatarAfterGame`).

### 5. Realtime

`postgres_changes` на `game_state`, `teams` (табло). Подписка табло игрока откладывается ~8 с. Fallback poll табло — **20 с** (`SCOREBOARD_POLL_FALLBACK_MS` в `gameRealtime.ts`); основной путь — Broadcast (IMP-RT-001/002).

## Потоки данных (упрощённо)

### Регистрация

`TeamRegister` → `enqueueCritical` → `games` by code → `teams.insert` → navigate → `enqueueBackground` → prefetch questions + cache.

### Ответ на вопрос

`GamePlay` → validate → optimistic UI → `uploadAnswerMediaQueued` (critical) → `saveAnswerToServer` (critical) → `bumpTeamScoreInBackground` → `revalidateGamePlay` (background).

### Пауза

Админ → `game_state` UPDATE → Realtime → `GameStateManager` на клиенте игрока.

## Масштабирование

| Уровень | Механизм |
|---------|----------|
| 1 вкладка | `requestQueue`, `networkMutex` |
| N игроков | N независимых браузеров → N соединений (норма для Supabase) |
| Пик Storage | jitter аватаров, retry ×3 |
| План Supabase | Лимиты API/Storage/Realtime — вне кода |

Подробно: [SCALING.md](SCALING.md).

## Что сознательно не используется

| Технология | Причина отказа (сейчас) |
|------------|-------------------------|
| Socket.IO + Redis | Достаточно Supabase для асинхронного квеста; усложнение деплоя |
| Отдельный BFF/API | Весь CRUD через Supabase SDK |
| SSR | Static SPA на Vite |

При синхронных раундах «как Kahoot» — см. IMP-ARC-001 в каталоге.

## Зависимости фронта (основные)

- `react`, `react-router-dom`
- `@supabase/supabase-js`
- `@radix-ui/*`, `tailwindcss`
- `xlsx`, `jspdf` — экспорт

## Эволюция (ROADMAP)

Спринт 1: Edge Functions + RPC счёта + узкие SELECT.  
Спринт 2: комната ожидания, экран ведущего, PWA.  
Спринт 3: Realtime Broadcast, AI-вопросы.

См. [ROADMAP.md](ROADMAP.md).

## Связанные документы

- [FRONTEND.md](FRONTEND.md)
- [DATABASE.md](DATABASE.md)
- [EDGE_FUNCTIONS.md](EDGE_FUNCTIONS.md)
