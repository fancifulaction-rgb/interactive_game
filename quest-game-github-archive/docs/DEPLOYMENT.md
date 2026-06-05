# Развёртывание Quest Game

## Стек

| Слой | Технология |
|------|------------|
| Frontend | React 18 + Vite + TypeScript |
| Backend | [Supabase](https://supabase.com/dashboard/project/qsomqrzkuivgfutpautf) |
| Хостинг UI | Docker Compose (self-host), Vercel, Netlify, Cloudflare Pages |

## Локальная разработка

```bash
cd quest-game-github-archive
cp .env.example .env
# заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Production build

```bash
npm run build
```

Артефакт: папка `dist/`. На хостинге задайте те же переменные `VITE_*`.

## Docker Compose (self-host)

Один контейнер nginx со статикой; бэкенд — Supabase Cloud.

```bash
cp .env.docker.example .env
# VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
docker compose up -d --build
```

Подробно: [DOCKER_COMPOSE.md](DOCKER_COMPOSE.md).

## Supabase

1. [Снять проект с паузы](./SUPABASE_RESTORE.md) при необходимости.
2. [Настройка с нуля](./SUPABASE_SETUP.md) — миграции, Storage, RLS.
3. Задеплоить Edge Functions (см. SUPABASE_RESTORE.md).

## Переменные окружения

| Переменная | Где |
|------------|-----|
| `VITE_SUPABASE_URL` | CI/CD и `.env` |
| `VITE_SUPABASE_ANON_KEY` | CI/CD и `.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | Только CLI / Edge Functions / локальные скрипты |

## Чеклист перед мероприятием

- [ ] Проект Supabase активен (не Paused)
- [ ] Создана игра с уникальным кодом (4–6 символов)
- [ ] Вопросы сохранены без дубликатов
- [ ] Проверена регистрация команды с телефона
- [ ] Табло открывается на проекторе
- [ ] Тестовая команда прошла 1–2 вопроса
