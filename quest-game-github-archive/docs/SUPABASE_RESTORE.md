# Supabase: восстановление данных

> **Важно (июнь 2024+):** проект `quest_game` (ref `qsomqrzkuivgfutpautf`) **нельзя снять с паузы** через Dashboard после 90+ дней.  
> **Действуйте по инструкции:** **[SUPABASE_NEW_PROJECT.md](./SUPABASE_NEW_PROJECT.md)** — новый проект + миграции + seed.

---

## Архив: старый проект (только для справки)

Dashboard: [qsomqrzkuivgfutpautf](https://supabase.com/dashboard/project/qsomqrzkuivgfutpautf) (paused, restore недоступен)  
URL API (не использовать): `https://qsomqrzkuivgfutpautf.supabase.co`

Локальная копия БД: `../../archive/backups/db_cluster-09-12-2025@04-29-26.backup.gz`

## Что внутри бэкапа

Файл — **полный дамп кластера PostgreSQL** (формат `pg_dump`), сжатый gzip. После распаковки (~250 KB SQL) содержит:

| Схема | Назначение |
|-------|------------|
| `public.games`, `questions`, `teams`, `answers`, … | Данные квест-платформы |
| `public.settings`, `themes` | Настройки и темы |
| `auth.*`, `storage.*` | Служебные схемы Supabase |

На момент экспорта (09.12.2025) в `public` были:

- 1 игра с кодом `QYA0E2`
- Настройки квеста (`quest_title`, `quest_subtitle`, …)
- Пустые `questions`, `teams` (тестовые данные могли быть очищены до бэкапа)

**Вывод:** бэкап относится к **нужному** проекту, его можно хранить как страховку.

---

## Шаг 1. Снять проект с паузы

1. Откройте [дашборд проекта](https://supabase.com/dashboard/project/qsomqrzkuivgfutpautf).
2. Если видите статус **Paused** — нажмите **Restore project** / **Восстановить проект**.
3. Подождите 2–5 минут: поднимутся Postgres, API, Auth, Storage.
4. Проверьте **Project Settings → API**: скопируйте заново `anon` key (при необходимости — `service_role` только для сервера/CLI, не для фронта).

Документация Supabase по паузе free-проектов: [Manage your usage](https://supabase.com/docs/guides/platform/manage-your-usage).

> После длительной паузы данные обычно **сохраняются** на диске проекта. Бэкап нужен, если после Restore таблицы пустые или схема сломана.

---

## Шаг 2. Подключить фронтенд

В папке `quest-game-github-archive`:

```bash
cp .env.example .env
```

Заполните `.env`:

```env
VITE_SUPABASE_URL=https://qsomqrzkuivgfutpautf.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key из Dashboard → API>
```

```bash
npm install
npm run dev
```

Откройте http://localhost:5173/

---

## Шаг 3. Проверить базу после Restore

В **SQL Editor** выполните:

```sql
SELECT code, title, created_at FROM public.games ORDER BY created_at DESC LIMIT 10;
SELECT key, value FROM public.settings WHERE key LIKE 'quest_%';
```

Если строки есть — **восстанавливать бэкап не нужно**.

---

## Шаг 4. Восстановление из бэкапа (если данных нет)

Полный `pg_restore` всего кластера в облачный Supabase **не поддерживается** через UI. Варианты:

### A. Только схема `public` (рекомендуется)

1. Установите [Supabase CLI](https://supabase.com/docs/guides/cli) или PostgreSQL client.
2. Распакуйте дамп локально (PowerShell):

```powershell
$gz = "..\..\archive\backups\db_cluster-09-12-2025@04-29-26.backup.gz"
$out = "$env:TEMP\quest-db.backup"
# ... распаковка GZipStream, как при аудите проекта
```

3. Извлеките только `public` (нужен `pg_restore` / ручной выбор секций) **или** выполните миграции из `docs/sql-migrations/` и вручную вставьте данные из секций `COPY public.*` дампа через SQL Editor.

### B. Чистая установка + миграции

Если проект пустой:

1. Выполните по порядку: `001_initial_schema.sql`, `002_add_cascade_delete_rules.sql`, `003_settings_and_themes.sql`.
2. Задеплойте Edge Functions из `supabase/functions/` (минимум: `delete-teams`, `player-upload`, `delete-game`).
3. Создайте Storage buckets по [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).
4. Создайте админа: `node scripts/create_admin_script.js` (после настройки переменных в скрипте).

### C. Обращение в поддержку Supabase

Для восстановления **полного** файла `db_cluster-*.backup.gz` иногда нужен тикет в Support с привязкой к project ref `qsomqrzkuivgfutpautf`.

---

## Шаг 5. Edge Functions

После Restore проверьте **Edge Functions** в дашборде. Если пусто — задеплойте из репозитория:

```bash
npx supabase login
npx supabase link --project-ref qsomqrzkuivgfutpautf
npx supabase functions deploy delete-teams
npx supabase functions deploy player-upload
npx supabase functions deploy delete-game
```

Остальные функции в `supabase/functions/` — вспомогательные (storage setup); деплойте по необходимости.

---

## Безопасность

- **Не коммитьте** `.env`, `Supabase.txt`, service role key.
- **Не вставляйте** service role в React-код (удалено из `src/lib/supabase.ts`).
- После публикации репозитория **ротируйте** ключи в Dashboard → API → Reset keys, если они когда-либо светились в чате или файлах.
