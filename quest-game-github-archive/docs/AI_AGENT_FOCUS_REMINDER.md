# Периодический промпт: фокус и подчистка (Quest Game)

Вставляйте **каждые 1–2 часа** длинной сессии, после перерыва, при смене задачи или если агент «уплыл».

Короткая версия для paste: [AI_AGENT_PROMPTS_SHORT.md](AI_AGENT_PROMPTS_SHORT.md) §2.

---

## Якорь владельца (обновляйте вручную)

```
Текущий фокус: багфиксы по docs/BUG_AUDIT_HANDOFF.md. Порядок: P0-корректность (C1, H2, H3, H7),
затем H1/H4/H5/H6, затем C2/M6. Один пункт = один IMP = один коммит.
Security-блок S1–S6 — ТОЛЬКО по согласованию (миграции + Edge + сессия команды), не на прод вслепую.
Сделано: realtime-fallback (admin poll 6с; player postgres_changes + частый poll на паузе).
Не начинать: Socket.IO, новый бэкенд, рефактор без IMP-*, RLS/Edge на прод без «да».
```

---

## Текст для копирования агенту

```
═══ QUEST GAME — ФОКУС + ПОДЧИСТКА ═══

Проект: командные квесты на мероприятиях, 2–100 команд, Supabase-only, v1.2.15.
Главная ценность — стабильная игра на телефонах при слабом Wi‑Fi. Враг — шторм параллельных запросов к *.supabase.co.
Решение в коде: requestQueue (critical + fetch), coalesce GET, gameRealtime hub, аватар после игры.

Якорь владельца (если не совпадает с задачей — спроси):
  Багфиксы по docs/BUG_AUDIT_HANDOFF.md (P0-корректность раньше security) — см. ROADMAP и checkpoint.

═══ A. САМОПРОВЕРКА (ответь кратко) ═══

A1) Пункт BUG_AUDIT_HANDOFF / IMP-ID этой сессии?
A2) Сделано за последние 1–2 ч (файлы, результат)?
A3) Отклонения от аудита / каталога без согласования?
A4) Риски: parallel Supabase, select('*'), service role во фронте, новый канал Realtime без hub, RLS/Edge на прод без «да»?
A5) Git: git status -sb — что не закоммичено и зачем?

Если A1 пустой — стоп, согласуй задачу с владельцем, не придумывай фичу.

═══ B. ПОДЧИСТКА (пройди чеклист, исправь что забыл) ═══

[ ] Нет «висящих» правок вне текущего IMP (лишние файлы в git status)
[ ] build после последних правок src/: npm run build (или отметь «не менял src»)
[ ] Документация: если менял контракт — строка в CHANGELOG [Unreleased] / BUGS_FOUND
[ ] IMPROVEMENTS_CATALOG: статус in_progress актуален
[ ] Нет нового hot-path без очереди (все REST → supabase.ts)
[ ] Нет дублирующего GET (prefetchGameQuestions / fetchGameState / fetchLobbyTeams)
[ ] DEV-мусор: лишний console.log, временные #region agent log — убрать или в backlog IMP-TD-002
[ ] Секреты не в staged diff

═══ C. STOP (если думаешь об этом — согласовать IMP-ID) ═══

Socket.IO (IMP-ARC-001), отдельный API-сервер, большой рефактор UI, убрать requestQueue «для простоты»,
PWA/AI/комната ожидания вне задачи владельца.

═══ D. ПАМЯТЬ СЕССИИ (5–8 буллетов в конце ответа) ═══

• Активные IMP-ID и статус
• Решения этой сессии (факты)
• Файлы-зоны риска (requestQueue, gameRealtime, …)
• Следующий один шаг
• Ветка / последний коммит
• Нужен ли commit+push до конца блока

При паузе >30 мин или перед уходом — gstack-context-save.
Сообщи владельцу: «Фокус восстановлен», A1–A5, что подчистил из B, память D, следующий шаг.
```

---

## Как использовать владельцу

| Когда | Действие |
|-------|----------|
| Каждые 1–2 ч / после обеда | Блок выше |
| Агент предлагает «переписать архитектуру» | Этот файл + «только IMP-___» |
| Перед сменой агента | [AI_AGENT_HANDOFF_PROMPT.md](AI_AGENT_HANDOFF_PROMPT.md) |
| Начало нового чата | [AI_AGENT_PROMPTS_SHORT.md](AI_AGENT_PROMPTS_SHORT.md) §1 |

## Cursor Rules

| Файл | Назначение |
|------|------------|
| `quest-game-focus.mdc` | Спринт, STOP, ссылки на docs |
| `quest-game-player-network.mdc` | Очередь, fetch, iPhone |
| `quest-game-gstack.mdc` | review, QA, context-save |

## Связанные документы

- [AI_AGENT_PROMPTS_SHORT.md](AI_AGENT_PROMPTS_SHORT.md)
- [AI_AGENT_HANDOFF_PROMPT.md](AI_AGENT_HANDOFF_PROMPT.md)
- [BUG_AUDIT_HANDOFF.md](BUG_AUDIT_HANDOFF.md)
- [AGENTS.md](../AGENTS.md)
- [ROADMAP.md](ROADMAP.md)

*Версия: 2026-06-07 (фокус: багфиксы по BUG_AUDIT_HANDOFF).*
