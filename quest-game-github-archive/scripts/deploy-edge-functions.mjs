/**
 * Деплой продакшен Edge Functions (IMP-INF-001, IMP-INF-002).
 * Требует: npx supabase login + link (или SUPABASE_ACCESS_TOKEN).
 *
 * Запуск: node scripts/deploy-edge-functions.mjs
 */
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const functions = ['player-upload', 'delete-game', 'generate-questions']
const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF ||
  process.env.VITE_SUPABASE_PROJECT_ID ||
  'tvytsnnujaucoluoyvjq'

/** Одна строка + shell:true — иначе на Windows ENOENT; args+shell:true — DEP0190. */
function run(command) {
  console.log(`→ ${command}`)
  const r = spawnSync(command, { cwd: root, stdio: 'inherit', shell: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run(`npx supabase link --project-ref ${PROJECT_REF}`)

for (const name of functions) {
  run(
    `npx supabase functions deploy ${name} --no-verify-jwt --project-ref ${PROJECT_REF}`
  )
}

run(`npx supabase functions list --project-ref ${PROJECT_REF}`)
console.log('✓ Edge functions deployed')
