# База данных Quest Game

PostgreSQL в Supabase. Миграции: `docs/sql-migrations/`.

## Порядок применения миграций

| Файл | Содержание |
|------|------------|
| `001_initial_schema.sql` | Базовые таблицы, индексы, RLS (permissive) |
| `002_add_cascade_delete_rules.sql` | ON DELETE CASCADE для связей с `games` |
| `003_settings_and_themes.sql` | `settings`, `themes`, seed настроек квеста |
| `004_production_schema.sql` | Поля `games`, `questions` под v1.2.13 |
| `005_seed_from_backup.sql` | Темы + дефолтные settings (без демо-игры; `ON CONFLICT DO NOTHING`) |
| `006_storage_buckets.sql` | Buckets Storage |
| `007_fix_mojibake.sql` | Исправление кодировки (если нужно) |
| `008_teams_app_columns.sql` | `team_name`, `captain_name`, `avatar_url`, `total_score` |
| `009_game_state_pause.sql` | `is_paused`, `paused_at`, `paused_by` |
| `010_increment_team_score.sql` | RPC `increment_team_score(team_id, delta)` |
| `011_…` … `012_…` | По мере спринтов (см. `docs/sql-migrations/`) |
| `013_submit_auto_answer.sql` | RPC `submit_auto_answer` — серверная проверка авто-ответов (IMP-LOG-001) |
| `014_event_archive.sql` | Таблица `event_archive` — снимок заезда и CSV (IMP-DATA-001) |

**Скрипты:**
- `npm run db:migrate` — все новые миграции; журнал `schema_migrations`, уже применённые пропускаются
- `npm run db:migrate:013` — только 013 (если полный прогон «висит» на старой БД)
- `npm run db:migrate:014` — только 014 (`event_archive`)

На существующей БД без журнала скрипт один раз отмечает 001–012 как применённые и догоняет только новые файлы.

После DDL: **Dashboard → Settings → API → Reload schema**.

## ER-диаграмма (логическая)

```
games (1) ──┬──< teams
            ├──< players
            ├──< questions
            ├──< answers
            ├──< game_state
            ├──< team_scores
            └──< messages ──┬──< message_recipients
                            └──< message_reads

settings (глобальные, без FK на games)
themes   (глобальные)

games (1) ──< event_archive   (снимок заезда; game_id SET NULL при удалении игры)
```

## Таблицы

### `games`

| Колонка | Тип | Описание |
|---------|-----|----------|
| `id` | UUID PK | |
| `code` | VARCHAR(6) UNIQUE | Код для регистрации |
| `title` | TEXT | Название квеста |
| `password` | TEXT | Опционально |
| `settings` | JSONB | Доп. настройки (`hide_scoreboard_until_finish`, план: `answer_grading` — см. [guides/ANSWER_GRADING.md](guides/ANSWER_GRADING.md)) |
| `mask_board` | BOOLEAN | Маскировать табло |
| `theme` | VARCHAR | Ключ темы |
| `total_time_sec` | INT | Лимит времени игры |
| `per_question_time_sec` | INT | Дефолт таймера вопроса |
| `scoring` | JSONB | Коэффициенты формулы очков |
| `finish_page_type` | VARCHAR | `scoreboard` / поздравление и т.д. |

### `teams`

| Колонка | Тип | Описание |
|---------|-----|----------|
| `id` | UUID PK | |
| `game_id` | UUID FK → games | CASCADE |
| `name` | TEXT | Имя (legacy) |
| `team_name` | TEXT | Отображаемое имя |
| `captain_name` | TEXT | Капитан |
| `avatar` / `avatar_url` | TEXT | URL аватара |
| `total_score` | INT | Суммарный счёт |
| `registration_time` | TIMESTAMPTZ | |

### `questions`

| Колонка | Тип | Описание |
|---------|-----|----------|
| `id` | UUID PK | |
| `game_id` | UUID FK | |
| `question_number` | INT | Порядок |
| `order_index` | INT | Дублирует/уточняет порядок |
| `question_text` | TEXT | |
| `question_type` / `type` | VARCHAR | text, choice, media, … |
| `options` | JSONB | Варианты |
| `correct_answer` / `answer` | TEXT/JSONB | Эталон |
| `hint`, `hint_levels`, `hint_penalties` | | Подсказки |
| `media_url` | TEXT | Медиа вопроса |
| `points` | INT | Базовые очки |
| `difficulty` | TEXT | Легкий / Средний / Сложный |
| `per_question_time_sec` | INT | Переопределение таймера |

### `answers`

| Колонка | Тип | Описание |
|---------|-----|----------|
| `id` | UUID PK | |
| `game_id`, `team_id` | UUID FK | |
| `question_number` | INT | |
| `answer` | JSONB | Массив строк / выбор |
| `media_urls` | JSONB | URL файлов в Storage |
| `is_correct` | BOOLEAN | |
| `points_earned` | INT | |
| `time_spent` | INT | Секунды |

План (IMP-LOG-022, фаза 2+): `grading_status`, `match_tier`, `grading_meta` — см. [guides/ANSWER_GRADING.md](guides/ANSWER_GRADING.md).

Уникальность «один ответ на вопрос» обеспечивается логикой приложения (проверить при доработках).

### `game_state`

| Колонка | Тип | Описание |
|---------|-----|----------|
| `game_id` | UUID FK | Одна запись на игру (фактически) |
| `current_state` | VARCHAR | waiting, playing, … |
| `player_data` | JSONB | Произвольное состояние |
| `is_paused` | BOOLEAN | Общая пауза |
| `paused_at`, `paused_by` | | Метаданные паузы |

### `team_scores`

Агрегат для табло (может дублировать `teams.total_score` — сверять при рефакторинге).

### `messages`, `message_recipients`, `message_reads`

Система уведомлений админа → команды.

### `settings`

Ключ-значение: `quest_title`, `quest_subtitle`, `quest_logo_url`, …

### `players`

Legacy/доп. трекинг по `team_name` и `current_question`; основной поток — `teams` + localStorage.

## Формула очков

Реализация: `src/lib/scoring.ts` → `calculateQuestionScore`.

Проверка правильности ответа (не путать с формулой очков): RPC `submit_auto_answer` → `grade_auto_answer` (миграция `013_submit_auto_answer.sql`). Настройки проверки — `games.settings.answer_grading` (IMP-LOG-022, [guides/ANSWER_GRADING.md](guides/ANSWER_GRADING.md)).

Использует `games.scoring`:

```json
{
  "p_base": 100,
  "k_diff": 1,
  "k_time": 0.5,
  "k_fast": 1.2,
  "k_skip": 0.8,
  "combo_bonus": 10
}
```

Учитываются: сложность, оставшееся время, штрафы подсказок, частичная правильность (`partialMultiplier`).

**Планируется:** серверный пересчёт для авто-вопросов (IMP-LOG-001).

## Row Level Security

На старте: политики `FOR ALL USING (true)` на игровых таблицах — **любой с anon key может читать/писать**.

Риски и план ужесточения: [SECURITY.md](SECURITY.md), IMP-SEC-*.

## Realtime publication

В Dashboard включить для `supabase_realtime`:

- `teams`, `team_scores`, `answers`, `game_state`, `messages`

## Удаление данных

См. [DATA_LIFECYCLE.md](DATA_LIFECYCLE.md).

- Клиент: `deleteGameCompletely` → DELETE `games` (CASCADE).
- Edge: `delete-game` — Storage + таблицы.

## Индексы (001)

- `games.code`
- `teams.game_id`, `answers.game_id`, `answers.team_id`, …

При росте нагрузки рассмотреть составные индексы `(game_id, question_number)` на `answers`.

## Связанные документы

- [ENV_AND_DATABASE.md](ENV_AND_DATABASE.md)
- [SUPABASE_SETUP.md](SUPABASE_SETUP.md)
- [DATA_LIFECYCLE.md](DATA_LIFECYCLE.md)
