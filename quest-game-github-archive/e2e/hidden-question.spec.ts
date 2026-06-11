import { test, expect, type Page } from '@playwright/test'
import { createE2EGameFixture, type E2EGameFixture } from './helpers/gameFixture'

async function waitForQuestionInput(page: Page): Promise<void> {
  const input = page.getByPlaceholder('Введите ваш ответ...')
  await input.waitFor({ state: 'visible', timeout: 45_000 })
}

test.describe('hidden questions (UI)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })

  let fixture: E2EGameFixture

  test.beforeAll(async () => {
    fixture = await createE2EGameFixture({ withHiddenQuestion: true })
  })

  test.afterAll(async () => {
    await fixture?.destroy()
  })

  test('player sees only visible question', async ({ page }) => {
    const teamName = `Hide ${Date.now().toString(36).slice(-4)}`

    await page.goto(`/team/register?code=${fixture.code}`)
    await page.getByPlaceholder('Введите название команды').fill(teamName)
    await page.getByPlaceholder('Введите имя капитана').fill('Playwright')
    await page.getByRole('button', { name: 'Зарегистрироваться' }).click()

    await expect(page.getByText('Комната ожидания')).toBeVisible({ timeout: 45_000 })
    await fixture.startGame()
    await waitForQuestionInput(page)

    await expect(page.getByText('Столица России?')).toBeVisible()
    await expect(page.getByText('Скрытый вопрос')).not.toBeVisible()

    await page.getByPlaceholder('Введите ваш ответ...').fill('Москва')
    await page.getByRole('button', { name: /Отправить ответ/i }).click()

    await expect(page).toHaveURL(new RegExp(`/scoreboard/${fixture.code}`, 'i'), {
      timeout: 60_000,
    })
    await expect(page.getByText(teamName)).toBeVisible({ timeout: 30_000 })
  })
})
