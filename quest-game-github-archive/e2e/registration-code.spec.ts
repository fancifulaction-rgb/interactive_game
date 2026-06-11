import { test, expect } from '@playwright/test'

test('invalid ?code= shows error', async ({ page }) => {
  await page.goto('/team/register?code=ZZZZZZ')
  await page.getByPlaceholder('Введите название команды').fill('Test Team')
  await page.getByPlaceholder('Введите имя капитана').fill('Captain')
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click()

  await expect(page.getByText(/не найден|неверный|не существует|код/i)).toBeVisible({
    timeout: 15_000,
  })
})
