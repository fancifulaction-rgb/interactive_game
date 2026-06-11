import { test, expect } from '@playwright/test'
import { createE2EGameFixture, type E2EGameFixture } from './helpers/gameFixture'

test.describe('join token registration (UI)', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })

  let fixture: E2EGameFixture

  test.beforeAll(async () => {
    fixture = await createE2EGameFixture()
  })

  test.afterAll(async () => {
    await fixture?.destroy()
  })

  test('register via ?join= deep link', async ({ page }) => {
    const teamName = `Join ${Date.now().toString(36).slice(-4)}`

    await page.goto(`/team/register?join=${fixture.joinToken}`)

    await expect(page.getByPlaceholder('ABC123')).toHaveValue(fixture.code, { timeout: 15_000 })
    await page.getByPlaceholder('Введите название команды').fill(teamName)
    await page.getByPlaceholder('Введите имя капитана').fill('Playwright')
    await page.getByRole('button', { name: 'Зарегистрироваться' }).click()

    await expect(page).toHaveURL(new RegExp(`/game/${fixture.code}`, 'i'), { timeout: 45_000 })
    await expect(page.getByText('Комната ожидания')).toBeVisible({ timeout: 45_000 })
  })
})
