# Баги и статус (2026-06-04)

## Исправлено в этой сессии

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
