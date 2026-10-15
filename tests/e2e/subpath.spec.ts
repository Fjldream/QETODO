import { expect, test } from '@playwright/test';

import { login } from './helpers.js';

test('keeps installation, worker, requests, and downloads inside its deployment path', async ({ page }) => {
  const base = process.env.VITE_BASE_PATH ?? '/';
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/api/')) apiRequests.push(new URL(request.url()).pathname);
  });
  await login(page);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe(base);
  await page.getByRole('link', { name: '设置' }).click();
  await expect(page.getByRole('link', { name: '导出 JSON（可恢复）' })).toHaveAttribute('href', `${base}api/transfer/export.json`);
  const manifestResponse = await page.request.get('manifest.webmanifest');
  const manifest = await manifestResponse.json() as { start_url: string; scope: string; icons: Array<{ src: string }> };
  const manifestUrl = new URL(`${base}manifest.webmanifest`, page.url());
  expect(new URL(manifest.start_url, manifestUrl).pathname).toBe(`${base}today`);
  expect(new URL(manifest.scope, manifestUrl).pathname).toBe(base);
  expect(new URL(manifest.icons[0]!.src, manifestUrl).pathname).toBe(`${base}icons/app-icon-192.png`);
  expect(apiRequests.length).toBeGreaterThan(0);
  expect(apiRequests.every((path) => path.startsWith(`${base}api/`))).toBe(true);
});
