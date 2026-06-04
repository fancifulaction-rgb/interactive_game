# Переменные окружения и доступ к БД

Файл `.env` в корне `quest-game-github-archive` (не коммитится).

## Обязательно для приложения

| Переменная | Откуда взять |
|------------|--------------|
| `VITE_SUPABASE_URL` | Dashboard → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | API Keys → **Publishable** |

## Для скриптов (Node)

| Переменная | Откуда |
|------------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | API Keys → **Secret** |
| `SUPABASE_DB_PASSWORD` | Connect → Connection string (пароль вместо `[YOUR-PASSWORD]`) |
| `DATABASE_URL` | Connect → Connection string (полная строка) |
| `DATABASE_URL_SESSION_POOLER` | Connect → **Pooler settings** → Session (для Windows / IPv4) |

Скрипт `scripts/lib/db-connect.mjs` пробует подключения по порядку, пока одно не сработает.

## Команды

```bash
npm run db:test-connection   # проверка Postgres
npm run db:verify            # таблицы + buckets через API
npm run db:migrate           # миграции 001–005 (если пустая БД)
npm run db:storage           # buckets 006
```

## Создание админа

```bash
node scripts/create_admin_script.js
```

По умолчанию: `admin@quest.game` / `admin123`
