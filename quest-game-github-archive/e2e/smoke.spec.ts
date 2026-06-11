import { test, expect } from '@playwright/test'

test('home page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\//)
  await expect(page.locator('body')).toBeVisible()
})

test('registration page loads', async ({ page }) => {
  await page.goto('/team/register')
  await expect(page).toHaveURL(/\/team\/register/)
  await expect(page.locator('body')).toBeVisible()
})
