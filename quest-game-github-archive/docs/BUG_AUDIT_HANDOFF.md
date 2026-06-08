# Bug Audit & Handoff — 2026-06-07

Документ для **нового ИИ-агента**, который будет исправлять баги. Аудит read-only по
всему `src/`, `supabase/functions/`, `docs/sql-migrations/`. Часть находок
**верифицирована** прямым чтением кода (помечено ✅), часть — **требует воспроизведения**
перед правкой (помечено 🔍).

## Как пользоваться этим документом

1. Работай строго по одному пункту = один IMP/коммит. Перед правкой заведи запись в
   `docs/IMPROVEMENTS_CATALOG.md` (формат IMP-*), сошлись на ID из таблиц ниже.
2. Соблюдай ЖЕЛЕЗНЫЕ ОГРАНИЧЕНИЯ (см. конец документа) — это hot-path на 50+ телефонах.
3. Каждую правку: минимальный diff → `npm run build` → при возможности
   `node scripts/e2e-game-flow.mjs` → ручная проверка из колонки «Проверка».
4. Security-пункты (раздел S) меняют RLS/Edge — это **миграции и деплой функций**, а не
   только клиент. Не применяй вслепую на прод: сначала согласуй с владельцем (могут
   сломать текущий публичный игровой поток без сессий команд).
5. Не выводить и не коммитить секреты (service role, ключи, пароли).

## Сводная приоритизация

> **Статус кода (2026-06-08):** все пункты C1–C2, H1–H7, M1–M2/M4–M7, S1–S7, L1–L6 реализованы в `main`.
> M3 закрыт как неактуальный (IMP-LOG-021 rejected). **Ручная верификация** — см. `docs/TEST_BACKLOG.md` § BUG_AUDIT Sprint 1.

| Приоритет | Что | Пункты |
|-----------|-----|--------|
| **P0 — корректность игры** | Ломает сессию/счёт прямо сейчас | C1, C2, H1, H2, H3 |
| **P0 — безопасность** | Доступ/подмена данных | S1, S2, S3, S4, S5 |
| **P1 — устойчивость** | Рассинхрон, зависания | H4, H5, H6, H7, M1–M5 |
| **P2 — гигиена/дрейф** | Документация, миграции, мелочи | S6, S7, L1–L6 |

---

## P0 — Корректность игры (логика)

### C1 ✅ Игрок не возвращается в лобби после «Запустить заново»
- **Файл:** `src/lib/gameSessionSnapshotCache.ts:23-29`; потребитель `src/components/GameStateManager.tsx` (`shouldBlockLobbyRegression`)
- **Серьёзность:** CRITICAL
- **Причина:** `shouldBlockLobbyRegression` блокирует ЛЮБОЙ переход `playing → lobby`, если
  `!next.isFinished`. После `restart_to_lobby` сервер шлёт `waiting`/lobby, но кэш игрока
  ещё «игра идёт» → `emitSession` молча выходит, игрок застревает на старом экране.
- **Фикс:** ввести монотонный `lobbyEpoch`/`updated_at`-сравнение. Разрешать регрессию в
  лобби, если входящее состояние новее закэшированного (по `updated_at`) либо если в
  `player_data` пришёл новый epoch рестарта. Минимально — параметр `nextUpdatedAt` в
  функцию и сравнение с сохранённым.
- **Проверка:** PC+2 телефона в игре → админ «Начать с нуля» → все три устройства должны
  вернуться в лобби ≤ poll-интервала.

### C2 ✅ Гонка `force` ломает coalesce/кэш состояния игры
- **Файл:** `src/lib/fetchGameState.ts:53-72`
- **Серьёзность:** CRITICAL (риск стабильности)
- **Причина:** при `force:true` поверх идущего запроса создаётся второй параллельный GET и
  перезаписывается `inflight`; `finally` старого запроса удаляет tracking нового, старый
  ответ может записать устаревший `lastOk` поверх свежего.
- **Фикс:** generation-token: `gen++` при invalidate/force; в `finally` удалять inflight
  только если токен совпадает; писать `lastOk` только для актуального поколения.
- **Проверка:** быстрый старт→пауза→resume на мобильном; состояние не «прыгает» назад.

---

## P0 — Безопасность (RLS / Edge)

> Эти пункты позволяют любому с anon-ключом (он в бандле) или знанием UUID менять чужие
> данные / удалять игры. Высокий приоритет, но менять прод-RLS только согласованно —
> текущий игровой поток работает без серверных сессий команд, ужесточение требует
> параллельной выдачи команде токена/RPC.

### S1 ✅ Edge `delete-game` и `delete-teams` без JWT
- **Файл:** `supabase/config.toml:13-14`; `supabase/functions/delete-game/index.ts`,
  `supabase/functions/delete-teams/index.ts`
- **Серьёзность:** CRITICAL
- **Причина:** `verify_jwt = false`, внутри нет проверки роли. Зная `gameId`/`team_ids`,
  любой может удалить игру/команды через service role.
- **Фикс:** `verify_jwt = true` + проверка admin-сессии внутри функции; service role
  использовать только после валидации JWT админа.

### S2 ✅ Edge `player-upload` / `confirm-admin-email` без авторизации
- **Файл:** `supabase/config.toml:10-11`; `supabase/functions/player-upload/index.ts`,
  `supabase/functions/confirm-admin-email/index.ts`
- **Серьёзность:** CRITICAL
- **Причина:** `player-upload` пишет в Storage с service role с произвольными
  `bucket/fileName/base64` (обход Storage RLS). `confirm-admin-email` патчит `auth.users`
  без проверки вызывающего и без фильтра по user id.
- **Фикс:** `verify_jwt = true`; whitelist bucket’ов; лимит размера; путь только
  `{gameId}/…`; `confirm-admin-email` убрать из прод или защитить секретом + конкретным
  `user_id`.

### S3 ✅ RLS: anon может UPDATE любую команду и любой ответ
- **Файл:** `docs/sql-migrations/011_tighten_rls.sql:18, 25` (и `team_scores` :42)
- **Серьёзность:** CRITICAL
- **Причина:** `teams_anon_update`/`answers_anon_update` = `USING(true) WITH CHECK(true)` —
  подмена `total_score`, `is_correct`, `points_earned`, имён/аватаров чужих команд.
- **Фикс:** убрать anon UPDATE на `teams`/`answers`/`team_scores`; счёт — только через
  `submit_auto_answer`/`increment_team_score` с проверкой владельца; аватар — через
  RPC/Edge с проверкой сессии команды.

### S4 ✅ RPC `increment_team_score` доступен anon без проверки вызывающего
- **Файл:** `docs/sql-migrations/010_increment_team_score.sql` (`GRANT ... TO anon`);
  вызов `src/lib/teamScore.ts:106-108`
- **Серьёзность:** CRITICAL
- **Причина:** `SECURITY DEFINER` без проверки identity + grant anon → произвольное
  начисление очков любой команде.
- **Фикс:** убрать grant для anon; вызывать только из `submit_auto_answer`; проверять
  session-token/HMAC команды.

### S5 ✅ `submit_auto_answer` не проверяет владельца `team_id`; утечка эталонных ответов
- **Файл:** `docs/sql-migrations/013_submit_auto_answer.sql`; RLS `011:11, 23`;
  `src/lib/prefetchGameQuestions.ts`
- **Серьёзность:** HIGH→CRITICAL
- **Причина:** RPC проверяет принадлежность команды игре, но не сессию игрока — зная UUID
  чужой команды, можно отвечать от её имени. Поле `answer` (эталон) уходит на клиент;
  anon может SELECT все ответы всех команд.
- **Фикс:** signed team-token (custom JWT claim/HMAC), сверять в RPC; view
  `questions_player` без `answer`; SELECT ответов ограничить своей командой/табло-view.

---

## P1 — Корректность и устойчивость

### H1 ✅ Авто-пропуск вопроса при `timeLeft === 0`
- **Файл:** `src/pages/GamePlay.tsx:357-361` (+ инициализация `timeLeft=0` :77; установка
  :147 в `applyPlayData`, :335 в reset-эффекте)
- **Серьёзность:** HIGH
- **Причина:** таймер при `timeLeft===0 && questions.length>0` вызывает
  `handleNextQuestion()`. Есть пути, где вопросы попадают в state без установки `timeLeft`
  (lobby-prefetch), и состояние выходит из лобби с `timeLeft===0` → мгновенный skip.
  ⚠️ Есть два места, выставляющих `timeLeft` (147/335) — **сначала воспроизведи** на
  холодном входе из лобби, чтобы подтвердить путь.
- **Фикс:** не вызывать `handleNextQuestion`, пока таймер не «вооружён» (флаг
  `timerArmedRef`/был хотя бы один тик); при появлении вопросов всегда инициализировать
  `timeLeft` из текущего вопроса.
- **Проверка:** холодный вход (очистить кэш) → старт игры → первый вопрос не должен
  пропускаться; resume с паузы при истёкшем времени не должен скипать без сохранения.

### H2 ✅ Проверка доступа выполняется только в лобби
- **Файл:** `src/pages/GamePlay.tsx:163-164` (`... || !inLobby) return`)
- **Серьёзность:** HIGH
- **Причина:** если при первом известном состоянии игра уже идёт (`inLobby===false`),
  `getPlayAccessDenial` не запускается — команда с невалидной/поздней регистрацией
  попадает в игру.
- **Фикс:** запускать проверку при `sessionKnown && !sessionUnknown` (не только в лобби),
  один раз через `playAccessCheckedRef`.

### H3 ✅ Сетевая ошибка проверки доступа проглатывается
- **Файл:** `src/pages/GamePlay.tsx:198-201`
- **Серьёзность:** MEDIUM→HIGH
- **Причина:** `.catch` только логирует — при ошибке доступ де-факто разрешён.
- **Фикс:** при ошибке показать «не удалось проверить доступ» + retry, fail-closed до
  успешной проверки.

### H4 ✅ Утечка таймера и unhandled rejection в broadcast
- **Файл:** `src/lib/gameRealtime.ts:52-62`
- **Серьёзность:** MEDIUM→HIGH
- **Причина:** `Promise.race` без отмены проигравшей ветки: при успешном `send` таймер
  1500мс всё равно reject’ит, `setTimeout` не очищается.
- **Фикс:** хранить timer, `clearTimeout` в `finally` (см. готовый сниппет от аудита).

### H5 ✅ HostView (`/host/`): «Завершить игру» может зависнуть
- **Файл:** `src/lib/gameSessionControl.ts` (`finishGameSession`→`archiveGameSession`→
  `loadExportData`), `src/pages/HostView.tsx:155-171`, `src/lib/requestQueue.ts:134-148`
- **Серьёзность:** HIGH
- **Причина:** `archiveGameSession` делает GET teams(prio 6)/questions(prio 7) ещё внутри
  `enqueueCritical`; при активной critical-сессии очередь обрабатывает только prio ≥ 8, а
  на `/host/` нет `markAdminFetchBoost()` → запросы не стартуют, critical ждёт вечно.
- **Фикс:** выполнять `archiveGameSession`/export вне critical (`enqueueBackground`) **или**
  оборачивать host-действия в `markAdminFetchBoost()`, **или** поднять приоритет
  export-GET на host-route. То же касается legacy-fallback (`resetGameProgress`).
- **Проверка:** на `/host/<code>` нажать «Завершить» в реальной игре — не должно зависать.

### H6 ✅ Счёт/команды на табло доходят только через broadcast
- **Файл:** `src/pages/AdminScoreboard.tsx` (нет poll), `src/pages/PlayerScoreboard.tsx`,
  `src/pages/HostView.tsx:128-140` (poll только game_state, только при не-SUBSCRIBED);
  `src/lib/gameRealtime.ts:106-125` (`postgres_changes` на teams без UPDATE)
- **Серьёзность:** HIGH (на мобильных broadcast часто теряется)
- **Причина:** при потере realtime табло/счётчик команд застывают до полного reload.
- **Фикс:** poll-fallback 10–30с на scoreboard-страницах и список команд на HostView
  (по аналогии с уже сделанным `useGameSessionAdmin` 6с); добавить подписку
  `postgres_changes` UPDATE на `teams`.

### H7 ✅ `syncPlayerTeamScoreFromServer` обнуляет очки чужих команд в кэше
- **Файл:** `src/lib/teamScore.ts:68-71`
- **Серьёзность:** MEDIUM→HIGH (некорректное табло у игрока)
- **Причина:** `total_score: t.id === teamId ? score : 0` — всем остальным командам
  ставится 0 в `teamsSnapshot`.
- **Фикс:** `t.id === teamId ? score : t.total_score`.

---

## P1 — Прочая устойчивость (MEDIUM)

### M1 ✅ Неполные вопросы из lobby-кэша играются без подсказок/медиа
- **Файл:** `src/pages/GamePlay.tsx:266-272`; `src/lib/prefetchGameQuestions.ts` (использует
  `QUESTION_LOBBY_SELECT` без `hint_levels/hint_penalties/media_url`)
- **Фикс:** при `!inLobby` всегда дозагружать `fetchQuestionsFullForGame` и мержить, либо
  помечать lobby-кэш как `lobbyOnly` и не считать готовым к игре.

### M2 ✅ Гонка таймера и отправки ответа → пропуск вопроса
- **Файл:** `src/pages/GamePlay.tsx:347-361, 481-572, 650-667`
- **Фикс:** общий `advancingRef`/`isSubmittingRef`: таймер не advance’ит при активной
  отправке; submit «захватывает» индекс и гасит таймер этого индекса.

### M3 ❌ Двойное начисление очков на клиенте при `via:'fallback'` (не актуально после IMP-SEC — только RPC)
- **Файл:** `src/pages/GamePlay.tsx:563-565, 607-608`
- **Фикс:** при fallback не вызывать `bumpTeamScoreInBackground`, если уже был
  `applyOptimisticTeamScoreBump`; единый путь начисления.

### M4 ✅ Бесконечный спиннер при «Обновить» без вопросов
- **Файл:** `src/pages/GamePlay.tsx:776-779, 439-467` (`setLoading(true)` без гарантии
  `setLoading(false)` на silent-return)
- **Фикс:** `finally { setLoading(false) }` для актуального gen.

### M5 ✅ Удаление команд в TeamManagement не шлёт realtime/не инвалидирует кэш
- **Файл:** `src/components/TeamManagementManager.tsx` (delete без
  `broadcastTeamsChanged`/`invalidateLobbyTeamsCache`); `src/pages/AdminPanel.tsx`
  (delete игры без `enqueueCritical`)
- **Фикс:** после delete → `broadcastTeamsChanged(gameId)` + invalidate; удаление игры из
  списка обернуть в `enqueueCritical` (как в `GameControls`).

### M6 ✅ Гонки invalidate+inflight в `fetchLobbyTeams` / устаревший `gameLookupCache`
- **Файл:** `src/lib/fetchLobbyTeams.ts` (force не обходит inflight),
  `src/lib/gameLookupCache.ts` (cache hit без revalidate, TTL до 15 мин)
- **Фикс:** generation-token (как C2); stale-while-revalidate для lookup.

### M7 ✅ BROADCAST_SEND_TIMEOUT 1500мс мал для мобильной сети
- **Файл:** `src/lib/gameRealtime.ts:50`
- **Фикс:** 4000–8000мс на mobile UA (после H4); fail не считать доставкой.

---

## P2 — Безопасность/дрейф/гигиена

### S6 ✅ Админ-доступ только по `localStorage`; legacy-вход с паролем в фильтре
- **Файл:** `src/pages/AdminPanel.tsx:173-177`; `src/pages/AdminLogin.tsx:46-51`
  (`.eq('password_hash', password)`)
- **Серьёзность:** HIGH (security), но за RLS запись всё же требует authenticated
- **Фикс:** guard через `hasSupabaseAdminSession()` + redirect на `/admin/login`; удалить
  legacy-режим или перевести на Supabase Auth (никогда не слать пароль в фильтр PostgREST).

### S7 ✅ Дрейф миграций: `db:migrate` не применяет 016/017; `00_run_all.sql` устарел
- **Файл:** `scripts/apply-migrations.mjs` (нет 016/017), `docs/sql-migrations/00_run_all.sql`
- **Фикс:** добавить 016/017 в `ALL_FILES`; `npm run db:verify-schema`; пометить
  `00_run_all.sql` deprecated; единственный путь — `db:migrate`.

### Прочее (L1–L6)
| ID | Файл | Проблема | Фикс |
|----|------|----------|------|
| L1 ✅ | `src/lib/gameRealtime.ts:80-156, 202-204` | publish-канал создаёт hub с refCount 0 (утечка) | ephemeral publish-канал без hub-map |
| L2 ✅ | `src/lib/requestQueue.ts` (`pickNext` sort на каждом drain) | O(n log n) на hot-path | priority buckets/heap |
| L3 ✅ | `src/lib/requestQueue.ts:127-151` | starvation при только-фоновой очереди в critical | таймаут starvation → временно разрешить prio ≥ 6 |
| L4 ✅ | `src/lib/storageUpload.ts` | нет проверки MIME/размера для аватаров/медиа | `uploadFileGuard.ts` + magic bytes в player-upload |
| L5 ✅ | `createGame.ts:43`, `GameEditor.tsx:374/394`, `MessagePanel`, `SettingsManager` | `.select()`/`select('*')` без полей (не player hot-path) | явные поля |
| L6 ✅ | `supabase/functions/test-*` | тестовые функции в репо (часть с service role) | не деплоить/удалить |

---

## ЖЕЛЕЗНЫЕ ОГРАНИЧЕНИЯ (повтор для исполнителя)

- Весь HTTP к Supabase — через обёртку `supabase.ts` → `enqueueSupabaseFetch`
  (приоритеты URL). Логика игрока — `enqueueCritical`/`enqueueBackground`; не блокировать
  critical вложенными `await` (но reentrancy через `criticalDepth` уже есть).
- Не параллелить REST + Storage в одной вкладке; аватар — только после игры.
- Coalesce/dedupe не дублировать: `prefetchGameQuestions`, `fetchGameState`,
  `fetchLobbyTeams`, `gameLookupCache`.
- `select('*')` на hot-path запрещён (IMP-TD-001). Service role — только на Edge.
- Не коммитить `.env`, `dist`, `node_modules`, `diagnostic/` логи/выгрузки.
- После существенных правок: `npm run build`; перед push — `gstack-review` → build →
  `node scripts/e2e-game-flow.mjs` → коммит по правилу/просьбе владельца.

## Рекомендуемый порядок работ

1. **C1** (возврат в лобби) и **H2/H3** (доступ) — корректность игрового потока.
2. **H1** (авто-пропуск, после repro) и **H7** (обнуление очков) — корректность игры/счёта.
3. **H4 + M7** (broadcast timeout/leak), **H5** (host finish), **H6** (poll-fallback табло).
4. **C2 + M6** (гонки кэша) — стабильность.
5. **S1–S5, S6** — безопасность (отдельным согласованным блоком: миграции + Edge + выдача
   командам сессионного токена). **Не катить на прод вслепую.**
6. **S7, L1–L6** — гигиена/дрейф.

> Источник: 4 параллельных read-only аудита (realtime, player, admin, data/security)
> + точечная верификация чтением кода. Пункты ✅ подтверждены, 🔍 — воспроизвести перед
> правкой.
