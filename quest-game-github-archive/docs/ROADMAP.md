# Roadmap: спринты 1–5

План развития Quest Game. Каждая задача ссылается на ID из [IMPROVEMENTS_CATALOG.md](IMPROVEMENTS_CATALOG.md).

**Легенда статусов в каталоге:** `proposed` | `accepted` | `in_progress` | `done` | `rejected`

**Текущий фокус:** [Спринт 5](#спринт-5--prod-и-следующий-цикл-2026-06-11) (критично до prod → желательно → обсудить позже).

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

## Спринт 3 — Realtime и расширения ✅

**Цель:** масштабируемое табло, опциональные продуктовые фичи.

| # | Задача | ID каталога | Статус |
|---|--------|-------------|--------|
| 3.1 | Realtime Broadcast для счёта | IMP-RT-001 | done |
| 3.2 | Убрать poll 5s на AdminScoreboard | IMP-RT-002 | done |
| 3.3 | Серверная проверка авто-ответов | IMP-LOG-001 | done |
| 3.4 | AI-генерация вопросов (Qwen / DeepSeek Edge) | IMP-PRD-002 | done (код); Edge на prod — см. спринт 5 P0 |
| 3.5 | Docker Compose для self-host | IMP-INF-004 | done |
| 3.6 | Архив сессии / CSV история | IMP-DATA-001 | done |

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
| G1 | Ручной QA фазы 4 | Секция **I** в `MANUAL_QA_CHECKLIST.md` (QA-I01–I04) — тестер |
| G2 | UX профиля grading | Валидация regex (`pattern`, `flags`) — **спринт 5 P1** |
| G3 | UX редактора override | Превью эффективного cfg, сброс — **спринт 5 P1** |
| G4 | Jury / модерация | Крайние случаи + §12 спеки — **спринт 5 P1** после G1 |

---

## Фаза 4 — post-sprint ✅ (код, 2026-06-11)

Спринты 1–3 закрыты. В `main` дополнительно:

| ID | Что | Миграции / код |
|----|-----|----------------|
| IMP-UX-009 | Уникальные QR/ссылки `?join=` | `032`, join token |
| IMP-ADM-004 | Скрытие вопросов `is_hidden` | `027` |
| IMP-PRD-009 | Мульти-медиа этап 1 | `030`–`031` |
| IMP-PRD-010 | Мульти-медиа этап 2 | layout, timeline, live-cue |
| IMP-SEC-008 (регрессия) | Grants `increment_team_score` | `034` |
| Автотесты | API + E2E join/hidden/grading | `test:api`, Playwright 6/6 |

**Остаток фазы 4:** ручной QA ([MANUAL_QA_CHECKLIST.md](MANUAL_QA_CHECKLIST.md)) и **выкат на prod** — перенесено в спринт 5 P0.

---

## Спринт 5 — Prod и следующий цикл (2026-06-11)

**Цель:** безопасно выйти на боевой Supabase/хостинг, закрыть минимальный QA-gate, затем — точечные улучшения без раздувания scope.

Чеклисты: [TEST_BACKLOG.md](TEST_BACKLOG.md) §«Перед prod», [MANUAL_QA_CHECKLIST.md](MANUAL_QA_CHECKLIST.md), [OPERATIONS.md](OPERATIONS.md).

### P0 — критично до prod (блокер релиза)

Без этого **не** объявлять prod-ready.

| # | Задача | ID / ссылка | Критерий готовности | Ответственный |
|---|--------|-------------|---------------------|---------------|
| 5.0 | `gstack-cso` на diff с миграцией **034** | IMP-SEC-008 | Нет новых дыр grants/RLS; отчёт без blockers | Агент / владелец |
| 5.1 | SQL на **prod**: migrate до **034** | — | `npm run db:migrate` · `db:verify-schema` OK | Ops |
| 5.2 | Reload schema (Dashboard → API) | — | RPC/view видны без 404 | Ops |
| 5.3 | Edge deploy + secrets | IMP-INF-001/002, IMP-PRD-002 | `player-upload`, `delete-game`, `generate-questions`; `edge:verify` | Ops |
| 5.4 | Prod env фронта | — | `VITE_*` на prod URL; **нет** service role в клиенте | Ops |
| 5.5 | Минимальный ручной gate | см. ниже | Все пункты ✅ в чеклисте | Тестер |
| 5.6 | Smoke на **prod URL** | — | `?join=` или код → lobby → 1 вопрос → табло → архив | Тестер |
| 5.7 | OPERATIONS + CHANGELOG | — | Чеклист мероприятия актуален; версия в CHANGELOG | Агент |
| 5.8 | xlsx advisory | npm audit | Риск задокументирован; Excel export проверен вручную | Тестер |

**Минимальный ручной gate (5.5)** — обязательные секции чеклиста:

- **Перед prod** в `TEST_BACKLOG` (кроме уже закрытых автотестами).
- **QA-D03** — полный заезд на телефоне (регистрация → игра → финиш).
- **QA-B07** — скрытые вопросы (IMP-ADM-004).
- **QA-B03b** — мульти-медиа этап 1.
- **QA-B03c** — layout / delay / live-cue (IMP-PRD-010).
- **QA-I01** — grading smoke (IMP-LOG-022 G1); I02–I04 — по возможности до prod, иначе сразу после в P1.

**Автоматика уже green:** `npm run build` · `test:unit` · `test:e2e` · `test:api` (test DB с **034**).

---

### P1 — желательно (сразу после prod или параллельно, если не блокирует выкат)

Улучшают качество на мероприятии; **не** блокируют первый prod, если P0 закрыт.

| # | Задача | ID | Заметка |
|---|--------|-----|---------|
| 5.9 | Grading UX G2–G4 | IMP-LOG-022 §14 | Regex validate, override preview, jury edges |
| 5.10 | Полный grading QA | QA-I02–I04 | После G2–G4 или параллельно |
| 5.11 | Load test отчёт | IMP-INF-006 | Перед мероприятием 50+ команд |
| 5.12 | Signed URLs для медиа | IMP-SEC-002 | После `gstack-cso`; отдельный PR |
| 5.13 | Админ: категория «Время» | IMP-ADM-001 | Мелкий UX в settings |
| 5.14 | Broadcast оповещений | IMP-PRD-008 | Расширение MessagePanel |
| 5.15 | Каталог IMP-RT-003 | IMP-RT-003 | Код есть (`gameChannelName`); пометить done или добить док |
| 5.16 | CDN / transform | IMP-INF-007 | Перед крупным ивентом с тяжёлым медиа |
| 5.17 | Регрессия BUG_AUDIT | TEST_BACKLOG §Sprint 1 | P0 сценарии C1–H7 на staging/prod |

---

### P2 — обсудить позже (бэклог без даты)

Не брать в спринт 5 без явного `accepted` в каталоге и согласования с владельцем.

| Группа | ID | Тема |
|--------|-----|------|
| **Архитектура** | IMP-ARC-001, 002, 003, 004 | Socket.IO, offline LAN, Meilisearch, ADR |
| **Продукт** | IMP-PRD-003, 004, 006, 011 | Team chat, co-op, типы вопросов, логотип |
| **UX** | IMP-UX-006, 007, 008 | Финиш-страница, табло с аватарами, темы/фон |
| **Логика** | IMP-LOG-002–006 | Speed-bonus, tie-rank, hints, пауза, multi-answer |
| **Realtime** | IMP-RT-004 | Отложенный Realtime 8s → настройка |
| **Безопасность** | IMP-SEC-004, 005, 006 | Пароль админа, self-reg, GDPR doc |
| **Данные** | IMP-DATA-002 | Soft-delete games |
| **Storage** | IMP-ST-002 | Серверный transcode |
| **Техдолг** | IMP-TD-006 | Консолидация Edge setup-* |
| **Админ** | IMP-ADM-002, 003 | Пауза UI, kick команды |

**Явный стоп-лист:** IMP-ARC-001/002 без отдельного решения владельца.

---

## Как вести прогресс

1. Перед взятием задачи — пометить ID в IMPROVEMENTS_CATALOG как `accepted` → `in_progress`.
2. По завершении — `done` + строка в CHANGELOG.
3. Отклонённые — `rejected` + комментарий «почему».

---

## Связь со старым BACKLOG

[BACKLOG.md](BACKLOG.md) содержит исторические чеклисты без ID. Новые решения — **только через IMPROVEMENTS_CATALOG**.
