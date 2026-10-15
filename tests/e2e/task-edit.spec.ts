import { expect, test, type Page } from '@playwright/test';

import { createTask, login } from './helpers.js';

interface StoredTask { id: string; title: string; status: string; priority: string; reference: string | null; tags: Array<{ name: string }>; attachments: unknown[]; activities: Array<{ kind: string }> }
async function stored(page: Page): Promise<StoredTask[]> {
  return (await page.request.get('api/tasks?includeHistory=true')).json() as Promise<StoredTask[]>;
}

test('edits the original task from the task list, changes state and initial tags, and reopens history', async ({ page }) => {
  await login(page);
  const title = `编辑验收-${Date.now()}`;
  await page.getByRole('button', { name: '新建任务' }).click();
  await page.getByLabel('任务标题').fill(title);
  await page.getByRole('button', { name: '检验检测', exact: true }).click();
  await page.getByLabel('添加图片').setInputFiles('apps/web/public/icons/app-icon-512.png');
  await expect(page.getByText(/KB → .*KB/)).toBeVisible();
  await page.getByRole('button', { name: '保存任务' }).click();
  await expect.poll(async () => (await stored(page)).find(task => task.title === title)?.attachments.length).toBe(1);
  const original = (await stored(page)).find(task => task.title === title)!;
  await page.getByRole('link', { name: '任务', exact: true }).click();
  await page.locator('.task-row-main').filter({ hasText: title }).click();
  await page.getByRole('button', { name: '编辑任务' }).click();
  await expect(page.getByLabel('任务标题')).toHaveValue(title);
  await page.getByLabel('任务标题').fill(`${title}-复核`);
  await page.getByLabel('关联编号').fill('NCR-2026-008');
  await page.getByRole('dialog', { name: '编辑任务' }).getByLabel('优先级').selectOption('urgent');
  await page.getByRole('button', { name: '质量异常', exact: true }).click();
  await page.getByRole('button', { name: '整改跟进', exact: true }).click();
  await page.getByRole('dialog', { name: '编辑任务' }).getByLabel('状态').selectOption('waiting');
  await page.getByRole('button', { name: '保存任务' }).click();
  await expect(page.getByText('请填写等待对象')).toBeVisible();
  await page.getByLabel('等待对象').fill('供应商张工');
  await page.getByLabel('下次跟进时间').fill('2026-10-20T09:00');
  await page.getByRole('button', { name: '保存任务' }).click();
  await expect.poll(async () => (await stored(page)).find(task => task.id === original.id)?.status).toBe('waiting');
  const edited = (await stored(page)).find(task => task.id === original.id)!;
  expect(edited).toMatchObject({ title: `${title}-复核`, priority: 'urgent', reference: 'NCR-2026-008' });
  expect(edited.tags.map(tag => tag.name).sort()).toEqual(['整改跟进', '检验检测', '质量异常']);
  expect(edited.attachments).toHaveLength(1);
  expect(edited.activities.some(item => item.kind === 'status_changed')).toBe(true);
  await page.getByRole('button', { name: '编辑任务' }).click();
  await page.getByRole('dialog', { name: '编辑任务' }).getByLabel('状态').selectOption('cancelled');
  await page.getByRole('button', { name: '保存任务' }).click();
  await expect.poll(async () => (await stored(page)).find(task => task.id === original.id)?.status).toBe('cancelled');
  await page.getByRole('button', { name: '关闭详情' }).click();
  await page.getByLabel('筛选状态').selectOption('cancelled');
  await page.locator('.task-row-main').filter({ hasText: `${title}-复核` }).click();
  await page.getByRole('button', { name: '编辑任务' }).click();
  await page.getByRole('dialog', { name: '编辑任务' }).getByLabel('状态').selectOption('in_progress');
  await page.getByRole('button', { name: '保存任务' }).click();
  await expect.poll(async () => (await stored(page)).find(task => task.id === original.id)?.status).toBe('in_progress');
  for (const note of ['已联系供应商，等待整改报告', '已收到报告，安排复核']) {
    await page.getByRole('button', { name: '记录进展', exact: true }).click();
    await page.getByLabel('进展内容').fill(note);
    await page.getByRole('button', { name: '保存进展', exact: true }).click();
    await expect(page.locator('.progress-summary')).toContainText(note);
  }
  await expect.poll(async () => (await stored(page)).find(task => task.id === original.id)?.activities.filter(item => item.kind === 'manual').length).toBe(2);
  await page.getByRole('button', { name: '关闭详情' }).click();
  await page.getByLabel('筛选状态').selectOption('in_progress');
  await expect(page.locator('.task-row-main').filter({ hasText: `${title}-复核` })).toContainText('已收到报告，安排复核');
  expect((await stored(page)).filter(task => task.title.startsWith(title))).toHaveLength(1);
});

test('can edit a task created offline and synchronize one final record after reload', async ({ page, context }) => {
  await login(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  const title = `离线编辑-${Date.now()}`;
  await createTask(page, title);
  await page.locator('.task-row-main').filter({ hasText: title }).click();
  await page.getByRole('button', { name: '编辑任务' }).click();
  await page.getByLabel('任务标题').fill(`${title}-已修改`);
  await page.getByRole('dialog', { name: '编辑任务' }).getByLabel('状态').selectOption('in_progress');
  await page.getByRole('button', { name: '供应商', exact: true }).click();
  await page.getByRole('button', { name: '保存任务' }).click();
  await page.getByRole('button', { name: '记录进展', exact: true }).click();
  await page.getByLabel('进展内容').fill('已现场确认，等待复核');
  await page.getByRole('button', { name: '保存进展', exact: true }).click();
  await page.reload();
  await expect(page.getByText(`${title}-已修改`, { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect.poll(async () => {
    const matches = (await stored(page)).filter(task => task.title.startsWith(title));
    return matches.length === 1 && matches[0]?.title === `${title}-已修改` && matches[0].status === 'in_progress' && matches[0].tags.some(tag => tag.name === '供应商') && matches[0].activities.filter(item => item.kind === 'manual').length === 1;
  }, { timeout: 20_000 }).toBe(true);
});
