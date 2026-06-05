# Runbook: проведение мероприятия

Инструкция для организатора/IT в день корпоратива.

## За 1–3 дня до события

- [ ] Supabase проект **Active** (не Paused)
- [ ] Миграции 001–009 применены
- [ ] Realtime publication включена
- [ ] Edge Functions `player-upload`, `delete-game` задеплоены — см. [§ Edge Functions](#edge-functions)
- [ ] Создана игра, код записан (например на бумаге для ведущего)
- [ ] Все вопросы сохранены, превью в GameEditor
- [ ] Тестовая команда прошла квест на телефоне
- [ ] Фронт собран и задеплоен (`npm run build` → хостинг)
- [ ] `VITE_*` на хостинге указывают на **прод** Supabase

## За 2 часа до старта

- [ ] Wi‑Fi / LTE стабильны в зале (гостевой VLAN без изоляции клиентов)
- [ ] Ноутбук ведущего заряжен, резерв браузера (Chrome)
- [ ] Проектор: открыть `/scoreboard-admin/<CODE>`
- [ ] Короткая ссылка или QR на `/team/register` (см. IMP-UX-002)
- [ ] Админ: `/admin/panel` — проверить игру активна

## Во время регистрации

- Озвучить код игры крупно на экране.
- Команды: зайти на сайт → Регистрация → код → имя → (аватар опционально).
- При тормозах: не обновлять страницу во время «Отправить» — подождать 10 с.

**Ожидаемая нагрузка:** до 100 команд — см. [SCALING.md](SCALING.md).

## Во время игры

- Пауза: админ → Game Controls → пауза (все экраны `GameStateManager`).
- Сообщения: админ → рассылка (NotificationPopup у игроков).
- Не открывать тяжёлый AdminScoreboard на том же ноутбуке, что раздаёт Wi‑Fi hotspot (опционально).

## Если что-то сломалось

| Симптом | Действие |
|---------|----------|
| Не регистрируется | Проверить код; Dashboard → API logs |
| Ответ «завис» | F5 только если UI не реагирует 60+ с; проверить Network reset |
| Табло не обновляется | F5 табло; проверить Realtime publication |
| 429 Too Many Requests | Пауза 2 мин; апгрейд план Supabase |
| Storage error | Проверить размер фото (&lt; 5 MB аватар) |

Эскалация разработчику: логи Network HAR, код игры, время, браузер.

## После мероприятия

- [ ] Экспорт результатов (Excel)
- [ ] Удалить тестовые игры или вызвать `delete-game`
- [ ] (Опционально) архив — IMP-DATA-001

## Edge Functions

Продакшен-функции: `player-upload` (upload с service role), `delete-game` (игра + Storage).

**Деплой (один раз или после изменений в `supabase/functions/`):**

```bash
cd quest-game-github-archive
npx supabase login
npm run edge:deploy
```

**Проверка без CLI:**

```bash
npm run edge:verify
```

Ожидается HTTP ≠ 404 для обеих функций. Клиент: `storageUpload.ts` fallback на `player-upload` при ошибке Storage; `deleteGame.ts` — Edge с fallback на CASCADE.

Секреты в Dashboard → Edge Functions → Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**CI e2e (GitHub Actions):** один раз после `gh auth login`:

```bash
cd quest-game-github-archive
npm run ci:secrets
```

Записывает `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` из `.env` в secrets репозитория.

## Мониторинг в Dashboard

Supabase → Reports:

- API requests spike
- Storage bandwidth
- Realtime connections

## Контакты и документы

- Техническая отладка: [BUGS_FOUND.md](BUGS_FOUND.md), [REALTIME_AND_NETWORKING.md](REALTIME_AND_NETWORKING.md)
- Деплой: [DEPLOYMENT.md](DEPLOYMENT.md)
