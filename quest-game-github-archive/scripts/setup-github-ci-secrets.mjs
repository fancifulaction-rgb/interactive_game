/**
 * Записать VITE_SUPABASE_* в GitHub Actions secrets (для CI e2e).
 * Требует: gh auth login (один раз), значения в quest-game-github-archive/.env
 *
 * Запуск из корня репо: node quest-game-github-archive/scripts/setup-github-ci-secrets.mjs
 * Или: cd quest-game-github-archive && npm run ci:secrets
 */
import { readFileSync, existsSync } from 'fs'
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const archiveRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRoot = path.dirname(archiveRoot)
const envPath = path.join(archiveRoot, '.env')

if (!existsSync(envPath)) {
  console.error('Нет .env в quest-game-github-archive/')
  process.exit(1)
}

const vars = {}
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([^#][^=]+)=(.*)$/)
  if (m) vars[m[1].trim()] = m[2].trim()
}

const url = vars.VITE_SUPABASE_URL
const anon = vars.VITE_SUPABASE_ANON_KEY
if (!url || !anon) {
  console.error('В .env нужны VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

function findGh() {
  const candidates = [
    path.join(repoRoot, '.tools', 'gh', 'gh.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'GitHub CLI', 'gh.exe'),
    'gh',
  ].filter(Boolean)
  for (const c of candidates) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8', shell: true })
    if (r.status === 0) return c
  }
  return null
}

function runGh(args, opts = {}) {
  return spawnSync(gh, args, { encoding: 'utf8', shell: true, ...opts })
}

const gh = findGh()
if (!gh) {
  console.error('Установите GitHub CLI: https://cli.github.com/ затем gh auth login')
  process.exit(1)
}

const auth = runGh(['auth', 'status'])
if (auth.status !== 0) {
  console.error('Выполните: gh auth login')
  process.exit(1)
}

function setSecret(name, value) {
  const r = runGh(['secret', 'set', name, '--repo', 'fancifulaction-rgb/interactive_game'], {
    cwd: repoRoot,
    input: value,
  })
  if (r.status !== 0) {
    console.error(`Не удалось записать ${name}`)
    process.exit(1)
  }
  console.log(`✓ ${name}`)
}

setSecret('VITE_SUPABASE_URL', url)
setSecret('VITE_SUPABASE_ANON_KEY', anon)

const serviceKey = vars.SUPABASE_SERVICE_ROLE_KEY
if (serviceKey) {
  setSecret('SUPABASE_SERVICE_ROLE_KEY', serviceKey)
} else {
  console.warn('⚠ SUPABASE_SERVICE_ROLE_KEY не в .env — e2e в CI не создаст игру после RLS')
}

console.log('GitHub Actions secrets настроены для CI e2e')
