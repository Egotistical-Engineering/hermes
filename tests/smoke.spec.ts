import { expect, test } from '@playwright/test';

test('loads workspace and opens settings + assistant', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByLabel('Show settings')).toBeVisible();
  await expect(page.getByText('Hermes').first()).toBeVisible();

  await page.getByLabel('Show settings').click();
  await page.getByTitle('Settings').click();

  await expect(page.getByText('API Keys')).toBeVisible();
  await expect(page.getByPlaceholder('sk-ant-...')).toBeVisible();
  await expect(page.getByPlaceholder('sk-...')).toBeVisible();

  await page.getByLabel('Open assistant').click();
  await expect(page.getByText('Ask me anything about your writing.')).toBeVisible();
  await expect(page.getByPlaceholder('Type a message...')).toBeVisible();
});

