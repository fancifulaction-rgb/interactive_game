# Баги и статус (2026-06-07)

## Исправлено 2026-06-07 (BUG_AUDIT C1 — lobby regression)

| # | Проблема | Причина | Исправление |
|---|----------|---------|-------------|
| 36 | Игрок не возвращается в лобби после «Начать заново» | `shouldBlockLobbyRegression` блокировал любой переход playing→lobby, в т.ч. свежий `restart_to_lobby` | IMP-LOG-007: в snapshot — `updatedAtMs` + `lobbyEpoch`; регрессия разрешена, если серверное состояние новее |

Проверка: PC + 2 телефона в игре → админ «Начать заново» → все устройства в лобби ≤ poll-интервала.

Ручная проверка 2026-06-07 (QA038Q, PC + iPhone + Android + админ): все устройства вернулись в лобби после двух `restart_to_lobby`; в device jsonl нет `blocked lobby regression`, `lobbyEpoch` инкрементируется. Коммит: `2e9516e`.

## Исправлено 2026-06-07 (BUG_AUDIT H2/H3 — play access)

| # | Проблема | Причина | Исправление |
|---|----------|---------|-------------|
| 37 | Опоздавшая команда попадает в игру, если сессия уже `playing` | `getPlayAccessDenial` запускался только при `inLobby` | IMP-LOG-008: проверка при известной сессии (`!sessionUnknown`), экран ожидания до результата |
| 38 | Сетевая ошибка проверки доступа молча разрешала игру | `.catch` только логировал | IMP-LOG-008: `access_check_failed` + кнопка «Повторить», fail-closed |

Проверка: `npm run build`, `node scripts/e2e-game-flow.mjs`; ручной — открыть `/game/<code>` после старта с «чужой»/поздней сессией → отказ; симулировать offline при проверке → retry.

Ручная проверка 2026-06-07:
- **H2** (QA038Q, после старта): регистрация новой команды блокируется с текстом «Игра уже началась. Присоединиться к этой сессии больше нельзя.» — OK. Убран лишний DEV-блок диагностики на форме регистрации для ожидаемых отказов.
- **H3** (2× Android + iPhone): сеть отключали **во время игры** (вопросы уже в кэше) — офлайн-прохождение ожидаемо; `access check failed` в логах нет (начальная проверка уже прошла). Android после reconnect — OK; iPhone — краткий возврат в лобби, затем «Проверка доступа» и перезагрузка вопросов (stale `game_state` при восстановлении сети, отдельный follow-up).
- **H3 gap (2026-06-07 QA):** проверка проходила по кэшу `lastOk` после регистрации; офлайн в лобби + старт игры — зависание. **IMP-LOG-009:** `invalidateGameStateCache` + `force`, отдельная фаза lobby/playing, честный статус сети в `GameLobby`.
- **H3 verified (2026-06-07):** 3 устройства — лобби онлайн → авиарежим → «Нет связи с сервером»; после включения сети проверка доступа (фаза playing) проходит автоматически, вход в игру OK. Fail-экран при reconnect не требуется.

## Исправлено 2026-06-07 (BUG_AUDIT H1 — timer skip)

| # | Проблема | Исправление |
|---|----------|-------------|
| 39 | Первый вопрос мгновенно пропускался после старта (lobby-prefetch оставлял `timeLeft===0`) | IMP-LOG-010: `timerArmedRef`, инициализация `timeLeft` при prefetch и при входе в игру |

Проверка: очистить кэш / приватная вкладка → лобби (prefetch) → старт → первый вопрос виден полное время.

Ручная проверка 2026-06-07: первый вопрос не пропускается; одно мелькание при старте (экран «Проверка доступа» на фазе playing) — убрано: фоновая проверка после lobby.

## Исправлено 2026-06-07 (BUG_AUDIT H7 — team score cache)

| # | Проблема | Исправление |
|---|----------|-------------|
| 40 | `syncPlayerTeamScoreFromServer` ставил `total_score: 0` всем командам кроме своей в кэше | IMP-LOG-011: для чужих команд оставляем `t.total_score` |

Проверка: 2+ команды в лобби → ответ одной → в кэше/табло у второй команды очки не сбрасываются в 0.

Ручная проверка: **отложена** — см. `docs/TEST_BACKLOG.md` (BUG_AUDIT пакет).

## Исправлено 2026-06-07 (BUG_AUDIT H4 — broadcast timer leak)

| # | Проблема | Исправление |
|---|----------|-------------|
| 41 | `Promise.race` в `channelSendWithTimeout`: после успешного `send` таймер 1500мс всё равно reject'ил | IMP-LOG-012: `clearTimeout` в `finally` |

Проверка: частые `broadcastScoreUpdate` / ответы в игре — в консоли нет unhandled rejection через 1.5с после успешного send.

Ручная проверка: **отложена** — см. `docs/TEST_BACKLOG.md` (BUG_AUDIT пакет).

## Исправлено 2026-06-07 (admin + iPhone HTTP contention)

| # | Проблема | Исправление |
|---|----------|-------------|
| 31 | 4 параллельных GET `games` при регистрации | `gameLookupCache.fetchGameByCode` — in-flight dedupe + cache hit |
| 32 | StrictMode: 2× `loadGameData` + шторм questions | Module-level `loadGameDataInflight`; lobby vs full select |
| 33 | Админка «съедает» HTTP/2 канал | `GameControls`: coalesce loadTeams/state, poll 60s, debounce 800ms, skip teams poll после Realtime |
| 34 | iPhone: questions priority 7 ждали 45s в очереди | `playerFetchBoost` — priority 9 на player routes ~30s после navigate |
| 35 | Тяжёлый payload questions в лобби | `QUESTION_LOBBY_SELECT` для prefetch; `fetchQuestionsFullForGame` при старте игры |

Дополнительно (P1): Home — не блокирует render на settings; TeamManagement delete → `enqueueCritical`; Scoreboard poll 20s; `exportAllFormats` — один `loadExportData`.

DEV-логи: `sessionId` в jsonl, `ui.loading` / `register spinner end`, snapshot очереди при wait ≥3s.

## Исправлено 2026-06-07 (стабильность сети, очередь, документация)

| # | Проблема | Исправление |
|---|----------|-------------|
| 26 | iPhone: 5+ параллельных GET `questions` после старта | `prefetchGameQuestions` in-flight dedupe; GamePlay не дублирует `loadGameData` |
| 27 | «Начать с нуля» → ERR_CONNECTION_RESET | Меньше DELETE (`deleteTeamsAfterProgressReset`), fetch priority ≥8 при critical, `withTransientRetry` |
| 28 | Шторм GET `game_state` на poll | `fetchGameStateForGame` coalesce + throttle |
| 29 | Realtime: дубли каналов | Hub `gameRealtime.ts` + `attachGameRealtime` |
| 30 | Отладка iPhone без DevTools | DEV: `clientLogCollector`, `DiagnosticLogsPanel`, `diagnostic/client-logs.jsonl` |

Коммит: `b67a523` — `fix(stability): mobile fetch queue, admin scratch reset, and session coalescing`.

Проверка: `npm run build`, `node scripts/e2e-game-flow.mjs`, ручной чеклист iPhone в [DIAGNOSTICS.md](DIAGNOSTICS.md).

## Исправлено 2026-06-06 (скорость iOS + «Начать с нуля»)

| # | Проблема | Исправление |
|---|----------|-------------|
| 24 | iPhone: долгий вход в лобби | Регистрация: `games` + `game_state` одним запросом; `setLoading(false)` до navigate; GamePlay — фоновый revalidate при кэше |
| 25 | «Мёртвые» команды после тестов | Кнопка **«Начать с нуля»** → `restartGameSessionFromScratch` (сброс прогресса + удаление всех команд) |

## Исправлено 2026-06-06 (iOS лобби и счётчик команд)

| # | Проблема | Причина | Исправление |
|---|----------|---------|-------------|
| 20 | iPhone: регистрация «зависает», лобби не открывается | `GamePlay` ждал `sessionKnown`; при ошибке/таймауте `game_state` `GameStateManager` не вызывал `onSessionChange` | Лобби без ожидания session; fallback `apply(null)` + таймаут 6 с в `GameStateManager` |
| 21 | Разное число команд в админке и у игроков | `GameLobby` молча оставлял `[]` при ошибке fetch; не слушал broadcast `teams_changed` | Retry загрузки, seed из `gamePlayCache`, `subscribeGameRealtime`; админ — тот же broadcast |
| 22 | iOS HEIC-аватар | `createImageBitmap` не декодирует HEIC | Fallback через `<img>` + canvas в `compressImage.ts` |
| 23 | sessionStorage на iOS Private Browsing | `setItem` бросает исключение | In-memory fallback в `gamePlayCache.ts` |

## Исправлено 2026-06-06 (регистрация команды)

| # | Проблема | Причина | Исправление |
|---|----------|---------|-------------|
| 19 | Регистрация команды «зависает» на «Регистрация...» | Регрессия: `await prefetchQuestionsForGame` **до** `navigate`; три отдельных `enqueueCritical` (lookup → denial → insert) | Один `enqueueCritical` на весь flow; navigate сразу после insert; prefetch через `enqueueBackground` |

## Исправлено 2026-06-06 (пауза игры и управление сессией)

| # | Проблема | Причина | Исправление |
|---|----------|---------|-------------|
| 15 | «Приостановить» / «Завершить» / «Запустить заново» зависают в админке | **Deadlock:** `GameControls.runAction` → `enqueueCritical` → `pauseGameSession` → `upsertGameStateForGame` → второй `enqueueCritical` (очередь serial=1) | Reentrant `enqueueCritical` (`criticalDepth`) в `requestQueue.ts` |
| 16 | Удаление игры конкурирует с игроками | `deleteGameCompletely` без очереди | `GameControls` → `enqueueCritical` при удалении |
| 17 | Удаление вопроса в редакторе вне очереди | Прямой `supabase.delete` | `GameEditor` → `enqueueCritical` |
| 18 | Шторм запросов teams при Realtime | Каждое событие → `loadTeams()` | Debounce 400 ms в `GameControls` |

Проверка: `node scripts/test-critical-reentrant.mjs`, `node scripts/test-game-session-control.mjs`, `node scripts/qa-extended.mjs`.

## Исправлено 2026-06-06 (аудит данных и подвисания)

| # | Проблема | Причина | Исправление |
|---|----------|---------|-------------|
| 9 | Пустое детальное табло / экспорт | Чтение legacy-колонок `question_id`, `answer_text`, `score` | `ScoreboardDetailed.tsx`, `exportData.ts` → `question_number`, `answer`, `points_earned`, `time_spent` |
| 10 | `final_page_texts` 404 | Таблицы не было в миграциях | `015_final_page_texts_and_integrity.sql`; fallback в `FinalPageTextsManager` |
| 11 | Игра без `game_state` | `createGame` только warn при ошибке insert | fail-fast + rollback `games`; очередь `enqueueCritical` |
| 12 | GameControls конкурировали с другими запросами | `gameSessionControl` без очереди | `upsertGameStateForGame` через `enqueueCritical` |
| 13 | Журнал миграций ≠ схема | bootstrap 001–012 без SQL | `npm run db:verify-schema`, точечные `db:migrate:013/014/015` |
| 14 | Дубликаты ответов / несколько game_state | Нет UNIQUE | `015`: `answers_team_question_unique`, `game_state_game_id_unique` |

### Schema drift (верификация)

```bash
npm run db:verify-schema
```

REST-проверки: `answers` (новые колонки), `event_archive`, `final_page_texts`, RPC `submit_auto_answer`.  
Postgres pooler иногда обрывает длинную сессию (`Connection terminated unexpectedly`) — при зелёных REST-пробах схема считается OK.

После DDL: **Supabase Dashboard → Settings → API → Reload schema**.

## Исправлено в сессии 2026-06-04

| # | Проблема | Причина | Исправление |
|---|----------|---------|-------------|
| 1 | Кракозябры в названии seed-игры | `00_run_all.sql` в неверной кодировке | `007_fix_mojibake.sql`, правка UTF-8 в `00_run_all.sql` |
| 2 | Не удалялась игра | Edge Function `delete-game` не развёрнута (404) | `deleteGameCompletely()` с fallback DELETE CASCADE |
| 3 | Редактор игры: вечная загрузка / вопросы не сохранялись | UPDATE по старым id после DELETE; лишние проверки | Только INSERT после delete; batch insert |
| 4 | Регистрация команды зависала | Нет колонок `team_name`/`captain_name`; зависание на `player-upload` | Миграция `008`; Storage напрямую |
| 5 | Отправка ответа зависала | Схема `answers` не совпадала с кодом; `Failed to fetch` | Insert в поля `game_id`, `question_number`, `answer`, `points_earned` |
| 6 | Ошибка `admin_messages` в консоли | Таблицы нет, есть `messages` | `NotificationPopup` переведён на `messages` |
| 7 | `game_state` / пауза | Нет колонок `is_paused` | Миграция `009_game_state_pause.sql` |
| 8 | Формула очков не из настроек игры | Свой расчёт в `GamePlay` | `src/lib/scoring.ts` + `game.scoring` |

## Стабилизация загрузки (2026-06-04)

### Почему «один процесс мешает другому»

Все запросы идут на один хост `*.supabase.co` (REST + Storage + Realtime). Браузер мультиплексирует их в одно HTTP/2-соединение. Параллельные длинные запросы (Storage аватар + `answers.insert` + `games` + `teams`) дают `ERR_CONNECTION_RESET`, хотя канал в целом быстрый.

### Что сделано

| Компонент | Изменение |
|-----------|-----------|
| `src/lib/requestQueue.ts` | Очередь: 1 critical + 1 background |
| `src/lib/gamePlayCache.ts` | Кэш игры, вопросов, `teamsSnapshot` |
| `TeamRegister` | Navigate сразу после insert; prefetch в фоне |
| `saveAnswer.ts` | Critical queue; без Storage в finally |
| `pendingAvatar` / `avatarAfterGame` | Аватар только после игры (табло/поздравление) |
| `PlayerScoreboard` | state + cache; realtime через 8 с |
| `teamScore.ts` | localStorage + один UPDATE |
| `debugLog.ts` | Только при `VITE_DEBUG_LOG=1` |
| Удалён `fetchRetry.ts` | Не использовался |

### Масштаб 2–100 игроков

См. [SCALING.md](SCALING.md) — очередь на клиенте, jitter аватаров, retry Storage, разделение critical/background.

### Замер latency (Node vs браузер)

```bash
node scripts/measure-latency.mjs 26D4A6
```

Если Node &lt; 500 ms, а браузер тормозит — узкое место в параллельных запросах UI.

## Остаётся / окружение

| # | Проблема | Статус |
|---|----------|--------|
| A | `ERR_CONNECTION_RESET` / `Failed to fetch` к Supabase | Перегрузка HTTP/2 при параллельных запросах; очередь снижает риск. VPN/расширения Cursor |
| B | Edge Functions не развёрнуты | `delete-game`, `player-upload` — опционально `supabase functions deploy` |
| C | Медленная загрузка админки / сохранения | Было 5+ запросов на сохранение вопросов → сейчас 2 (delete + batch insert). Auth + большой JS-бандл |
| D | Realtime-подписки | Могут не работать без включения Replication в Dashboard |
| E | Storage upload сбрасывает соединение | Аватар отложен до финиша; таймаут 60 с |

## Автотест API

```bash
node scripts/e2e-game-flow.mjs
```

Проверяет: создание игры, batch вопросов, команду, ответ, `messages`, `game_state`.

После миграции `009` в Supabase SQL Editor при ошибке схемы: **Settings → API → Reload schema** (или подождать ~1 мин).

## Формула очков (текущая)

`calculateQuestionScore` в `src/lib/scoring.ts`:

- `P_base` — очки вопроса (`points` / `scoring.p_base`)
- × `k_diff` из настроек игры × коэффициент сложности (Легкий 0.85, Средний 1, Сложный 1.25)
- × `k_time` — бонус за оставшееся время
- × `k_fast` — если осталось ≥70% времени
- − сумма штрафов подсказок
- × множитель за частично правильный выбор (0.3 / 0.5 / 1)

Минимум **1** очко за полностью правильный ответ.
