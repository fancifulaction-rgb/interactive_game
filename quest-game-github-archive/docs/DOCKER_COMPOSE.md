# Self-host через Docker Compose (IMP-INF-004)

Один `docker compose up` поднимает **production-сборку фронтенда** на nginx.  
Postgres, Realtime, Storage и Edge Functions по-прежнему в **Supabase Cloud** (или вашем отдельном Supabase-проекте).

## Требования

- Docker Desktop или Docker Engine + Compose v2
- Проект Supabase с применёнными миграциями ([DATABASE.md](DATABASE.md))
- Задеплоенные Edge Functions: `npm run edge:deploy`

## Быстрый старт

```bash
cd quest-game-github-archive
cp .env.docker.example .env
# Заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (Dashboard → Settings → API)
docker compose up -d --build
```

Откройте http://localhost:8080 (или порт из `QUEST_GAME_PORT`).

Остановка:

```bash
docker compose down
```

Пересборка после смены ключей или кода:

```bash
docker compose up -d --build
```

## Переменные

| Переменная | Когда нужна | Описание |
|------------|-------------|----------|
| `VITE_SUPABASE_URL` | **build** | URL проекта Supabase |
| `VITE_SUPABASE_ANON_KEY` | **build** | Публичный anon key |
| `QUEST_GAME_PORT` | runtime | Порт на хосте (по умолчанию 8080) |

`VITE_*` попадают в JS-бандл **на этапе сборки образа**. После смены ключей нужен `--build`.

`SUPABASE_SERVICE_ROLE_KEY` и `DATABASE_URL` для compose **не нужны** — только для локальных `npm run db:*` и Edge secrets.

## Сеть и телефоны в зале

- С телефона открывайте **LAN-IP** машины с Docker, не `localhost`.
- Адрес вида `172.18.0.x` — это Docker bridge; для гостей используйте `192.168.x.x` (см. [OPERATIONS.md](OPERATIONS.md)).
- В Supabase Dashboard при необходимости добавьте URL self-host в CORS / Site URL (Authentication → URL configuration).

## Что не входит в compose

| Компонент | Где живёт |
|-----------|-----------|
| Postgres, RLS, RPC | Supabase |
| Realtime | Supabase |
| Storage buckets | Supabase |
| Edge Functions (`player-upload`, `delete-game`, `generate-questions`) | `npm run edge:deploy` |
| Миграции БД | `npm run db:migrate` с хоста (не из контейнера) |

Полный self-hosted Supabase (локальный Postgres) в этот compose **не входит** — только UI.

## npm-скрипты (опционально)

```bash
npm run docker:build
npm run docker:up
npm run docker:down
```

## Проверка после подъёма

1. Главная `/` открывается.
2. `/admin/login` — вход админа.
3. `/team/register` — регистрация по коду игры.
4. Табло и загрузка медиа (Edge `player-upload`).

## См. также

- [DEPLOYMENT.md](DEPLOYMENT.md) — Vercel/Netlify и общий чеклист
- [SUPABASE_SETUP.md](SUPABASE_SETUP.md) — настройка бэкенда
- [OPERATIONS.md](OPERATIONS.md) — день мероприятия
