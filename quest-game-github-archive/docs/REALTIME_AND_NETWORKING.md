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

**Решение в проекте:** три слоя — логическая очередь, HTTP-очередь с приоритетами, дедуп/coalesce. См. [BUGS_FOUND.md](BUGS_FOUND.md).

---

## Слой 1: `enqueueCritical` / `enqueueBackground`

Файл: `src/lib/requestQueue.ts`.

| Очередь | Лимит | Примеры |
|---------|-------|---------|
| `criticalQueue` | 1 одновременно | регистрация, ответ, админ `runAction`, RPC `admin_set_session` / `admin_restart_from_scratch` |
| `backgroundQueue` | 1, только если critical пуст | аватар после игры, prefetch, уведомления |

**Reentrancy:** внутри выполняющейся critical-задачи `criticalDepth > 0` — вложенный `enqueueCritical` выполняется сразу (иначе deadlock: пауза → `upsertGameStateForGame` → второй critical).

```typescript
enqueueCritical(() => supabase.from('answers').insert(...))
enqueueBackground(() => runPendingAvatarUpload())
```

---

## Слой 2: `enqueueSupabaseFetch` (все HTTP)

Все запросы Supabase идут через кастомный `fetch` в `src/lib/supabase.ts` → `enqueueSupabaseFetch`.

| Параметр | Значение |
|----------|----------|
| Параллелизм | 4 (desktop) / **8 на `/admin`** / 6 (mobile) |
| Таймаут | 45 s на попытку |
| Retry | до 3× на `failed to fetch` / `connection reset`; **1×** для `/functions/v1/` |
| Сортировка | выше `priority` — раньше; при равенстве — FIFO по `enqueuedAt` |

### Приоритеты (`fetchPriority` в `supabase.ts`)

| Priority | Тип запроса |
|----------|-------------|
| 11 | RPC |
| 10 | POST/PATCH/DELETE |
| 9 | GET `game_state` |
| 8 | GET `games` |
| 7 | GET `questions` |
| 6 | GET `answers` |
| 5 | GET `teams` (прочие) |
| 1 | GET `teams` с `game_id=eq` (фоновый poll лобби) |
| 3 | остальные GET |

**Во время critical-сессии** (`criticalDepth > 0` или `criticalRunning > 0`): из очереди берутся только jobs с **priority ≥ 8**. Низкоприоритетные GET (команды, вопросы) ждут окончания админского batch.

---

## Слой 3: дедуп и throttle (hot-path)

| Модуль | Поведение |
|--------|-----------|
| `prefetchGameQuestions.ts` | Один in-flight GET `questions` на `gameId` |
| `fetchGameState.ts` | Coalesce + throttle 800 ms (desktop) / 1500 ms (mobile); `force` обходит throttle |
| `fetchLobbyTeams.ts` | Кэш + очередь; `invalidateLobbyTeamsCache` после админ «с нуля» |
| `gameLookupCache.ts` | Кэш lookup игры по коду |
| `gameSessionSnapshotCache.ts` | Last-known-good сессии при timeout |

---

## Realtime hub (`gameRealtime.ts`)

Центральный hub на игру вместо дублирующих каналов в каждом компоненте:

- `attachGameRealtime(gameId, { onSessionChanged, onTeamsChanged, onScoreUpdate })`
- Broadcast: `broadcastSessionChanged`, `broadcastTeamsChanged` после мутаций админа
- `GameStateManager`, `GameControls`, `GameLobby` подписываются через hub

**IMP-RT-003** (proposed): полностью один postgres channel на game — частично сделано.

### Где ещё Realtime

| Компонент | События |
|-----------|---------|
| `PlayerScoreboard` | broadcast score + отложенный postgres |
| `AdminScoreboard` | broadcast + interval (см. IMP-RT-002) |

### Настройка Supabase

Database → Publications → `supabase_realtime` → `teams`, `answers`, `game_state`, `messages`, `team_scores`.

---

## networkMutex

`setAnswerSaveInFlight(true)` на время insert — другие части UI избегают конфликтующих Storage upload.

---

## Админ: batch RPC и shared session

Миграция `017_admin_session_rpc.sql`:

| RPC | Заменяет |
|-----|----------|
| `admin_restart_from_scratch(game_id)` | reset + delete teams + upsert closed (1 HTTP) |
| `admin_set_session(game_id, action, admin_name)` | open/close/start/pause/resume/finish/restart_to_lobby |

Клиент: `gameSessionControl.ts` → RPC через `enqueueCritical`; fallback на REST если RPC недоступен.

Админка: `useGameSessionAdmin` + `GameSessionAdminContext` — один Realtime hub на `selectedGameId` для `GameControls` и `MessagePanel` (без poll 60s). `adminBusy` блокирует reload на время `runAction`; при `skipReload: true` UI обновляется из snapshot RPC.

---

## Масштаб 2–100 игроков

| Факт | Следствие |
|------|-----------|
| 100 браузеров = 100 соединений | Нормально для Supabase |
| 1 браузер ≠ 8 параллельных REST | Нужна очередь + приоритеты |
| 100 финишей одновременно | Jitter аватаров 0–15 s |
| Realtime connections limit | Hub + отложенная подписка табло |

Полная таблица: [SCALING.md](SCALING.md).

---

## Отладка сети

1. `node scripts/measure-latency.mjs <CODE>` — RTT Node без браузера.
2. DevTools → Network: фильтр `supabase.co`.
3. **DEV:** [DIAGNOSTICS.md](DIAGNOSTICS.md) — `diagnostic/client-logs.jsonl`, панель в AdminPanel.
4. `VITE_DEBUG_LOG=1` — дополнительные логи в `debugLog.ts`.

**Не включать** ingest на 127.0.0.1 в production build.

---

## Когда нужен отдельный WebSocket-сервер

Режим «все на одном вопросе по сигналу ведущего» с таймером &lt; 1 с — IMP-ARC-001 (Socket.IO + Redis).

Для текущего **асинхронного квеста** Supabase Realtime достаточен.

---

## Связанные документы

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [API_AND_FLOWS.md](API_AND_FLOWS.md)
- [DIAGNOSTICS.md](DIAGNOSTICS.md)
- [SCALING.md](SCALING.md)
