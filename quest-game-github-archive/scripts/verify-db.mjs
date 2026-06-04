import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './lib/load-env.mjs'

loadEnv()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const tables = ['games', 'settings', 'themes', 'questions', 'teams', 'answers', 'game_state', 'messages']
let ok = true

for (const table of tables) {
  const { error, count } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) {
    console.log(`FAIL ${table}: ${error.code} ${error.message}`)
    ok = false
  } else {
    console.log(`OK   ${table}: ${count ?? 0} rows`)
  }
}

const { data: games } = await supabase.from('games').select('code,title,theme')
console.log('games sample:', games)

const { data: buckets, error: bErr } = await supabaseAdmin.storage.listBuckets()
if (bErr) console.log('storage buckets:', 'ERR', bErr.message)
else console.log('storage buckets:', buckets?.map((b) => b.name).join(', ') || '(none)')

process.exit(ok ? 0 : 1)
