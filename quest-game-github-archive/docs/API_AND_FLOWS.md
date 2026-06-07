# API и потоки данных

Quest Game **не имеет собственного REST API**. Все операции — через **Supabase JS SDK** (PostgREST + Storage + Realtime + Auth).

## Клиент Supabase

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

Админ после логина использует ту же сессию Auth (JWT в заголовках).

## Таблица операций по сценариям

### Регистрация команды

| Шаг | Операция | Таблица / Bucket | Очередь |
|-----|----------|------------------|---------|
| 1 | `select` game by code | `games` | critical |
| 2 | `insert` team | `teams` | critical |
| 3 | navigate → `/game/:code` | — | — |
| 4 | prefetch questions | `questions` | background |
| 5 | optional avatar file | memory `pendingAvatar` | после игры |

### Прохождение вопроса

| Шаг | Операция | Таблица / Bucket | Очередь |
|-----|----------|------------------|---------|
| 1 | Показ вопроса | cache / `questions` | — |
| 2 | Upload медиа ответа | `answer-media` | critical |
| 3 | `insert` answer | `answers` | critical |
| 4 | Update score | `teams` | background |
| 5 | Revalidate cache | `questions`, `teams` | background |

### Пауза (админ)

| Шаг | Операция | Таблица |
|-----|----------|---------|
| 1 | upsert/update | `game_state` (`is_paused=true`) |
| 2 | Realtime event | клиенты `GamePlay` |

### Уведомление

| Шаг | Операция | Таблицы |
|-----|----------|---------|
| 1 | insert message | `messages` |
| 2 | recipients | `message_recipients` |
| 3 | player read | `message_reads` |

### Удаление игры

| Путь | Описание |
|------|----------|
| Edge `delete-game` | Storage cleanup + DELETE rows |
| `deleteGame.ts` fallback | DELETE `games` (CASCADE) |

### Админ: «Начать с нуля» (удалить все команды)

| Шаг | Операция | Модуль |
|-----|----------|--------|
| 1 | `resetGameProgress` — DELETE answers, reset scores | `resetGameProgress.ts` |
| 2 | `deleteTeamsAfterProgressReset` — DELETE players, teams | `adminTeams.ts` |
| 3 | `upsertGameStateForGame` → `waiting`, `{}` player_data | `gameSessionControl.ts` |
| 4 | `broadcastTeamsChanged` | `gameRealtime.ts` |

Всё в `enqueueCritical` + `withTransientRetry` (до 3×). UI: `GameControls.runAction`, `adminBusyRef` блокирует poll/reload.

### Админ: «Запустить заново» (команды остаются)

`restartGameSessionToLobby` — только `resetGameProgress` + `lobbyEpoch++`, без удаления команд.

## HTTP-очередь (все запросы)

Любой вызов `supabase.from(...)` проходит через `enqueueSupabaseFetch` (см. [REALTIME_AND_NETWORKING.md](REALTIME_AND_NETWORKING.md)). В таблицах выше «critical» = логическая очередь приложения; фактический HTTP ещё упорядочен по priority.

## Детальный поток: ответ с медиа

```
[GamePlay] пользователь нажимает «Ответить»
    │
    ├─► UI: следующий вопрос / финиш (optimistic)
    │
    ├─► uploadAnswerMediaQueued(file)  ──► Storage answer-media
    │         (enqueueCritical, retry 3)
    │
    ├─► saveAnswerToServer(payload)    ──► INSERT answers
    │         (enqueueCritical, retry 3)
    │
    ├─► bumpTeamScoreInBackground      ──► UPDATE teams.total_score
    │
    └─► pauseBackgroundRevalidate + prefetch (background)
```

`cancelActiveStorageUpload()` при новом insert — отмена устаревшего upload.

## Детальный поток: финиш и аватар

```
[GamePlay] последний вопрос
    │
    ├─► navigate → /congratulation или /scoreboard
    │
    └─► tryUploadAvatarAfterGame(teamId)
              │
              └─► setTimeout(jitter 0-15s)
                        └─► enqueueBackground → Storage avatars → UPDATE teams
```

## Детальный поток: табло игрока

```
[PlayerScoreboard] mount
    │
    ├─► render from location.state / gamePlayCache  (0 ms perceived)
    │
    ├─► loadScoreboardTeams()  (critical, узкий select)
    │
    └─► after 8s: supabase.channel postgres_changes on teams
```

## Auth API (админ)

| Действие | Метод SDK |
|----------|-----------|
| Login | `supabase.auth.signInWithPassword` |
| Logout | `supabase.auth.signOut` |
| Reset password | `resetPasswordForEmail` |

Создание админа: `node scripts/create_admin_script.js` (service role).

## Edge Functions (HTTP)

Вызываются с фронта или CLI, не PostgREST:

| Function | Метод | Тело |
|----------|-------|------|
| `player-upload` | POST | `{ file, bucket, fileName, mimeType }` base64 |
| `delete-game` | POST | `{ gameId }` |
| `delete-teams` | POST | team ids |

См. [EDGE_FUNCTIONS.md](EDGE_FUNCTIONS.md).

## Ошибки и поведение

| Симптом | Типичная причина | Где смотреть |
|---------|------------------|--------------|
| Insert 40+ s | Параллельные запросы на HTTP/2 | requestQueue, BUGS_FOUND |
| Storage failed | RLS / bucket / размер файла | STORAGE, Dashboard |
| 404 Edge | Function не задеплоена | EDGE_FUNCTIONS |
| Realtime не приходит | Publication выключена | SUPABASE_SETUP |

## Контракт `AnswerInsertPayload`

```typescript
{
  game_id: string
  team_id: string
  question_number: number
  answer: string[]
  media_urls: string[]
  is_correct: boolean
  points_earned: number
  time_spent: number
}
```

## Связанные документы

- [FRONTEND.md](FRONTEND.md)
- [REALTIME_AND_NETWORKING.md](REALTIME_AND_NETWORKING.md)
- [STORAGE.md](STORAGE.md)
