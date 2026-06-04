# Realtime и сеть

## Проблема HTTP/2 мультиплексирования

Браузер открывает **одно** соединение к `https://<ref>.supabase.co` для:

- PostgREST (`/rest/v1/...`)
- Storage (`/storage/v1/...`)
- Realtime (WebSocket поверх той же инфраструктуры)

Если в одной вкладке параллельно идут длинные запросы (аватар 5 MB + `answers.insert` + `teams.select` + revalidate), конкурирующие потоки HTTP/2 могут давать:

- `ERR_CONNECTION_RESET`
- `ERR_HTTP2_PING_FAILED`
- таймауты 30–50 с при «мгновенном» UI

**Решение в проекте:** очередь + отложенный аватар + кэш. См. [BUGS_FOUND.md](BUGS_FOUND.md).

## requestQueue

Файл: `src/lib/requestQueue.ts`.

| Очередь | Лимит | Примеры |
|---------|-------|---------|
| `criticalQueue` | 1 одновременно | insert answer, register, upload answer media, load scoreboard |
| `backgroundQueue` | 1, только если critical пуст | avatar, prefetch, notifications, team score update |

Background **не стартует**, пока в critical есть задачи или выполняется critical.

```typescript
enqueueCritical(() => supabase.from('answers').insert(...))
enqueueBackground(() => runPendingAvatarUpload())
```

## networkMutex

`setAnswerSaveInFlight(true)` на время insert — другие части UI могут избегать конфликтующих Storage upload.

## Realtime: где используется

| Компонент | Канал | Таблица | События |
|-----------|-------|---------|---------|
| `GameStateManager` | `game-state-${gameId}` | `game_state` | `*` filter game_id |
| `GameControls` | то же | `game_state` | pause UI админа |
| `PlayerScoreboard` | отложенный | `teams` | UPDATE (scores) |
| `AdminScoreboard` | + interval poll 5s | `teams` | тяжёлый refresh |

### Настройка Supabase

Database → Publications → `supabase_realtime` → включить `teams`, `answers`, `game_state`, `messages`, `team_scores`.

## Планируемое улучшение (спринт 3)

**Realtime Broadcast** вместо части `postgres_changes`:

```typescript
const channel = supabase.channel(`game:${gameId}`)
channel.send({ type: 'broadcast', event: 'score', payload: { teamId, score } })
```

Меньше нагрузки на replication при 100 подписчиках (IMP-RT-001).

## Масштаб 2–100 игроков

| Факт | Следствие |
|------|-----------|
| 100 браузеров = 100 соединений | Нормально для Supabase |
| 1 браузер ≠ 8 параллельных REST | Нужна очередь |
| 100 финишей одновременно | Jitter аватаров 0–15 с |
| Realtime connections limit | Отложить подписку табло |

Полная таблица: [SCALING.md](SCALING.md).

## Отладка сети

1. `node scripts/measure-latency.mjs <CODE>` — RTT Node без браузера.
2. DevTools → Network: фильтр `supabase.co`, смотреть waterfall.
3. `VITE_DEBUG_LOG=1` только локально — логи в `debugLog.ts`.

**Не включать** ingest на 127.0.0.1 в production build.

## Когда нужен отдельный WebSocket-сервер

Если появится режим «все на одном вопросе по сигналу ведущего» с таймером &lt; 1 с — см. IMP-ARC-001 (Socket.IO + Redis как у Buzzr/ClassQuiz).

Для текущего **асинхронного квеста** Supabase Realtime достаточен.

## Связанные документы

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [SCALING.md](SCALING.md)
