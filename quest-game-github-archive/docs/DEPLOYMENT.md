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

## Prod: igriva.ru (GitHub → VPS, без ручного SFTP)

Бэкенд — Supabase Cloud. На VPS только статика из `dist/` в `/var/www/igriva`.
Визитка `strelin-andrey.ru` в `/var/www/site_visitka_strelin` **не трогаем**.

### Цикл разработки

| Этап | Где | Действие |
|------|-----|----------|
| 1. Разработка | ПК | `npm run dev`, тесты, `.env` с LAN/`localhost` |
| 2. Публикация кода | GitHub | `git push origin main` (после коммита) |
| 3. Выкладка на prod | VPS (MobaXterm SSH) | одна команда — см. ниже |

### Один раз: подготовка VPS

На сервере `31.207.75.94` (SSH root или ваш пользователь):

```bash
# Node 20 LTS (если node -v < 18)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git rsync

mkdir -p /opt
cd /opt
git clone https://github.com/fancifulaction-rgb/interactive_game.git quest-game
cd quest-game/quest-game-github-archive
cp .env.production.example .env.production
nano .env.production   # VITE_SUPABASE_ANON_KEY + VITE_PUBLIC_URL=https://igriva.ru
```

Приватный репозиторий: настройте [Deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) или `git clone git@github.com:...` с SSH-ключом на VPS.

Проверка первого деплоя:

```bash
bash scripts/deploy-prod-frontend.sh
```

### Каждое обновление prod (после push в GitHub)

В MobaXterm, SSH на VPS:

```bash
bash /opt/quest-game/quest-game-github-archive/scripts/deploy-prod-frontend.sh
```

Скрипт: `git pull` → `npm ci` → `npm run build` → `rsync` в `/var/www/igriva` → права `www-data`.

Опционально — короткий алиас в `~/.bashrc` на сервере:

```bash
alias igriva-deploy='bash /opt/quest-game/quest-game-github-archive/scripts/deploy-prod-frontend.sh'
```

### Локальный `.env` vs серверный `.env.production`

| Файл | Где | Назначение |
|------|-----|------------|
| `.env` | только ПК | dev: `VITE_PUBLIC_URL` = LAN или пусто |
| `.env.production` | только VPS | prod: `VITE_PUBLIC_URL=https://igriva.ru` |

Оба в `.gitignore` — секреты не попадают в GitHub.

### Edge / SQL (редко, не каждый фронт-релиз)

С ПК при изменении бэкенда:

```bash
npm run edge:deploy          # Edge Functions
npm run db:migrate           # миграции (осторожно на prod)
```

## Чеклист перед мероприятием

- [ ] Проект Supabase активен (не Paused)
- [ ] Создана игра с уникальным кодом (4–6 символов)
- [ ] Вопросы сохранены без дубликатов
- [ ] Проверена регистрация команды с телефона
- [ ] Табло открывается на проекторе
- [ ] Тестовая команда прошла 1–2 вопроса
