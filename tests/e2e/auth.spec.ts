import { expect, test } from '@playwright/test';

import { login } from './helpers.js';

test('rejects protected pages until login and restores an authenticated shell', async ({ page }) => {
  await page.goto('today');
  await expect(page.getByRole('heading', { name: '质量待办' })).toBeVisible();
  await login(page);
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
  await expect(page.getByRole('link', { name: '今日' })).toHaveAttribute('aria-current', 'page');
});
