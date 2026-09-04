import { defineConfig, devices } from '@playwright/test';

const port = 4173;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm build && pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/browser-tests.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', testMatch: '**/editor.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testMatch: '**/editor.spec.ts', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testMatch: '**/editor.spec.ts', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', testMatch: '**/mobile.spec.ts', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', testMatch: '**/mobile.spec.ts', use: { ...devices['iPhone 15'] } },
  ],
});
