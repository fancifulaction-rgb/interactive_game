/**
 * Деплой продакшен Edge Functions (IMP-INF-001, IMP-SEC S1/S2).
 * Требует: npx supabase login + link (или SUPABASE_ACCESS_TOKEN).
 *
 * Запуск: node scripts/deploy-edge-functions.mjs
 */
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF ||
  process.env.VITE_SUPABASE_PROJECT_ID ||
  'tvytsnnujaucoluoyvjq'

const publicFunctions = ['player-upload']
const jwtFunctions = ['delete-game', 'delete-teams', 'confirm-admin-email', 'generate-questions']

function run(command) {
  console.log(`→ ${command}`)
  const r = spawnSync(command, { cwd: root, stdio: 'inherit', shell: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run(`npx supabase link --project-ref ${PROJECT_REF}`)

for (const name of publicFunctions) {
  run(
    `npx supabase functions deploy ${name} --no-verify-jwt --project-ref ${PROJECT_REF}`
  )
}

for (const name of jwtFunctions) {
  run(`npx supabase functions deploy ${name} --project-ref ${PROJECT_REF}`)
}

run(`npx supabase functions list --project-ref ${PROJECT_REF}`)
console.log('✓ Edge functions deployed')
