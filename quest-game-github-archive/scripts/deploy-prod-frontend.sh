#!/usr/bin/env bash
# Деплой фронта igriva.ru с VPS после git pull.
# Запуск на сервере (root или deploy-пользователь с правами на /var/www/igriva):
#   bash scripts/deploy-prod-frontend.sh
#
# Один раз: clone репо, .env.production, Node 18+ (см. docs/DEPLOYMENT.md § igriva.ru).

set -euo pipefail

REPO_ROOT="${QUEST_REPO_ROOT:-/opt/quest-game}"
APP_DIR="${QUEST_APP_DIR:-$REPO_ROOT/quest-game-github-archive}"
WEB_ROOT="${QUEST_WEB_ROOT:-/var/www/igriva}"
GIT_BRANCH="${QUEST_GIT_BRANCH:-main}"

die() { echo "ERROR: $*" >&2; exit 1; }

command -v git >/dev/null || die "git не установлен"
command -v npm >/dev/null || die "npm/node не установлен (нужен Node 18+)"
command -v rsync >/dev/null || die "rsync не установлен"

[[ -d "$REPO_ROOT/.git" ]] || die "Репозиторий не найден: $REPO_ROOT"
[[ -d "$APP_DIR" ]] || die "Папка приложения не найдена: $APP_DIR"
[[ -f "$APP_DIR/.env.production" ]] || die "Создайте $APP_DIR/.env.production из .env.production.example"

echo "==> git pull ($GIT_BRANCH) в $REPO_ROOT"
cd "$REPO_ROOT"
git fetch origin "$GIT_BRANCH"
git checkout "$GIT_BRANCH"
git pull --ff-only origin "$GIT_BRANCH"

echo "==> npm ci + build в $APP_DIR"
cd "$APP_DIR"
export NODE_ENV=production
npm ci
npm run build

[[ -d dist ]] || die "dist/ не создан — проверьте npm run build"
[[ -f dist/index.html ]] || die "dist/index.html отсутствует"

if grep -rq "192\.168\." dist/ 2>/dev/null; then
  echo "WARN: в dist найден 192.168.* — проверьте VITE_PUBLIC_URL в .env.production" >&2
fi

echo "==> rsync dist/ -> $WEB_ROOT"
mkdir -p "$WEB_ROOT"
rsync -a --delete dist/ "$WEB_ROOT/"

if id www-data &>/dev/null; then
  chown -R www-data:www-data "$WEB_ROOT"
fi
find "$WEB_ROOT" -type d -exec chmod 755 {} \;
find "$WEB_ROOT" -type f -exec chmod 644 {} \;

echo "==> OK: https://igriva.ru обновлён ($(date -Iseconds))"
