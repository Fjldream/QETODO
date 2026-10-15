import { defineConfig, devices } from '@playwright/test';

const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://127.0.0.1:4173${base}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'webkit-iphone', use: { ...devices['iPhone 13'] } }],
  webServer: [
    {
      command: 'tsx tests/e2e/server.ts',
      url: 'http://127.0.0.1:3000/api/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @qetodo/web exec vite preview --host 127.0.0.1 --port 4173',
      url: `http://127.0.0.1:4173${base}manifest.webmanifest`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
