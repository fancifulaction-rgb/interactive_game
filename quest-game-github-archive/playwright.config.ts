import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
const isCi = !!process.env.CI

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  retries: isCi ? 1 : 0,
  forbidOnly: isCi,
  reporter: isCi
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npx vite --host 127.0.0.1 --port 5173',
        url: baseURL,
        reuseExistingServer: !isCi,
        timeout: 120_000,
        env: {
          VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? '',
          VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? '',
        },
      },
})
