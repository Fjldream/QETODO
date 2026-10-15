import { expect, test } from '@playwright/test';

import { createTask, login } from './helpers.js';

test('creates, validates, tags, postpones, and completes a daily task', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: '新建任务' }).click();
  await page.getByLabel('任务标题').fill('等待供应商整改');
  await page.getByLabel('状态').selectOption('waiting');
  await page.getByRole('button', { name: '保存任务' }).click();
  await expect(page.getByText('请填写等待对象')).toBeVisible();
  await page.getByLabel('等待对象').fill('供应商');
  await page.getByLabel('下次跟进时间').fill('2026-10-16T09:00');
  await page.getByLabel('添加标签').fill('外协');
  await page.getByRole('button', { name: '加入标签' }).click();
  await page.getByRole('button', { name: '保存任务' }).click();
  await expect(page.getByText('等待供应商整改', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /将“等待供应商整改”推迟一天/ }).click();
  await page.locator('.task-row-main').filter({ hasText: '等待供应商整改' }).click();
  await page.getByRole('button', { name: '完成任务' }).click();
  await expect(page.locator('.undo-bar')).toContainText('任务已完成');
});

test('calendar and all-tasks tabs remain usable at iPhone width', async ({ page }) => {
  await login(page);
  await createTask(page, '日历验收任务');
  await page.getByRole('link', { name: '日历' }).click();
  await expect(page.getByRole('heading', { name: '日历' })).toBeVisible();
  await page.getByRole('link', { name: '任务' }).click();
  await expect(page.getByRole('heading', { name: '任务' })).toBeVisible();
});
