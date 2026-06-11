# Roadmap: три спринта

Принят план развития Quest Game. Каждая задача ссылается на ID из [IMPROVEMENTS_CATALOG.md](IMPROVEMENTS_CATALOG.md).

**Легенда статусов в каталоге:** `proposed` | `accepted` | `in_progress` | `done` | `rejected`

---

## Спринт 1 — Стабильность и продакшен-готовность

**Цель:** надёжность на 50–100 команд, безопасные операции, меньше нагрузки на Supabase.

| # | Задача | ID каталога | Критерий готовности |
|---|--------|-------------|---------------------|
| 1.1 | Задеплоить `player-upload` и `delete-game` | IMP-INF-001, IMP-INF-002 | `functions list` OK; upload/delete с телефона |
| 1.2 | SQL RPC `increment_team_score(team_id, delta)` | IMP-INF-003 | `teamScore.ts` вызывает RPC; нет гонок счёта |
| 1.3 | Убрать `select('*')` на табло и hot paths | IMP-TD-001 | Явные поля в AdminScoreboard, Scoreboard, export |
| 1.4 | Убрать service role с клиента (если есть) | IMP-SEC-003 | Только Edge для опасных операций |
| 1.5 | CI: `build` + `e2e-game-flow.mjs` | IMP-INF-005 | Pipeline green на PR |
| 1.6 | Документировать статус Edge в OPERATIONS | — | Чеклист обновлён |
| 1.7 | Мульти-медиа в вопросах и подсказках (этап 1) | IMP-PRD-009, IMP-ST-001 | migrate 030; редактор multi-upload + сжатие; GamePlay gallery; legacy `media_url`/`hint_levels` |

**Не входит в спринт 1:** PWA, комната ожидания, AI; композитор layout/timeline и live-пульт (этап 2 IMP-PRD-009).

---

## Спринт 2 — Опыт мероприятия ✅

**Цель:** удобство для ведущего и гостей в зале.

| # | Задача | ID каталога | Статус |
|---|--------|-------------|--------|
| 2.1 | Комната ожидания (общий старт) | IMP-UX-001 | done |
| 2.2 | Экран ведущего + QR на регистрацию | IMP-UX-002, IMP-UX-003 | done |
| 2.3 | PWA (manifest + service worker) | IMP-UX-004 | done |
| 2.4 | Блокировка табло до финиша (настройка игры) | IMP-UX-005 | done |
| 2.5 | Код игры 6 символов + буквы | IMP-PRD-001 | done |

**Зависимости:** 2.1 желательно до 2.2 (ведущий видит список команд в lobby).

---

## Спринт 3 — Realtime и расширения

**Цель:** масштабируемое табло, опциональные продуктовые фичи.

| # | Задача | ID каталога | Критерий готовности |
|---|--------|-------------|---------------------|
| 3.1 | Realtime Broadcast для счёта | IMP-RT-001 | done — `gameRealtime.ts`, broadcast `score_update` |
| 3.2 | Убрать poll 5s на AdminScoreboard | IMP-RT-002 | Только Broadcast/один channel |
| 3.3 | Серверная проверка авто-ответов | IMP-LOG-001 | done — RPC `submit_auto_answer` + миграция 013 |
| 3.4 | AI-генерация вопросов (Qwen / DeepSeek Edge) | IMP-PRD-002 | done — панель в GameEditor + `generate-questions`; деплой Edge + secrets |
| 3.5 | Docker Compose для self-host | IMP-INF-004 | done — `Dockerfile`, `docker-compose.yml`, [DOCKER_COMPOSE.md](DOCKER_COMPOSE.md) |
| 3.6 | Архив сессии / CSV история | IMP-DATA-001 | done — `event_archive`, автосохранение при финише, CSV в AdminPanel |

**Опционально в спринте 3:** CDN Storage (IMP-INF-007), load test report (IMP-INF-006).

---

## После спринтов (бэклог без жёсткой даты)

См. каталог: IMP-ARC-001 (Socket.IO), IMP-PRD-003 (team chat), IMP-ST-002 (video transcode), GDPR doc.

### IMP-LOG-022 — проверка ответов (answer_grading) ✅

**Статус:** `done` (фазы 0–4, миграции 022–025, коммит `453b1dc`).  
**Спека:** [guides/ANSWER_GRADING.md](guides/ANSWER_GRADING.md).

| Фаза | Задача | Статус |
|------|--------|--------|
| 0 | Спека + каталог | done |
| 1 | normalize + fuzzy, пресеты в профиле игры | done |
| 2 | pending / hybrid / keywords / numeric, модерация | done |
| 3 | post-hoc accept, штраф пересдачи | done |
| 4 | regex, jury, `questions.grading_override` | done |

**Точечные доработки (бэклог, без нового IMP):** вернуться по запросу — см. §14 в [ANSWER_GRADING.md](guides/ANSWER_GRADING.md).

| # | Тема | Заметка |
|---|------|---------|
| G1 | Ручной QA фазы 4 | regex pattern/flags; override в редакторе (перед «Подсказки»); jury `required_votes: 2` |
| G2 | `MANUAL_QA_CHECKLIST.md` | Добавить секцию IMP-LOG-022 (сейчас нет) |
| G3 | UX профиля / редактора | Валидация regex, подсказки jury, отличие `pending` vs `jury_pending` на табло |
| G4 | Тест-кейсы §12 спеки | Дописать кейсы regex / override / jury после QA |

---

## Фаза 4 — post-sprint (черновик, 2026-06-10)

Спринты 1–3 закрыты. Ниже — **приоритетный план** без жёстких дат; детали в [IMPROVEMENTS_CATALOG.md](IMPROVEMENTS_CATALOG.md).

### Уже в main (документация синхронизирована)

| ID | Что | Миграции / код |
|----|-----|----------------|
| IMP-UX-009 | Уникальные QR/ссылки `?join=` | `032_game_join_token.sql`, `joinToken.ts`, `registrationUrl.ts` |
| IMP-ADM-004 | Скрытие вопросов `is_hidden` | `027_question_hidden.sql`, GameEditor |
| IMP-PRD-009 (этап 1) | Мульти-медиа carousel + editor | `030`–`031`, `questionMediaTypes.ts` |

### Приоритет 1 — дожим и QA

| # | Задача | ID | Критерий готовности |
|---|--------|-----|---------------------|
| 4.1 | Ручной QA `join_token` / QR / клон | IMP-UX-009 | `MANUAL_QA_CHECKLIST` QA-C02b, QA-B05b — ✅ |
| 4.2 | Ручной QA скрытых вопросов | IMP-ADM-004 | QA-B07 — редактор, игрок не видит скрытые |
| 4.3 | Grading QA фазы 4 | IMP-LOG-022 G1–G4 | Секция I в чеклисте; regex/jury/override |
| 4.4 | `db:migrate` на prod/test + schema reload | — | 027, 030–032 в журнале; `verify-schema-drift` OK |

### Приоритет 2 — продукт

| # | Задача | ID | Заметка |
|---|--------|-----|---------|
| 4.5 | Мульти-медиа этап 2 | IMP-PRD-010 | layout, timeline, live-cue — отдельный блок |
| 4.6 | RLS ужесточение | IMP-SEC-002, 004–006 | После `gstack-cso` |
| 4.7 | CDN / load test | IMP-INF-006, 007 | Перед крупным мероприятием |

### Приоритет 3 — бэклог

UX-006..008, PRD-003..008, ADM-001..003, TD-002..005, RT-003..004, ST-002, DATA-002.

**Не брать без явного ID:** IMP-ARC-001/002 (Socket.IO, offline LAN).

---

## Как вести прогресс

1. Перед взятием задачи — пометить ID в IMPROVEMENTS_CATALOG как `accepted` → `in_progress`.
2. По завершении — `done` + строка в CHANGELOG.
3. Отклонённые — `rejected` + комментарий «почему».

---

## Связь со старым BACKLOG

[BACKLOG.md](BACKLOG.md) содержит исторические чеклисты без ID. Новые решения — **только через IMPROVEMENTS_CATALOG**.
