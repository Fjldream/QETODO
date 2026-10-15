import { expect, test } from '@playwright/test';

import { login } from './helpers.js';

test('supports keyboard focus, large text layout, dark mode, and reduced motion', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await login(page);
  for (const label of ['今日', '任务', '日历', '设置']) {
    const box = await page.getByRole('link', { name: label }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: '新建任务' }).click();
  await expect(page.getByLabel('任务标题')).toBeFocused();
  await expect(page.getByRole('dialog', { name: '编辑任务' })).toHaveClass(/large-text-layout/);
  await expect(page.getByRole('dialog', { name: '编辑任务' })).toHaveCSS('animation-name', 'sheet-fade');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
});
