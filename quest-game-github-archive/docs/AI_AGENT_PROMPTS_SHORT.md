# Короткие промпты для Cursor (Quest Game)

Копируйте блоки ниже в чат. Домен и правила кода уже в `.cursor/rules/` — длинный онбординг не нужен.

Полная версия (архив): [AI_AGENT_ONBOARDING_PROMPT.md](AI_AGENT_ONBOARDING_PROMPT.md).

---

## 1. Стартовый (новый агент)

```
Quest Game — ведущий full-stack инженер. Рабочая папка: quest-game-github-archive/ (g:\Code\quest-game\). v1.2.13. Стек: React + Vite + TS + Supabase. Язык с владельцем: русский.

Project Rules уже в контексте (quest-game-*.mdc, quest-game-gstack). Не дублируй их — читай файлы.

Первые шаги:
1. Skill gstack-context-restore (прочитай ~/.cursor/skills/gstack-context-restore/SKILL.md, выполни preamble).
2. Прочитай AGENTS.md, docs/ROADMAP.md (Спринт 1), docs/IMPROVEMENTS_CATALOG.md — только релевантные IMP-*.
3. git status, ветка, remote.
4. Назови текущий IMP-* и один следующий шаг.

Правила: задачи только по IMP-*; новое вне спринта — согласовать. Hot-path: requestQueue. Commit+push после блока. Перед push — gstack-review; security — gstack-cso; UI — gstack-qa на localhost:5173. Конец блока — gstack-context-save.

Подтверди: что прочитал, ветка, IMP-ID, первый шаг.
```

---

## 2. Handoff (смена агента в том же чате)

```
Продолжаем Quest Game в quest-game-github-archive/. Сначала gstack-context-restore.

Кратко: git status, ветка, последний коммит. Какой IMP-* в работе и что осталось?

Дальше — один следующий шаг из ROADMAP Спринт 1. Перед push — gstack-review.
```

---

## 3. Периодический фокус (каждые 1–2 ч)

```
═══ QUEST GAME — ФОКУС ═══

Спринт 1, Supabase-only, requestQueue на hot-path. Задачи только по IMP-*.

Самопроверка (кратко в ответе):
A) Какой IMP-ID / пункт ROADMAP?
B) Что сделано (файлы/результат)?
C) Отклонения от спринта?
D) Риски: parallel Supabase, select('*'), service role во фронте?
E) Git: commit+push нужен?

STOP: Socket.IO, PWA, AI-квиз, большой рефактор без IMP-*.

Один следующий шаг. При долгой паузе — gstack-context-save.
```

---

## 4. Перед push (явно)

```
Перед push: gstack-review на текущую ветку. Фокус: requestQueue, IMP-SEC, Edge, select на hot-path. Затем npm run build; при сети/БД — node scripts/e2e-game-flow.mjs. Потом commit+push.
```

---

## 5. Конец дня / пауза

```
gstack-context-save. Краткий отчёт: IMP-ID, ветка, последний коммит, что проверить вручную, следующий шаг.
```

---

*Версия: 2026-06-05. gstack + Project Rules.*
