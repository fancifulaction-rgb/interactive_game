# Новый проект Supabase (старый quest_game не восстанавливается)

Старый проект **qsomqrzkuivgfutpautf** на паузе **с 24.06.2024** (>90 дней).  
Через Dashboard его **нельзя разморозить** — только скачать бэкап или перенести данные в **новый** проект.

Локальный бэкап: `../../archive/backups/db_cluster-09-12-2025@04-29-26.backup.gz`  
(полный дамп PostgreSQL; в `public` — таблицы Quest Game, 1 игра `QYA0E2`, настройки квеста).

---

## Шаг 1. Создать новый проект

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Имя, например: `quest-game-prod`
3. Регион: ближе к России/EU (например Frankfurt)
4. Пароль БД — сохраните в менеджере паролей
5. Дождитесь статуса **Active** (зелёный)

Запишите:

| Параметр | Где взять |
|----------|-----------|
| Project URL | Settings → API → Project URL |
| **Publishable key** | Settings → **API Keys** → Publishable (в `.env` как `VITE_SUPABASE_ANON_KEY`) |
| **Secret key** | API Keys → Secret (в `.env` как `SUPABASE_SERVICE_ROLE_KEY`, не в фронт!) |

> В старом интерфейсе те же ключи назывались `anon` и `service_role`.
| Project ref | из URL: `https://<ref>.supabase.co` |

---

## Шаг 2. SQL — схема и данные

В **SQL Editor** выполните **один файл** (рекомендуется):

- `docs/sql-migrations/00_run_all.sql` — всё сразу

Или по отдельности: `001` → `002` → `003` → `004` → `005`.

**Автоматически** (если добавили `SUPABASE_DB_PASSWORD` в `.env`):

```bash
node scripts/apply-migrations.mjs
```

Проверка:

```sql
SELECT code, title, theme FROM public.games;
SELECT key, value FROM public.settings WHERE key LIKE 'quest_%';
SELECT name, display_name FROM public.themes;
```

---

## Шаг 3. Realtime (табло в реальном времени)

**Database → Publications → supabase_realtime** → включите таблицы:

- `teams`, `team_scores`, `answers`, `game_state`, `messages`

(или через SQL, если доступно в вашей версии дашборда.)

---

## Шаг 4. Storage

В **Storage** создайте публичные buckets (см. [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)):

- `avatars`
- `answer-media`
- `question-media`
- `quest-logos`

Либо один раз задеплойте Edge Function `setup-storage-rls` после шага 5.

**Медиа из старого проекта** в вашем `.backup.gz` почти нет — файлы из Storage старого проекта нужно скачать отдельно с страницы **Download backups** (если Supabase ещё отдаёт архив storage).

---

## Шаг 5. Edge Functions

```bash
cd quest-game-github-archive
npx supabase login
npx supabase link --project-ref <ВАШ_НОВЫЙ_REF>
npx supabase functions deploy delete-teams
npx supabase functions deploy player-upload
npx supabase functions deploy delete-game
```

Остальные функции в `supabase/functions/` — для первичной настройки storage (по необходимости).

В Dashboard → Edge Functions → Secrets задайте `SUPABASE_SERVICE_ROLE_KEY` (если функции его требуют).

---

## Шаг 6. Админ для входа

```bash
node scripts/create_admin_script.js
```

В приложении: `/admin/login` → режим **email** → `admin@quest.game` / `admin123` (если не меняли `ADMIN_PASSWORD` в скрипте).

---

## Шаг 7. Фронтенд

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://<ВАШ_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<Publishable key>
```

```bash
npm install
npm run dev
```

Тест:

- http://localhost:5173/
- Игра с кодом `QYA0E2` (из seed)
- Админка после создания пользователя

---

## Если нужны ВСЕ данные из `.backup.gz`

Полный `pg_restore` в облачный Supabase **недоступен** (нет superuser). Варианты:

1. **Рекомендуется:** шаги 2–5 выше (схема + seed) — покрывает текущий бэкап.
2. **Dashboard → Download backups** на странице паузы — скачайте официальный дамп + storage; при необходимости восстановите через [документацию Supabase](https://supabase.com/docs/guides/platform/migrating-and-upgrading-projects) / support.
3. **Локально:** PostgreSQL + `pg_restore` для просмотра; в новый проект переносите только `public` через SQL.

Распаковка локального архива (PowerShell):

```powershell
# см. scripts/extract-backup.ps1
```

---

## Старый ref больше не использовать

После миграции обновите только **новый** URL и ключи. Ref `qsomqrzkuivgfutpautf` оставьте в `archive/` как историю.

---

## Чеклист готовности к мероприятию

- [ ] Новый проект Active
- [ ] Миграции 001–005 выполнены
- [ ] Realtime включён
- [ ] Storage buckets созданы
- [ ] Edge Functions задеплоены
- [ ] Админ создан, вход работает
- [ ] Регистрация команды с телефона
- [ ] `.env` не в git
