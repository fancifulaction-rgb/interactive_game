/**
 * Создание пользователя Supabase Auth для входа в админку.
 * Запуск: node scripts/create_admin_script.js  (ключи из .env)
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './lib/load-env.mjs'

loadEnv()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (Dashboard → Settings → API)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const email = process.env.ADMIN_EMAIL ?? 'admin@quest.game'
const password = process.env.ADMIN_PASSWORD ?? 'admin123'

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})

if (error) {
  console.error('Ошибка:', error.message)
  process.exit(1)
}

console.log('Админ создан:', data.user.id)
console.log('Email:', email)
