# Чеклист отложенного тестирования

Всё, что нужно прогнать **вручную в браузере** после завершения серии фич (прогоны откладываем до готовности спринта).

Обновляйте этот файл по ходу разработки: `[ ]` — не проверено, `[x]` — ок.

**Для ручного прогона с отметками тестировщика** используйте [MANUAL_QA_CHECKLIST.md](MANUAL_QA_CHECKLIST.md) — там ✅/❌ и поле «Что вижу»; агент синхронизирует пройденное сюда.

См. также [TESTING.md](TESTING.md) для общих процедур.

---

## Перед выпуском в prod (обязательно)

Чеклист для релиза на **боевой** Supabase / хостинг — закрыть дыры продукта и зависимостей.

- [ ] **SQL на prod:** `npm run db:migrate` (журнал до **034** включительно) · `npm run db:verify-schema`
- [x] **Security smoke:** `npm run test:api` → security 8/8 + feature smoke (2026-06-11, migrate **034**)
- [x] **Автоскрипты:** `npm run build` · `npm run test:api` · `npm run test:e2e` (6 UI + API)
- [ ] **npm audit:** `npm audit fix` (2026-06-11: 17→3); остаток: xlsx (no fix), jspdf/postcss — только с `--force` + retest PDF export
- [ ] **Edge:** deploy + secrets (`player-upload`, `delete-game`, `generate-questions`)
- [ ] **Prod env:** `VITE_PUBLIC_URL`, ключи Supabase, без service role в клиенте
- [ ] **OPERATIONS.md** — чеклист перед мероприятием
- [ ] **Smoke на prod URL:** регистрация (`?join=` / код) → игра → табло → архив

*2026-06-11 — migrate 034 (IMP-SEC-008 grants); `test:api` + Playwright join/hidden/invalid-code*

---

## Спринт 2 — опыт мероприятия

### IMP-UX-001 Комната ожидания
- [ ] Команда регистрируется → видит lobby, игра не стартует сама
- [ ] Админ/ведущий нажимает «Старт» → у игрока переход в GamePlay без перезагрузки
- [ ] Поздняя регистрация после старта блокируется

### IMP-UX-002 QR и deep link
- [x] `/team/register?code=XXXX` открывает форму с подставленным кодом (headless QA 2026-06-06)
- [x] QR в GameControls / HostView сканируется с телефона (retest 2026-06-08, T-005)
- [x] Неверный код в query — понятная ошибка (Playwright `e2e/registration-code.spec.ts`, 2026-06-11)

### IMP-UX-003 Экран ведущего
- [ ] `/host/:code` — код, QR, список команд, старт/пауза (для залогиненного админа)
- [ ] Ссылка на admin scoreboard работает

### IMP-UX-004 PWA
- [ ] `npm run build && npm run preview` — в DevTools Application есть SW и manifest
- [ ] Android Chrome: «Установить приложение» / добавить на главный экран
- [ ] iOS Safari: «На экран Домой» (Add to Home Screen)
- [ ] Офлайн: shell грузится, игра требует сеть (ожидаемо)

### IMP-UX-005 Скрыть табло до финиша
- [x] В GameEditor включить «Скрыть табло до финиша» → сохранить
- [ ] Во время игры `/scoreboard/:code` — отказ с текстом «после завершения» (retest T-007: частично)
- [ ] После финиша ведущим — табло открывается **с очками** + auto-navigate игрокам
- [ ] С флагом выкл. — табло с результатами после финиша для участников

### IMP-PRD-001 Код игры 3–10 символов
- [x] Создание/редактирование: буквы и цифры, 3–10 символов (retest 2026-06-08, QA-B04)
- [x] Дубликат кода — ошибка валидации / БД
- [x] Настройка длины автогенерации в админке → Общие (migrate 019)

### Админка (фиксы стабильности)
- [ ] Селекты игр в «Настройки» / «Управление командами» не пустые после открытия секций
- [ ] Управление командами: список грузится без `Failed to fetch`
- [ ] Смена игры в селекте — подгружаются команды этой игры
- [ ] Удаление команд (без Edge `delete-teams` — client fallback)
- [ ] AdminScoreboard / ScoreboardDetailed: нет зависаний, счёт обновляется

---

## Спринт 3 — в работе

### IMP-RT-001 Realtime Broadcast для счёта
- [ ] Игрок отвечает → счёт на `/scoreboard-admin/:code` обновляется **без заметной задержки** (< 1 с)
- [ ] То же на `/scoreboard/:code` (игрок) и `/scoreboard-detailed/:code`
- [ ] Новая команда регистрируется → появляется на табло (postgres INSERT / teams_changed)
- [ ] Сброс заезда → очки 0 на всех табло
- [ ] 3+ команды отвечают одновременно — нет «залипания» счёта

### IMP-RT-002 (закрыт ранее)
- [ ] AdminScoreboard: нет poll 5 с, только realtime (проверить в Network — нет частых list teams)

### IMP-RT-003 Единый канал (частично с RT-001)
- [ ] В логах Realtime один канал `game:{uuid}` на игру для счёта

### IMP-LOG-001 Серверный scoring
- [x] Применить миграцию: `npm run db:migrate` или `npm run db:migrate:013` (файл `013_submit_auto_answer.sql`) — RPC работает (e2e + qa-extended)
- [x] Правильный текстовый ответ → очки на табло совпадают с формулой (API: Q1=172, Q2=72, total=244)
- [ ] Неправильный ответ → 0 очков на сервере даже если в payload подставить `is_correct: true` (прямой insert в БД в обход RPC — для аудита)
- [ ] Множественный выбор: частичный ответ 0.5 / 0.3 множитель
- [ ] Подсказки уменьшают score (hints_used в RPC)
- [ ] Fallback без RPC: игра всё ещё сохраняет ответ (предупреждение в логах)

### IMP-PRD-002 AI-генерация вопросов (Qwen + DeepSeek, не Gemini)
- [ ] `npm run edge:deploy` — задеплоить `generate-questions`
- [ ] Supabase secrets: `DASHSCOPE_API_KEY`, `DEEPSEEK_API_KEY`
- [ ] GameEditor: тема + 3 вопроса через Qwen → появляются в списке, затем «Сохранить вопросы»
- [ ] DeepSeek: тот же сценарий (переключатель провайдера)
- [ ] Ошибка без секретов — понятное сообщение, ключи не в клиенте / Network
- [ ] Сгенерированные choice-вопросы: 4 options, один answer

### IMP-INF-004 Docker Compose
- [ ] `cp .env.docker.example .env` + ключи Supabase
- [ ] `docker compose up -d --build` — UI на :8080
- [ ] SPA-роуты: `/admin/login`, `/team/register`, refresh на вложенном URL
- [ ] С телефона по LAN-IP (не 172.18.x)

### IMP-DATA-001 Архив сессии
- [ ] `npm run db:migrate:014` на Supabase + Reload schema
- [ ] Завершить игру → запись в `event_archive` (команды, очки, csv_content)
- [ ] AdminPanel → иконка «История» → список заездов → скачать CSV
- [ ] Удалить игру → архив остаётся (`game_id` NULL)

---

## Регрессия (каждый прогон)

- [x] Регистрация + 2 ответа + финиш (API: `e2e-game-flow.mjs`, `qa-extended.mjs`)
- [x] Пауза от админа блокирует ввод (API: `is_paused` toggle OK; UI — вручную)
- [ ] Экспорт Excel с admin scoreboard
- [ ] Chrome + один мобильный браузер

---

## BUG_AUDIT Sprint 1 — полный ручной прогон (2026-06-08)

Код всех пунктов в `main` (коммиты `7ae8503`…`293f8d2`). Прогон **одним заходом** на staging/test Supabase.
Отмечайте `[x]` по мере проверки.

### 0. Подготовка (один раз перед прогоном)

- [ ] `git pull` → ветка `main` содержит `293f8d2` или новее
- [ ] `npm run build` — без ошибок
- [ ] `node scripts/e2e-game-flow.mjs` — «Все проверки пройдены»
- [ ] `npm run db:verify-schema` — объекты RPC/view OK (journal gaps допустимы на legacy БД)
- [ ] `npm run db:migrate` или точечно `db:migrate:016`…`018` — если объекты 018 отсутствуют
- [ ] `npm run edge:deploy` — `player-upload`, `delete-game`, `delete-teams` с актуальным кодом
- [ ] Supabase Dashboard → API → **Reload schema** после миграций
- [ ] Оборудование: **PC (админ)** + **2+ телефона** (iPhone + Android) + опционально проектор для табло
- [ ] Один Wi‑Fi; dev: `npm run dev -- --host`, телефоны по LAN-IP

---

### 1. P0 — корректность игры

#### C1 / IMP-LOG-007 — возврат в лобби после «Начать заново»
- [ ] 2 команды в игре (ответили минимум по 1 вопросу)
- [ ] Админ: «Начать заново» / `restart_to_lobby`
- [ ] **Все** устройства (PC + телефоны) в лобби ≤ 20 с, без перезагрузки
- [ ] DevTools/jsonl: нет `blocked lobby regression`; `lobbyEpoch` растёт

#### C2 / IMP-LOG-015 — гонка fetchGameState
- [ ] iPhone: старт → пауза админом → resume — состояние не «откатывается»
- [ ] Быстрые клики «Обновить» / смена паузы — нет мигания старым `game_state`

#### H1 / IMP-LOG-010 — первый вопрос не skip'ится
- [ ] Приватная вкладка / очистка site data
- [ ] Лобби (prefetch вопросов) → админ «Старт»
- [ ] Первый вопрос виден **полное** время таймера, не мгновенный skip

#### H2 / IMP-LOG-008 — доступ не только в лобби
- [ ] Игра уже `playing`; новая регистрация по коду → отказ «Игра уже началась…»
- [ ] Прямой `/game/<code>` с «чужой»/несуществующей сессией → отказ

#### H3 / IMP-LOG-008/009 — fail-closed при сети
- [ ] Лобби: авиарежим → «Нет связи» / ожидание
- [ ] Сеть вкл. → проверка доступа проходит, вход в игру OK
- [ ] Симуляция offline **до** первой успешной проверки → экран ошибки + «Повторить» (не silent allow)

#### H7 / IMP-LOG-011 — очки чужих команд в кэше
- [ ] 2+ команды, у обеих есть очки на табло
- [ ] Ответ одной команды → на устройстве другой **не** обнуляются чужие `total_score` в лобби/списке

---

### 2. P1 — устойчивость и realtime

#### H4 / IMP-LOG-012 — утечка таймера broadcast
- [ ] DevTools Console: 10+ ответов подряд или серия старт/пауза
- [ ] **Нет** `Unhandled Promise Rejection` / `broadcast send timeout` через 1.5 с после успешного действия

#### H5 / IMP-LOG-014 — завершение на `/host/`
- [ ] `/host/<code>` (залогиненный админ) → «Завершить игру»
- [ ] Кнопка не зависает; `finished`; запись в `event_archive` (если 014 применена)
- [ ] Регрессия: «Завершить» из GameControls в админке — OK

#### H6 / IMP-RT-005 — poll-fallback табло
- [ ] Табло `/scoreboard-admin/<code>`: отключить Wi‑Fi на 30 с → счёт догоняет ≤20 с после включения
- [ ] `/scoreboard/<code>` (игрок) — то же
- [ ] HostView: новая команда в списке ≤20 с без reload
- [ ] При хорошей сети realtime быстрее poll (нет регрессии)

#### M7 / IMP-LOG-013 — broadcast timeout mobile
- [ ] iPhone/Android: меньше ложных `broadcast send timeout` (6 с vs 1.5 с)
- [ ] Desktop: поведение без регрессии

#### M1 / IMP-LOG-017 — полные вопросы после старта
- [ ] Вопрос с подсказками и media_url в редакторе
- [ ] Лобби (лёгкий prefetch) → старт → в GamePlay видны **подсказки** и **медиа**

#### M2 / IMP-LOG-018 — таймер vs submit
- [ ] Ответ в последнюю секунду таймера — вопрос не skip'ится дважды
- [ ] Нет двойного advance при медленной сети

#### M4 / IMP-LOG-019 — спиннер «Обновить»
- [ ] Игра без вопросов → «Обновить» — спиннер гаснет (не бесконечный)

#### M5 / IMP-LOG-020 — delete команд/игры
- [ ] Админ: удалить команду → исчезает на табло/лобби без reload (broadcast)
- [ ] Удалить игру из списка — не блокирует UI (enqueueCritical)

#### M6 / IMP-LOG-016 — lobby teams + lookup
- [ ] Новая регистрация → force refresh списка команд в админке без stale in-flight
- [ ] Повторный вход по коду: lookup мгновенный; смена title игры видна ≤60 с

---

### 3. P2 — гигиена

#### S7 / IMP-INF-009 — schema drift
- [ ] `npm run db:verify-schema` — RPC `register_team`, view `questions_player` OK
- [ ] `docs/sql-migrations/00_run_all.sql` помечен deprecated в комментарии

#### L1 / IMP-RT-006 — ephemeral broadcast channel
- [ ] DevTools: после серии broadcast без подписчиков нет роста «висящих» Realtime-каналов (memory stable при длительной сессии)

#### L4 / IMP-ST-004 — upload guard
- [ ] Аватар >5 МБ или `.exe` — отказ **до** upload, понятное сообщение
- [ ] Валидный JPEG/WebP аватар после игры — upload OK
- [ ] Медиа ответа >50 МБ — отказ; валидное фото/видео — OK

#### L5 / IMP-TD-008 — admin select (регрессия)
- [ ] AdminPanel → Настройки / Сообщения — данные грузятся без ошибок PostgREST

#### L6 / IMP-INF-010 — test Edge не в prod
- [ ] `npm run edge:verify` — в списке deploy **нет** `test-*` функций

---

### 4. Безопасность (staging / test project только)

> Требует миграции 018 + Edge deploy. **Не** гонять destructive-тесты на production.

#### S5 / IMP-SEC-007/009 — session token + без эталона
- [ ] e2e: регистрация возвращает session token; `submit_auto_answer` без токена → ошибка
- [ ] Network (игрок): SELECT `questions_player` — поля `answer` **нет**
- [ ] Попытка submit с чужим `team_id` + свой token → отказ

#### S4 / IMP-SEC-008 — increment_team_score
- [ ] REST anon вызов `increment_team_score` → 401/403 или RPC error

#### S3 / IMP-SEC-010 — anon UPDATE teams/answers
- [ ] REST anon PATCH чужой `teams.total_score` → отказ RLS
- [ ] anon INSERT в `answers` напрямую → отказ

#### S2 / IMP-SEC-011 — player-upload
- [ ] Edge `player-upload` без session token → 400/403
- [ ] bucket вне whitelist / path без `{gameId}/` → отказ

#### S1 / IMP-SEC-012 — delete Edge
- [ ] `delete-game` без admin JWT → 401/403
- [ ] С валидным admin JWT → OK (на **тестовой** игре)

#### S6 — admin auth (регрессия)
- [ ] `/admin` без логина → redirect `/admin/login`
- [ ] Legacy вход с паролем в query/filter **не** используется

---

### 5. Регрессия спринта (каждый прогон)

- [x] API: `node scripts/e2e-game-flow.mjs`
- [ ] Полный заезд: регистрация 2 команд → 3+ вопроса → финиш → аватар после игры
- [ ] Пауза админом блокирует ввод игрока
- [ ] Экспорт Excel/PDF с admin scoreboard
- [ ] Chrome desktop + один мобильный браузер

---

### 6. Спринт 2–3 (по необходимости)

См. секции ниже (IMP-UX, IMP-RT-001, IMP-LOG-001 UI, IMP-PRD-002, Docker, archive…).

---

## BUG_AUDIT — пакетный ручной прогон (legacy, см. § Sprint 1 выше)

Авто: `npm run build` на каждый IMP. **Актуальный чеклист — секция «BUG_AUDIT Sprint 1» выше.**

### IMP-LOG-011 (H7 — счёт чужих команд в кэше)
- [ ] 2+ команды в лобби, у обеих есть очки на табло
- [ ] Админ «Начать заново» / sync счёта с сервера → очки **второй** команды на устройстве первой не обнуляются
- [ ] Player scoreboard / список команд в лобби показывает корректные `total_score`

### IMP-LOG-012 (H4 — утечка таймера broadcast)
- [ ] DevTools Console: 5–10 ответов подряд (или старт/пауза админом) — **нет** `Unhandled Promise Rejection` / `broadcast send timeout` через ~1.5 с после успешного действия
- [ ] Счёт на табло по-прежнему обновляется (регрессия RT-001)

### IMP-LOG-013 (M7 — broadcast timeout mobile)
- [ ] iPhone/Android: ответы в игре — в логах меньше `broadcast send timeout` (было 1.5с, стало 6с)
- [ ] Desktop: поведение без регрессии (1.5с)

### IMP-LOG-014 (H5 — host finish)
- [ ] `/host/:code` → «Завершить игру» — кнопка не зависает, состояние `finished`, архив в `event_archive` (если миграция есть)
- [ ] Регрессия: «Завершить» из GameControls в админке — по-прежнему OK

### IMP-RT-005 (H6 — scoreboard poll-fallback)
- [ ] Отключить Wi‑Fi на проекторе/табло → через ≤20с счёт догоняет REST (Admin + Player scoreboard)
- [ ] HostView: новая команда появляется в списке ≤20с без reload
- [ ] Realtime по-прежнему обновляет быстрее при хорошей сети

### IMP-LOG-015 (C2 — fetchGameState race)
- [ ] iPhone: быстрый старт → пауза → resume — состояние не «прыгает» назад на устаревший snapshot
- [ ] Админ «Начать заново» / force refresh `game_state` — игроки видят актуальное состояние

### IMP-LOG-016 (M6 — lobby teams + lookup)
- [ ] Админка: регистрация новой команды → force refresh списка команд без ожидания старого in-flight
- [ ] Повторный вход по коду игры: кэш lookup отдаётся сразу, но через ≤60с фоном подтягивается свежий `games` row (изменение title/theme)

---

## Retest 2026-06-08 (волна 1–3, релиз **v1.2.16**)

| ID | Статус | Пункт чеклиста |
|----|--------|----------------|
| P-001 QR/LAN | ✅ | QA-C01, QA-H04 (T-005) |
| P-002 сообщения | ✅ | QA-D09 (T-006) |
| P-003 аватары | ✅ | QA-D06 (T-006) |
| P-005 PDF кириллица | ✅ | QA-E04 (T-008) |
| P-008 архив заездов | ✅ | QA-F06 (T-004) |
| P-009 / P-013 удаление в лобби | ✅ | QA-F04 (T-003) |
| P-010 табло после финиша | ✅ | QA-B06, QA-D01, QA-E02 (T-007) |
| P-011 / P-012 детализ. табло | ✅ | QA-E06 |
| QA-B04 код 3–10 | ✅ | QA-B04 — migrate 019–020 |
| QA-G04 security-smoke | ✅ | 8/8 после migrate 018 + 021 |
| T-002 / D07 sync score | ⏸ | QA-D07 — после формулы очков |

### Открыто

- **QA-D07** — синхронизация чужих очков 15–20 с (с формулой очков)
- **Перед prod** — см. § «Перед выпуском в prod» (npm audit, migrate на prod, CI)

---

## Retest 2026-06-08 (волна 1–3, релиз **v1.2.16**) — архив заметок

### Было открыто (закрыто)

- ~~**QA-B04**~~ — код 3–10, настройка в админке
- ~~**QA-G04 / S3**~~ — RLS + legacy `Allow all` (021)

### Отложено (актуально)

- **QA-D07** — синхронизация чужих очков 15–20 с (с формулой очков)

---

## Retest 2026-06-08 (волна 1 фиксов P-001…P-008) — архив

| ID | Статус | Пункт чеклиста |
|----|--------|----------------|
| P-001 QR/LAN | ✅ | QA-C01, QA-H04 (T-005) |
| P-002 сообщения | ✅ | QA-D09 (T-006) |
| P-005 PDF кириллица | ✅ | QA-E04 (T-008) |
| P-008 архив заездов | ✅ | QA-F06 (T-004) |
| P-004 удаление в лобби (частично) | 🔁 | QA-F04 (T-003) — телефон удалённой команды |
| P-003 аватары | ❌ | QA-D06 (T-006) |
| P-007 табло (неверная трактовка) | 🔁 | QA-B06, QA-D01, QA-E02 (T-007) |
| — детализ. табло админ | ❌ | QA-E06 (реgression) |
| T-002 / D07 sync score | ⏸ | QA-D07 — после формулы очков |

### Следующая волна (код) — волна 2 **реализована**, ждём retest

1. ~~**P-011**~~ — детализ. табло из админки  
2. ~~**P-010**~~ — политика табло  
3. ~~**P-009**~~ — выход удалённой команды  
4. ~~**P-003**~~ — аватары (retest)  

**Retest:** T-003, T-006 (аватары), T-007, QA-E06.

### Отложено

- **QA-D07 / IMP-LOG-011** — задержка синхронизации счёта 15–20 с; retest вместе с доработкой **формулы начисления очков** (не чинить изолированно).

---

*Последнее обновление: 2026-06-08 — QA-B04, security 021, чеклист «Перед prod».*
