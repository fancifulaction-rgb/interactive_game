# Каталог улучшений Quest Game

Нумерованный реестр идей для принятия решений: **брать в разработку** или **отклонить**.  
При работе ссылайтесь на ID (например: «реализуем IMP-UX-001»).

**Статус по умолчанию:** `proposed`, если не указано иное.

**Спринты:** [ROADMAP.md](ROADMAP.md).

---

## Как пользоваться

1. Обсуждаете фичу → находите ID или добавляете новый в конец категории.
2. Решение «берём» → статус `accepted`, привязка к спринту в ROADMAP.
3. Реализовали → `done` + CHANGELOG.
4. Не нужно → `rejected` + причина в примечании.

---

## A. Инфраструктура и масштабирование (IMP-INF)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-INF-001 | Deploy `player-upload` | Edge upload с service role, меньше сбоев RLS | Buzzr, Zappy | 1 | done |
| IMP-INF-002 | Deploy `delete-game` | Удаление игры + Storage без сирот | DATA_LIFECYCLE | 1 | done |
| IMP-INF-003 | RPC `increment_team_score` | Атомарный UPDATE счёта в Postgres | Quizz, best practice | 1 | done |
| IMP-INF-004 | Docker Compose self-host | `docker compose up` — nginx + dist, `.env.docker.example`, [DOCKER_COMPOSE.md](DOCKER_COMPOSE.md) | Quizz, ClassQuiz | 3 | done |
| IMP-INF-005 | CI build + e2e | GitHub Actions на PR | Standard | 1 | done |
| IMP-INF-006 | Load test 20–100 VU | k6/Artillery, отчёт LOAD_TEST | QuizLive scale | 3 | proposed |
| IMP-INF-007 | CDN / Image Transform | Supabase transform или Cloudflare перед Storage | Production | 3 | proposed |
| IMP-INF-008 | Мониторинг 429/reset | Алерты Supabase Dashboard + runbook | Operations | 1 | done |

---

## B. Realtime и табло (IMP-RT)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-RT-001 | Realtime Broadcast для счёта | `channel.send` вместо части postgres_changes | Supabase docs | 3 | done |
| IMP-RT-002 | Убрать poll 5s AdminScoreboard | Снизить REST при проекторе | Внутренний техдолг | 3 | done |
| IMP-RT-003 | Единый канал на game_id | Один channel/game для state+score | Architecture | 3 | proposed |
| IMP-RT-004 | Отложенный Realtime 8s → настройка | Флаг в settings игры | PlayerScoreboard | — | proposed |

---

## C. Игровая логика и честность (IMP-LOG)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-LOG-001 | Серверный scoring для авто-вопросов | RPC `submit_auto_answer`: answer+time+hints; сервер считает points | QuizLive SCORING | 3 | done |
| IMP-LOG-002 | Speed-bonus режим (опционально) | 500 + бонус за скорость + streak | Quizz | — | proposed |
| IMP-LOG-003 | Tie-aware ranking на табло | 1-2-2-4 как QuizLive | QuizLive | — | proposed |
| IMP-LOG-004 | Пересмотр штрафов подсказок | Исправить пропадающие hints | BACKLOG | — | proposed |
| IMP-LOG-005 | Пауза и итоговый счёт | Проверить формулу при is_paused | BACKLOG | — | proposed |
| IMP-LOG-006 | Множественные варианты ответов | Полная поддержка в UI/БД | guides/MULTIPLE_ANSWERS | — | proposed |
| IMP-LOG-007 | Возврат в лобби после restart_to_lobby | `shouldBlockLobbyRegression`: разрешать playing→lobby при новее `updated_at` или `lobbyEpoch++` | BUG_AUDIT_HANDOFF C1 | 1 | done |
| IMP-LOG-008 | Проверка доступа игрока вне лобби | `getPlayAccessDenial` при `sessionKnown`, fail-closed + retry при сетевой ошибке | BUG_AUDIT_HANDOFF H2/H3 | 1 | done |
| IMP-LOG-009 | Живая проверка доступа (без кэша) | `force` + invalidate `game_state`; повтор при lobby→playing; честный статус сети в лобби | BUG_AUDIT H3 QA | 1 | done |
| IMP-LOG-010 | Не скипать первый вопрос при timeLeft=0 | `timerArmedRef` + инициализация таймера при prefetch/входе в игру | BUG_AUDIT_HANDOFF H1 | 1 | done |
| IMP-LOG-011 | Счёт чужих команд в кэше игрока | `syncPlayerTeamScoreFromServer` сохраняет `t.total_score` для остальных | BUG_AUDIT_HANDOFF H7 | 1 | done |
| IMP-LOG-012 | Очистка таймера broadcast send | `clearTimeout` в `finally` у `channelSendWithTimeout` | BUG_AUDIT_HANDOFF H4 | 1 | done |
| IMP-LOG-013 | Таймаут broadcast на mobile | 6с на mobile UA, 1.5с на desktop | BUG_AUDIT_HANDOFF M7 | 1 | done |
| IMP-LOG-014 | Завершение игры на /host | `loadExportData` без `enqueueCritical`; boost на host-route | BUG_AUDIT_HANDOFF H5 | 1 | done |

---

## D. UX на мероприятии (IMP-UX)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-UX-001 | Комната ожидания | Общий старт после регистрации всех | Zappy, BACKLOG | 2 | done |
| IMP-UX-002 | QR-код на регистрацию | `?code=XXXX` deep link | QuizLive | 2 | done |
| IMP-UX-003 | Экран ведущего (host view) | Проектор: код, QR, старт, пауза | TimesUp, QuizLive | 2 | done |
| IMP-UX-004 | PWA | manifest + SW, иконка на телефоне | QuizLive, BACKLOG | 2 | done |
| IMP-UX-005 | Скрыть табло до финиша | Настройка игры | BACKLOG | 2 | done |
| IMP-UX-006 | Финиш: только поздравление vs табло | `finish_page_type` расширить | BACKLOG | proposed | proposed |
| IMP-UX-007 | Улучшить табло (фото команд) | Крупные аватары, анимации | BACKLOG | proposed | proposed |
| IMP-UX-008 | Темы: фон без налезания на вопрос | Снег/анимации | BACKLOG | proposed | proposed |

---

## E. Продукт и контент (IMP-PRD)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-PRD-001 | Код игры 6 символов + буквы | Уникальность, читаемость | BACKLOG | 2 | done |
| IMP-PRD-002 | AI-генерация вопросов | Edge `generate-questions` + **Qwen или DeepSeek**; панель в GameEditor | Zappy, Buzzr | 3 | done |
| IMP-PRD-003 | Team chat в discussion phase | Приватный чат команды | Zappy | — | proposed |
| IMP-PRD-004 | Co-op mode (все ответили) | Режим гонки команд | Zappy | — | proposed |
| IMP-PRD-005 | Дата создания в списке игр | AdminPanel | BACKLOG | 2 | done |
| IMP-PRD-007 | Клонирование игры (новый заезд) | Новый код, название, тема; без команд/ответов | BACKLOG | 2 | done |
| IMP-PRD-006 | Упростить типы вопросов в редакторе | UX GameEditor | BACKLOG | proposed | proposed |
| IMP-PRD-007 | Логотип на приветственной | Home + settings | BACKLOG | proposed | proposed |
| IMP-PRD-008 | Расширить оповещения админа | Broadcast всем игрокам | BACKLOG | proposed | proposed |

---

## F. Данные и жизненный цикл (IMP-DATA)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-DATA-001 | Архив сессии + CSV | `event_archive` при финише; история в AdminPanel + CSV | QuizLive | 3 | done |
| IMP-DATA-002 | Мягкое удаление games | `deleted_at` + retention | DATA_LIFECYCLE | proposed | proposed |
| IMP-DATA-003 | Очистка Storage в client fallback | deleteGame без Edge | DATA_LIFECYCLE | 1 | done |
| IMP-DATA-004 | Таблица event_archive | Агрегаты после игры | GDPR/отчёты | 3 | done |

---

## G. Безопасность (IMP-SEC)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-SEC-001 | Ужесточить RLS | Игрок только своя game; админ auth | Security best practice | 1–2 | done |
| IMP-SEC-002 | Private buckets + signed URLs | Медиа не по guess path | Production | 3 | proposed |
| IMP-SEC-003 | Убрать service role с клиента | Только Edge/scripts | BACKLOG | 1 | done |
| IMP-SEC-004 | Смена пароля админа без plaintext | AdminPanel | BACKLOG | proposed | proposed |
| IMP-SEC-005 | Регистрация админа по email | Self-service | BACKLOG | proposed | proposed |
| IMP-SEC-006 | Документ PRIVACY_GDPR | EU корпоративы | Optional doc | proposed | proposed |

---

## H. Storage и медиа (IMP-ST)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-ST-001 | Лимит длительности видео на клиенте | Сжатие перед upload | Scale | proposed | proposed |
| IMP-ST-002 | Серверное перекодирование видео | Edge ffmpeg (тяжело) | — | proposed | proposed |
| IMP-ST-003 | Префикс game_id во всех paths | Упрощение delete-game | DATA_LIFECYCLE | 1 | done |

---

## P. Производительность клиента (IMP-PERF)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-PERF-001 | Admin+player HTTP contention | In-flight dedupe games/questions; player fetch boost; lighter lobby SELECT; coalesce admin poll | iPhone jsonl QA038Q | 1 | done |

---

## I. Техдолг и качество кода (IMP-TD)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-TD-001 | Заменить select('*') | AdminScoreboard, Scoreboard, export | Audit | 1 | done |
| IMP-TD-002 | Удалить debug #region agent log | После подтверждения стабильности | BUGS_FOUND | proposed | proposed |
| IMP-TD-003 | Playwright E2E | register→play→scoreboard | Testing | proposed | proposed |
| IMP-TD-004 | Code-split xlsx/jspdf | Не грузить на player routes | Bundle size | proposed | proposed |
| IMP-TD-005 | Unit-тесты scoring.ts | calculateQuestionScore | Testing | proposed | proposed |
| IMP-TD-006 | Консолидация Edge setup-* | Один setup script | EDGE_FUNCTIONS | proposed | proposed |

---

## J. Архитектура (долгосрочно) (IMP-ARC)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-ARC-001 | Socket.IO + Redis game server | Синхронные раунды как Kahoot | Buzzr, ClassQuiz | — | proposed |
| IMP-ARC-002 | Offline-first LAN режим | Без интернета | AirQuiz | — | proposed |
| IMP-ARC-003 | Meilisearch для поиска игр | ClassQuiz | — | proposed | proposed |
| IMP-ARC-004 | ADR: Supabase-only vs WS | Документ решения | Architecture | proposed | proposed |

---

## K. Админка и настройки (IMP-ADM)

| ID | Название | Описание | Источник | Спринт | Статус |
|----|----------|----------|----------|--------|--------|
| IMP-ADM-001 | Редактирование категории «Время» | settings UI | BACKLOG | proposed | proposed |
| IMP-ADM-002 | Общая пауза UI в GameControls | Уже частично есть | BACKLOG | proposed | proposed |
| IMP-ADM-003 | Kick игрока/команды | Как Buzzr presenter | Buzzr | proposed | proposed |

---

## L. Уже реализовано (для истории)

| ID | Название | Статус |
|----|----------|--------|
| IMP-DONE-001 | requestQueue critical/background | done |
| IMP-DONE-002 | gamePlayCache + teamsSnapshot | done |
| IMP-DONE-003 | Аватар после игры + jitter | done |
| IMP-DONE-004 | Ранняя navigate при регистрации | done |
| IMP-DONE-005 | Оптимистичный ответ + saveAnswer queue | done |
| IMP-DONE-006 | debugLog за флагом VITE_DEBUG_LOG | done |
| IMP-DONE-007 | Удалён fetchWithRetry | done |
| IMP-DONE-008 | builtinThemes на player routes | done |
| IMP-DONE-009 | SCALING.md + measure-latency.mjs | done |

---

## Добавление новой идеи

Шаблон:

```markdown
| IMP-XX-NNN | Краткое имя | Описание 1-2 предложения | Откуда идея | Спринт? | proposed |
```

Выберите категорию (INF, RT, LOG, UX, PRD, DATA, SEC, ST, TD, ARC, ADM).

---

*Версия каталога: 2026-06-04. Всего предложений: 50+ (без DONE).*
