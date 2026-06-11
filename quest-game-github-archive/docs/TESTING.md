# Тестирование

**Отложенный чеклист по фичам:** [TEST_BACKLOG.md](TEST_BACKLOG.md) — всё, что нужно прогнать после текущей волны разработки.

**Интерактивный прогон с вашими отметками:** [MANUAL_QA_CHECKLIST.md](MANUAL_QA_CHECKLIST.md) — статус ✅/❌, комментарии, ответ агента после проверки.

## Уровни тестирования в проекте

| Уровень | Что есть | Что планируется |
|---------|----------|-----------------|
| Unit | Минимально | scoring.ts, requestQueue |
| Integration | `e2e-game-flow.mjs` | Расширить сценарии |
| E2E браузер | Ручное | Playwright (IMP-TD-003) |
| Load | `measure-latency.mjs` | k6 20–100 VU (IMP-INF-006) |

## Автоматический E2E (Node)

```bash
cd quest-game-github-archive
# .env с SERVICE_ROLE и VITE_* 
node scripts/e2e-game-flow.mjs
```

Проверяет цепочку: создание/поиск игры, регистрация команды, insert ответа (без браузера).

При падении — смотреть вывод и [BUGS_FOUND.md](BUGS_FOUND.md).

## Замер latency

```bash
node scripts/measure-latency.mjs 26D4A6
```

Замените `26D4A6` на код существующей игры.

**Интерпретация:**

- Node p50 &lt; 300 ms — Supabase доступен.
- Node быстрый, браузер медленный — проблема мультиплекса/очереди UI.

## Ручной чеклист (перед релизом)

### Админ

- [ ] Login / logout
- [ ] Создать игру, получить код
- [ ] Добавить 3 вопроса (текст, выбор, с медиа)
- [ ] Сохранить без дубликатов question_number
- [ ] Пауза игры
- [ ] Отправить сообщение командам
- [ ] Удалить тестовую игру
- [ ] Экспорт Excel

### Игрок (Chrome + Safari или Firefox)

- [ ] Регистрация по коду &lt; 30 s
- [ ] Прохождение 3 вопросов, один с фото
- [ ] UI не зависает на «Ответить»
- [ ] Табло показывает счёт
- [ ] Аватар появляется после финиша (до 15 s)
- [ ] Пауза от админа блокирует ввод

### Проектор

- [ ] `/scoreboard-admin/:code` обновляется
- [ ] Читаемо с расстояния 5 м

### Масштаб (опционально)

- [ ] 10 вкладок incognito — регистрация 10 команд
- [ ] Одновременный ответ — без массовых reset

## Проверка БД

```bash
npm run db:verify
npm run db:test-connection
```

## Regression после сетевых правок

Обязательно тестировать в **двух браузерах** — HTTP/2 ведёт себя по-разному.

Не добавлять параллельные `supabase.from()` на пути ответа без `requestQueue`.

## CI (IMP-INF-005)

Workflow: `.github/workflows/ci.yml` на каждый push/PR в `main`:

1. `npm run test:unit` — Vitest (`scoring.test.ts`)
2. `npm run build`
3. `npm run test:e2e` — Playwright (smoke + `full-game-flow.spec.ts`)
4. `node scripts/e2e-game-flow.mjs` — API smoke

Секреты репозитория: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (см. `npm run ci:secrets`).

Локально полный UI-сценарий: `npm run test:e2e` при запущенном `npm run dev` или без него (Playwright поднимет Vite сам).

## Связанные документы

- [DEVELOPMENT.md](DEVELOPMENT.md)
- [OPERATIONS.md](OPERATIONS.md)
- [SCALING.md](SCALING.md)
