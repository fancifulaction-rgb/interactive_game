# Настройка Cursor для Quest Game

Рекомендации на основе [документации Cursor](https://cursor.com/docs/rules) и практики 2025–2026: короткие rules, один concern на файл, `alwaysApply` — экономно.

## Иерархия (что кого перебивает)

```
Team Rules (если есть)  →  Project Rules (.cursor/rules/*.mdc)  →  User Rules (Settings)
```

Для вас: **проектные правила** задают Quest Game; **User Rules** — как агент работает во всех репозиториях.

---

## 1. User Rules (глобально)

**Где:** Cursor → **Settings** → **Rules** → **User Rules** (или General → Rules for AI).

**Принцип:** 15–40 строк. Без деталей Quest Game (они в Project Rules). Не дублировать ESLint/TypeScript — агент и так знает базу.

### Рекомендуемый текст (скопировать в User Rules)

```markdown
## Язык и стиль работы
- Отвечай на русском, если пользователь пишет по-русски.
- Пиши как инженер: полные предложения, без воды. Код и пути — точные.

## Поведение агента
- Выполняй задачи сам: терминал, чтение файлов, проверка — не останавливайся на «можно сделать так».
- Минимальный diff: не рефакторить и не добавлять фичи вне запроса.
- Перед правками читай окружающий код и следуй существующим паттернам.
- После существенных изменений — запускай сборку/линт проекта, если есть в package.json.

## Git
- Коммит и push — только когда пользователь явно просит, ИЛИ когда в Project Rules / чате включён режим «регулярные коммиты».
- Conventional Commits; не коммить .env, секреты, dist, node_modules.
- Не force-push на main; не менять git config глобально.

## Безопасность
- Никогда не выводить и не коммитить API keys, service role, пароли.

## Контекст
- Используй @ для файлов и docs вместо длинного копирования кода в чат.
- Если задача неясна — один короткий уточняющий вопрос, затем действуй.
```

### Опциональная вставка «режим спринта»

Когда ведёте активную разработку с агентом, **добавьте в User Rules** (или в первое сообщение чата):

```markdown
## Режим спринта (Quest Game и похожие)
- После каждого завершённого блока работы: git commit + push на согласованную ветку.
- Сообщай ветку, hash коммита и что проверить вручную.
```

Уберите этот блок, когда вернётесь к режиму «коммит только по просьбе».

---

## 2. Project Rules (только Quest Game)

**Где:** `G:\Code\quest-game\.cursor\rules\*.mdc` (уже в репозитории, коммитить в git).

| Файл | Режим | Зачем |
|------|-------|--------|
| `quest-game-focus.mdc` | alwaysApply | Якорь: квест, Спринт 1, IMP-ID, docs |
| `quest-game-gstack.mdc` | alwaysApply | gstack: context-save/restore, review, QA, cso |
| `quest-game-player-network.mdc` | globs: GamePlay, TeamRegister, src/lib | Очередь, optimistic UI |
| `quest-game-typescript.mdc` | globs: **/*.ts, **/*.tsx | React/Vite соглашения |
| `quest-game-supabase.mdc` | globs: src/lib/**, docs/sql-migrations/** | БД, миграции, Edge |

**Не делать:** один файл на 500 строк; копировать весь INDEX.md в rule — жрёт контекст.

**AGENTS.md** в `quest-game-github-archive/` — дублирует кратко; rules короче и всегда в контексте.

### Проверка в Cursor

Settings → **Rules** → **Project Rules** — должны быть видны 5+ файлов. Если нет — откройте workspace `G:\Code\quest-game` (корень с `.cursor`), не только подпапку.

**gstack:** skills установлены глобально в `~/.cursor/skills/gstack-*`. Короткие paste для чата — [AI_AGENT_PROMPTS_SHORT.md](AI_AGENT_PROMPTS_SHORT.md).

---

## 3. Настройки Cursor (settings.json)

**Файл (Windows):** `%APPDATA%\Cursor\User\settings.json`

Сейчас у вас: `files.autoSave: afterDelay` — хорошо.

### Рекомендуется добавить

```json
{
  "files.autoSave": "afterDelay",
  "files.autoSaveDelay": 1000,
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.updateImportsOnFileMove.enabled": "always",
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true
  },
  "files.watcherExclude": {
    "**/node_modules/**": true,
    "**/dist/**": true
  }
}
```

Для **quest-game-github-archive** можно workspace settings: `.vscode/settings.json` с `eslint.workingDirectories`.

### Agent / Chat (UI, не JSON)

| Настройка | Рекомендация |
|-----------|--------------|
| **Default model** | Модель с хорошим кодом (Composer/Codex/GPT) для многофайловых задач |
| **Codebase indexing** | Включено; см. `.cursorignore` |
| **Include .cursor/rules** | По умолчанию да |
| **Long context** | Для больших рефакторов — чат с большим окном; иначе дробите задачи по IMP-ID |
| **Privacy** | Не отправлять `.env` в чат; использовать @ файлов без секретов |

### `.cursorignore` (корень workspace)

Создан в `G:\Code\quest-game\.cursorignore` — ускоряет индексацию, не тянет `node_modules`/`dist` в контекст.

---

## 4. Расширения VS Code / Cursor

| Расширение | ID | Зачем |
|------------|-----|--------|
| ESLint | `dbaeumer.vscode-eslint` | Ловит ошибки до build |
| Prettier | `esbenp.prettier-vscode` | Единый стиль с formatOnSave |
| Tailwind CSS IntelliSense | `bradlc.vscode-tailwindcss` | Классы в JSX |
| ES7+ React Snippets | `dsznajder.es7-react-js-snippets` | Быстрый UI (опционально) |
| Error Lens | `usernamehw.errorlens` | Ошибки в строке |
| GitLens | `eamodio.gitlens` | История, blame |

### Применено в репозитории

- `.vscode/extensions.json` (корень `quest-game` и `quest-game-github-archive`) — Cursor предложит **Install Recommended Extensions**.
- `quest-game-github-archive/.vscode/settings.json` — formatOnSave + ESLint.
- Скрипт (если CLI install падает с `aborted` — закройте Cursor и запустите):

```powershell
powershell -ExecutionPolicy Bypass -File quest-game-github-archive/scripts/install-cursor-extensions.ps1
```

**Почему CLI даёт `aborted`:** в фоне остаются процессы `Cursor` (даже после закрытия окна). Проверка: `Get-Process -Name Cursor`. Завершить: `Stop-Process -Name Cursor -Force`, подождать 5 с, снова скрипт. Либо **Install Recommended Extensions** в UI — самый надёжный способ.

---

## 5. MCP и плагины Cursor

### Применено в репозитории

- `G:\Code\quest-game\.cursor\mcp.json` — пустой `mcpServers` (без лишних серверов из конфига).
- Инструкция UI: [`.cursor/MCP_QUEST_GAME.md`](../.cursor/MCP_QUEST_GAME.md).

### Один раз вручную (обязательно)

Плагины Notion / Figma / Datadog **отключаются только в UI**:

1. `Ctrl+Shift+J` → **Tools & MCP**
2. Выключить toggle: `plugin-notion-workspace-notion`, `plugin-figma-figma`, `plugin-datadog-datadog`, Framelink (если есть)
3. `Ctrl+Shift+P` → **Developer: Reload Window**

Полезнее для Quest Game:

- Терминал в workspace
- `@docs/ROADMAP.md`, `@AGENTS.md` в чате
- `AI_AGENT_FOCUS_REMINDER.md` раз в 1–2 ч

---

## 6. Продуктивный «вайбкодинг» — workflow

1. **Новый чат** → вставить блок из `AI_AGENT_ONBOARDING_PROMPT.md` + задача с **IMP-ID**.
2. **Каждые 1–2 ч** → `AI_AGENT_FOCUS_REMINDER.md`.
3. **Задача агенту:** «Сделай только IMP-INF-001, без других файлов».
4. **Конец блока:** «commit + push» + `npm run build`.
5. **Конец дня:** сохранить «выжимку памяти» из ответа агента в issue/заметку.

### Чего избегать (мировой опыт)

- Один огромный чат на 50 задач — контекст плывёт.
- «Сделай всё из каталога» — только один IMP-ID за раз.
- alwaysApply rules > 3 штук по 100+ строк — дорого и шумно.
- Копировать `.env` в чат.

---

## 7. Чеклист настройки (галочки)

- [ ] User Rules вставлены (раздел 1)
- [ ] Workspace открыт как `G:\Code\quest-game`
- [ ] Project Rules видны в Settings (4+ файла в `.cursor/rules/`)
- [ ] `.cursorignore` на месте
- [ ] **Install Recommended Extensions** (уведомление) или скрипт `install-cursor-extensions.ps1`
- [ ] `formatOnSave` — в `quest-game-github-archive/.vscode/settings.json` (применено)
- [ ] MCP: toggle off в UI по `.cursor/MCP_QUEST_GAME.md`
- [ ] Режим коммитов: «по просьбе» или «спринт»

---

## Связанные файлы

- [AI_AGENT_ONBOARDING_PROMPT.md](AI_AGENT_ONBOARDING_PROMPT.md)
- [AI_AGENT_FOCUS_REMINDER.md](AI_AGENT_FOCUS_REMINDER.md)
- [INDEX.md](INDEX.md)

*После настройки закоммитьте `.cursor/rules/`, `.cursorignore`, `docs/CURSOR_SETUP_GUIDE.md`.*
