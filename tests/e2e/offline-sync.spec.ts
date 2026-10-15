import { expect, test } from '@playwright/test';

import { createTask, login } from './helpers.js';

test('keeps one optimistic task across offline reload and syncs it after reconnection', async ({ context, page }) => {
  await login(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await createTask(page, '离线唯一任务');
  await page.reload();
  await expect(page.getByText('离线唯一任务', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect.poll(async () => {
    const response = await page.request.get('/api/tasks');
    const tasks = await response.json() as Array<{ title: string }>;
    return tasks.filter(({ title }) => title === '离线唯一任务').length;
  }).toBe(1);
  await page.reload();
  await expect(page.getByText('离线唯一任务', { exact: true })).toHaveCount(1);
});
