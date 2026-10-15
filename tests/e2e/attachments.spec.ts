import { expect, test } from '@playwright/test';

import { login } from './helpers.js';

test('compresses and uploads an image as private task evidence', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: '新建任务' }).click();
  await page.getByLabel('任务标题').fill('图片证据任务');
  await page.getByLabel('添加图片').setInputFiles('apps/web/public/icons/app-icon-512.png');
  await expect(page.getByText(/KB → .*KB/)).toBeVisible();
  await page.getByRole('button', { name: '保存任务' }).click();
  await expect(page.getByText('图片证据任务', { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const response = await page.request.get('/api/tasks');
    const tasks = await response.json() as Array<{ title: string; attachments: unknown[] }>;
    return tasks.find(({ title }) => title === '图片证据任务')?.attachments.length ?? 0;
  }).toBe(1);
});
