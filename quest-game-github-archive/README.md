# Quest Game

Интерактивная платформа для **командных квестов** на мероприятиях: регистрация команд, вопросы с медиа, табло в реальном времени, админ-панель.

**Версия:** 1.2.13  
**Аудитория:** гости корпоративов, ~20–60 лет.

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

### Тестовый вход (если создан админ в БД)

- Админ: `/admin/login` — логин/пароль из вашей БД (ранее в демо: `admin` / `admin123`)
- Игрок: `/team/register` → код игры

## Документация

| Документ | Описание |
|----------|----------|
| [docs/SUPABASE_NEW_PROJECT.md](docs/SUPABASE_NEW_PROJECT.md) | **Новый проект** (старый на паузе >90 дней) |
| [docs/SUPABASE_RESTORE.md](docs/SUPABASE_RESTORE.md) | Бэкап, архив старого ref |
| [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) | Миграции, Storage, Edge Functions |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Сборка и выкладка фронта |
| [docs/BACKLOG.md](docs/BACKLOG.md) | План доработок |
| [docs/guides/MULTIPLE_ANSWERS.md](docs/guides/MULTIPLE_ANSWERS.md) | Вопросы с несколькими вариантами |
| [CHANGELOG.md](CHANGELOG.md) | История версий |

## Структура

```
├── src/                 # React-приложение
├── supabase/functions/  # Edge Functions
├── docs/
│   ├── sql-migrations/  # SQL для Postgres
│   └── ...
└── scripts/             # Вспомогательные скрипты
```

## Основные таблицы

`games`, `teams`, `players`, `questions`, `answers`, `game_state`, `messages`, `settings`, `themes`

## Лицензия

MIT — см. [LICENSE](LICENSE)
