import { expect, test } from '@playwright/test';

import { login } from './helpers.js';

test('plans future-deadline work today and shows both dates in a full month calendar', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-10-15T04:00:00Z'));
  await login(page);
  const today = await page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const later = new Date(`${today}T12:00:00Z`);
  later.setUTCDate(later.getUTCDate() + 20);
  const dueDate = later.toISOString().slice(0, 10);
  const title = `计划处理验收-${Date.now()}`;
  await page.getByRole('button', { name: '新建任务' }).click();
  await page.getByLabel('任务标题').fill(title);
  await page.getByLabel('计划处理日期', { exact: true }).fill(today);
  await page.getByLabel('截止时间', { exact: true }).fill(`${dueDate}T09:00`);
  await page.getByRole('button', { name: '保存任务' }).click();
  await expect(page.locator('.task-section').filter({ hasText: '计划处理' })).toContainText(title);
  await expect.poll(async () => {
    const tasks = await (await page.request.get('api/tasks?includeHistory=true')).json() as Array<{ title: string; plannedDate: string | null }>;
    return tasks.find(t => t.title === title)?.plannedDate;
  }).toBe(today);
  await page.reload();
  await expect(page.locator('.task-row-main').filter({ hasText: title })).toBeVisible();
  await page.getByRole('link', { name: '日历', exact: true }).click();
  await expect(page.locator('.calendar-grid button')).toHaveCount(new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate());
  await expect(page.locator('.calendar-tasks')).toContainText(title);
  await expect(page.locator('.calendar-tasks')).toContainText('计划处理');
  await page.screenshot({ path: testInfo.outputPath('month-calendar.png') });
  const dueMonth = dueDate.slice(0, 7);
  if (dueMonth !== today.slice(0, 7)) await page.getByRole('button', { name: '下个月', exact: true }).click();
  await page.locator(`button[data-date="${dueDate}"]`).click();
  await expect(page.locator('.calendar-tasks')).toContainText(title);
  await expect(page.locator('.calendar-tasks')).toContainText('到期');
  await page.getByRole('button', { name: '回到今天', exact: true }).click();
  await expect(page.locator(`button[data-date="${today}"]`)).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('.calendar-grid')).toBeVisible();
  await expect(page.locator('.calendar-tasks .task-row').filter({ hasText: title })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('month-calendar-small-dark.png') });
  // November 2026 spans six rows. The month must not squeeze the list away.
  await page.getByRole('button', { name: '下个月', exact: true }).click();
  expect((await page.getByRole('region', { name: '任务列表', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(64);
  await page.screenshot({ path: testInfo.outputPath('month-calendar-six-weeks.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  const monthSize = await page.locator('.month-calendar').evaluate(el => ({ height: el.clientHeight, content: el.scrollHeight }));
  expect(monthSize.content).toBeLessThanOrEqual(monthSize.height + 1);
  await page.screenshot({ path: testInfo.outputPath('month-calendar-landscape.png') });
});

test('scrolls only task lists while the month, filters, and navigation stay still', async ({ page }) => {
  await login(page);
  // Seed many real API tasks in the isolated test server, never the live account.
  await page.evaluate(async () => {
    const base = location.pathname.replace(/(?:today|tasks|calendar)$/, '');
    const session = await (await fetch(`${base}api/auth/session`)).json();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    for (let i = 0; i < 22; i++) {
      const response = await fetch(`${location.pathname.replace(/(?:today|tasks|calendar)$/, '')}api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrfToken }, body: JSON.stringify({ operationId: crypto.randomUUID(), baseVersion: null, data: { title: `滚动验收-${i}`, dueAt: `${today}T09:00:00+08:00` } }) });
      if (!response.ok) throw new Error(`seed failed: ${response.status}`);
    }
  });
  for (const name of ['日历', '任务', '今日']) {
    await page.getByRole('link', { name, exact: true }).click();
    await page.reload();
    const list = page.getByRole('region', { name: '任务列表', exact: true });
    await expect(list.locator('.task-row').first()).toBeVisible();
    const headerBefore = await page.locator('.large-title-header').boundingBox();
    const navBefore = await page.getByRole('navigation', { name: '主导航' }).boundingBox();
    const calendarBefore = name === '日历' ? await page.locator('.month-calendar').boundingBox() : null;
    await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
    expect(await page.locator('.large-title-header').boundingBox()).toEqual(headerBefore);
    expect(await page.getByRole('navigation', { name: '主导航' }).boundingBox()).toEqual(navBefore);
    if (calendarBefore) expect(await page.locator('.month-calendar').boundingBox()).toEqual(calendarBefore);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const last = await list.locator('.task-row').last().boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(navBefore!.y + 1);
  }
});
