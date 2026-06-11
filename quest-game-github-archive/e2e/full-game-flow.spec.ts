import { test, expect, type Page } from '@playwright/test'
import { createE2EGameFixture, type E2EGameFixture } from './helpers/gameFixture'

async function waitForQuestionInput(page: Page): Promise<void> {
  const input = page.getByPlaceholder('Введите ваш ответ...')
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await input.waitFor({ state: 'visible', timeout: 4000 })
      return
    } catch {
      await page.reload({ waitUntil: 'domcontentloaded' })
    }
  }
  await expect(input).toBeVisible({ timeout: 5000 })
}

async function submitTextAnswer(page: Page, answer: string): Promise<void> {
  const input = page.getByPlaceholder('Введите ваш ответ...')
  await input.fill(answer)
  await page.getByRole('button', { name: /Отправить ответ/i }).click()
}

test.describe('full game flow (UI)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })

  let fixture: E2EGameFixture

  test.beforeAll(async () => {
    fixture = await createE2EGameFixture()
  })

  test.afterAll(async () => {
    await fixture?.destroy()
  })

  test('register → lobby → play → scoreboard', async ({ page }) => {
    const teamName = `PW ${Date.now().toString(36).slice(-4)}`

    await page.goto(`/team/register?code=${fixture.code}`)

    await expect(page.getByPlaceholder('ABC123')).toHaveValue(fixture.code)
    await page.getByPlaceholder('Введите название команды').fill(teamName)
    await page.getByPlaceholder('Введите имя капитана').fill('Playwright')
    await page.getByRole('button', { name: 'Зарегистрироваться' }).click()

    await expect(page).toHaveURL(new RegExp(`/game/${fixture.code}`, 'i'), { timeout: 45_000 })
    await expect(page.getByText('Комната ожидания')).toBeVisible({ timeout: 45_000 })

    await fixture.startGame()
    await waitForQuestionInput(page)

    await expect(page.getByText('Столица России?')).toBeVisible()
    await submitTextAnswer(page, 'Москва')

    await expect(page.getByText('2+2?')).toBeVisible({ timeout: 45_000 })
    await submitTextAnswer(page, '4')

    await expect(page).toHaveURL(new RegExp(`/scoreboard/${fixture.code}`, 'i'), {
      timeout: 60_000,
    })
    await expect(page.getByText(teamName)).toBeVisible({ timeout: 30_000 })
  })
})
