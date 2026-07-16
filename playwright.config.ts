// ============================================
// Playwright E2E 測試設定
// 執行: npx playwright test
// UI 模式: npx playwright test --ui
// ============================================
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  testIgnore: '**/__tests__/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 2,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } },
    },
  ],
});
