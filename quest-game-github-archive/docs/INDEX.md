# Каталог документации Quest Game

Единая точка входа для разработчиков и AI-агентов. Версия приложения: **1.2.13**.

## Допущения при ведении документации

| Тема | Решение |
|------|---------|
| Язык | Русский |
| Корень репозитория | `quest-game-github-archive/` |
| Целевая нагрузка | 2–100 одновременных команд на одном мероприятии |
| План развития | Три спринта — [ROADMAP.md](ROADMAP.md) |
| Каталог улучшений | Нумерованные ID — [IMPROVEMENTS_CATALOG.md](IMPROVEMENTS_CATALOG.md) |

---

## 1. Полный список документов проекта

Ниже — **рекомендуемый набор** для подобного продукта (realtime quiz/quest + Supabase). Статус: ✅ есть и заполнено | 🔗 есть ранее | 📋 опционально позже.

### Обязательные (ядро)

| # | Документ | Статус | Назначение |
|---|----------|--------|------------|
| 1 | [README.md](../README.md) | ✅ | Обзор, быстрый старт |
| 2 | [AGENTS.md](../AGENTS.md) | ✅ | Онбординг AI-агента за 5 минут |
| 2b | [AI_AGENT_ONBOARDING_PROMPT.md](AI_AGENT_ONBOARDING_PROMPT.md) | ✅ | **Полный промпт** для нового агента (копировать в чат) |
| 3 | [INDEX.md](INDEX.md) | ✅ | Этот каталог |
| 4 | [PRODUCT.md](PRODUCT.md) | ✅ | Продукт, роли, сценарии |
| 5 | [ARCHITECTURE.md](ARCHITECTURE.md) | ✅ | Архитектура системы |
| 6 | [DATABASE.md](DATABASE.md) | ✅ | Схема БД, миграции, связи |
| 7 | [FRONTEND.md](FRONTEND.md) | ✅ | Маршруты, страницы, `src/lib` |
| 8 | [API_AND_FLOWS.md](API_AND_FLOWS.md) | ✅ | Потоки данных игрок/админ |
| 9 | [REALTIME_AND_NETWORKING.md](REALTIME_AND_NETWORKING.md) | ✅ | Realtime, очереди, масштаб |
| 10 | [STORAGE.md](STORAGE.md) | ✅ | Buckets, загрузки файлов |
| 11 | [EDGE_FUNCTIONS.md](EDGE_FUNCTIONS.md) | ✅ | Supabase Edge Functions |
| 12 | [SECURITY.md](SECURITY.md) | ✅ | Auth, RLS, секреты, риски |
| 13 | [DEVELOPMENT.md](DEVELOPMENT.md) | ✅ | Локальная разработка, скрипты |
| 14 | [TESTING.md](TESTING.md) | ✅ | E2E, замеры, чеклисты |
| 15 | [DEPLOYMENT.md](DEPLOYMENT.md) | 🔗 | Выкладка фронта |
| 16 | [OPERATIONS.md](OPERATIONS.md) | ✅ | Runbook мероприятия |
| 17 | [ROADMAP.md](ROADMAP.md) | ✅ | 3 спринта |
| 18 | [IMPROVEMENTS_CATALOG.md](IMPROVEMENTS_CATALOG.md) | ✅ | Каталог идей (ID) |
| 19 | [DATA_LIFECYCLE.md](DATA_LIFECYCLE.md) | 🔗 | Жизненный цикл данных |
| 20 | [CHANGELOG.md](../CHANGELOG.md) | 🔗 | История версий |

### Supabase и инфраструктура

| # | Документ | Статус |
|---|----------|--------|
| 21 | [SUPABASE_SETUP.md](SUPABASE_SETUP.md) | 🔗 |
| 22 | [SUPABASE_NEW_PROJECT.md](SUPABASE_NEW_PROJECT.md) | 🔗 |
| 23 | [SUPABASE_RESTORE.md](SUPABASE_RESTORE.md) | 🔗 |
| 24 | [ENV_AND_DATABASE.md](ENV_AND_DATABASE.md) | 🔗 (дублирует часть DEVELOPMENT) |

### Эксплуатация и качество

| # | Документ | Статус |
|---|----------|--------|
| 25 | [SCALING.md](SCALING.md) | 🔗 |
| 26 | [BUGS_FOUND.md](BUGS_FOUND.md) | 🔗 |
| 27 | [BACKLOG.md](BACKLOG.md) | 🔗 → ссылается на каталог |
| 28 | [CONTRIBUTING.md](../CONTRIBUTING.md) | 🔗 |

### Специализированные гайды

| # | Документ | Статус |
|---|----------|--------|
| 29 | [guides/MULTIPLE_ANSWERS.md](guides/MULTIPLE_ANSWERS.md) | 🔗 |
| 30 | [GLOSSARY.md](GLOSSARY.md) | ✅ |

### Опционально (на будущее)

| # | Документ | Когда нужен |
|---|----------|-------------|
| 31 | `docs/API_OPENAPI.md` | Появится отдельный REST API |
| 32 | `docs/ADR/` | Архитектурные решения (Socket.IO vs Supabase) |
| 33 | `docs/USER_MANUAL.md` | PDF/инструкция для заказчика мероприятия |
| 34 | `docs/PRIVACY_GDPR.md` | Юридические требования EU |
| 35 | `docs/LOAD_TEST_REPORT.md` | После нагрузочного теста 100 игроков |

---

## 2. Карта чтения по задаче

| Задача | Читать в порядке |
|--------|------------------|
| Первый вход в проект | AGENTS.md → PRODUCT → ARCHITECTURE |
| Баг при ответе / регистрации | API_AND_FLOWS → REALTIME_AND_NETWORKING → BUGS_FOUND |
| Новая таблица / SQL | DATABASE → sql-migrations → DATA_LIFECYCLE |
| Загрузка файлов | STORAGE → EDGE_FUNCTIONS |
| Деплой на мероприятие | OPERATIONS → DEPLOYMENT → SUPABASE_SETUP |
| Новая фича из списка идей | IMPROVEMENTS_CATALOG (ID) → ROADMAP |
| Безопасность / RLS | SECURITY |

---

## 3. Структура репозитория

```
quest-game-github-archive/
├── AGENTS.md                 # AI onboarding
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── .env.example
├── package.json
├── src/
│   ├── App.tsx               # маршруты
│   ├── pages/                # экраны
│   ├── components/           # UI + GameStateManager
│   ├── contexts/             # ThemeContext
│   └── lib/                  # бизнес-логика Supabase
├── docs/                     # документация (этот каталог)
│   ├── sql-migrations/       # 001–009
│   └── guides/
├── supabase/functions/       # Edge Functions (Deno)
└── scripts/                  # migrate, e2e, latency
```

---

## 4. Связь документов с планом

- **Спринт 1–3:** [ROADMAP.md](ROADMAP.md)
- **Все предложенные улучшения с ID:** [IMPROVEMENTS_CATALOG.md](IMPROVEMENTS_CATALOG.md)
- **Старый бэклог (чеклисты):** [BACKLOG.md](BACKLOG.md) — не дублирует ID, только напоминания

---

*Обновляйте INDEX при добавлении новых `.md` в `docs/`.*
