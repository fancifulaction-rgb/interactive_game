# Тестирование

**Отложенный чеклист по фичам:** [TEST_BACKLOG.md](TEST_BACKLOG.md) — всё, что нужно прогнать после текущей волны разработки.

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

## CI (рекомендация, IMP-INF-005)

```yaml
# пример
- run: npm run build
- run: node scripts/e2e-game-flow.mjs
  env:
    VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SERVICE_ROLE }}
```

## Связанные документы

- [DEVELOPMENT.md](DEVELOPMENT.md)
- [OPERATIONS.md](OPERATIONS.md)
- [SCALING.md](SCALING.md)
