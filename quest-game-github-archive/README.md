# Quest Game

Интерактивная платформа для **командных квестов** на мероприятиях: регистрация команд, вопросы с медиа, табло в реальном времени, админ-панель.

**Версия:** 1.2.15  
**Аудитория:** гости корпоративов, ~20–60 лет, до **100** команд одновременно (см. [docs/SCALING.md](docs/SCALING.md)).

## Возможности

- Создание и редактирование квестов (админ)
- Регистрация команд по коду игры
- Ответы: текст, варианты, фото/видео/аудио
- Realtime-табло и уведомления
- Экспорт результатов в Excel
- Темы оформления (светлая / тёмная и кастом)

## Стек

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Backend:** Supabase (Postgres, Realtime, Storage, Edge Functions)

## Быстрый старт

```bash
npm install
cp .env.example .env
# Укажите ключи из Supabase Dashboard → Settings → API
npm run dev
```

Приложение: http://localhost:5173/

### Self-host (Docker)

```bash
cp .env.docker.example .env
docker compose up -d --build
```

→ http://localhost:8080 — см. [docs/DOCKER_COMPOSE.md](docs/DOCKER_COMPOSE.md).

### Тестовый вход (если создан админ в БД)

- Админ: `/admin/login` — email/пароль из `node scripts/create_admin_script.js` (по умолчанию `admin@quest.game` / `admin123`)
- Игрок: `/team/register` → код игры

## Документация

**Начните здесь:** [docs/INDEX.md](docs/INDEX.md) — полный каталог.  
**Для AI-агентов:** [AGENTS.md](AGENTS.md).

| Раздел | Документы |
|--------|-----------|
| Продукт и архитектура | [PRODUCT](docs/PRODUCT.md), [ARCHITECTURE](docs/ARCHITECTURE.md) |
| Код и потоки | [FRONTEND](docs/FRONTEND.md), [API_AND_FLOWS](docs/API_AND_FLOWS.md) |
| БД и Storage | [DATABASE](docs/DATABASE.md), [STORAGE](docs/STORAGE.md) |
| Сеть и масштаб | [REALTIME_AND_NETWORKING](docs/REALTIME_AND_NETWORKING.md), [SCALING](docs/SCALING.md) |
| Разработка | [DEVELOPMENT](docs/DEVELOPMENT.md), [TESTING](docs/TESTING.md) |
| Деплой и мероприятие | [DEPLOYMENT](docs/DEPLOYMENT.md), [DOCKER_COMPOSE](docs/DOCKER_COMPOSE.md), [OPERATIONS](docs/OPERATIONS.md) |
| Supabase | [SUPABASE_SETUP](docs/SUPABASE_SETUP.md), [SUPABASE_NEW_PROJECT](docs/SUPABASE_NEW_PROJECT.md) |
| План и идеи | [ROADMAP](docs/ROADMAP.md) (3 спринта), [IMPROVEMENTS_CATALOG](docs/IMPROVEMENTS_CATALOG.md) (ID фич) |
| Качество | [BUGS_FOUND](docs/BUGS_FOUND.md), [SECURITY](docs/SECURITY.md) |

## Структура

```
├── AGENTS.md              # онбординг для AI
├── src/                   # React-приложение
├── supabase/functions/    # Edge Functions
├── docs/                  # документация
│   ├── sql-migrations/    # SQL 001–009
│   └── guides/
└── scripts/               # migrate, e2e, latency
```

## Основные таблицы

`games`, `teams`, `players`, `questions`, `answers`, `game_state`, `messages`, `settings`, `themes`

## Лицензия

MIT — см. [LICENSE](LICENSE)
