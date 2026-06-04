# GitHub: interactive_game

Репозиторий: https://github.com/fancifulaction-rgb/interactive_game

Пустой репозиторий на аккаунте **fancifulaction-rgb** — это **ваш** проект Quest Game (код в `quest-game-github-archive/`).  
Старое имя в Supabase было `quest_game`; на GitHub выбрано имя `interactive_game`.

## Что не попадает в git

- `offline_docs/` — личные заметки
- `.env`, ключи, пароли
- `archive/backups/*.gz` — дампы БД
- `node_modules/`, `dist/`

## Первый push

```powershell
cd G:\Code\quest-game
git add .
git status   # убедитесь: нет offline_docs и .env
git commit -m "Initial commit: Quest Game platform v1.2.13"
git push -u origin main
```

При запросе логина GitHub используйте **Personal Access Token** (не пароль аккаунта):  
GitHub → Settings → Developer settings → Personal access tokens.

## GitHub CLI (опционально)

Установите [GitHub CLI](https://cli.github.com/), затем:

```powershell
gh auth login
gh repo view fancifulaction-rgb/interactive_game
```

## Remote уже настроен

```text
origin  https://github.com/fancifulaction-rgb/interactive_game.git
```
