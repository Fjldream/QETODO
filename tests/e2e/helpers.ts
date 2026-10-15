import { expect, type Page } from '@playwright/test';

export async function login(page: Page): Promise<void> {
  await page.goto('login');
  await page.getByLabel('用户名').fill('admin');
  await page.getByLabel('密码').fill('quality-pass');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByRole('heading', { name: '今日' })).toBeVisible();
}

export async function createTask(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: '新建任务' }).click();
  await page.getByLabel('任务标题').fill(title);
  await page.getByRole('button', { name: '保存任务' }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}
