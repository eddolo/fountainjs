import { defineConfig, devices } from '@playwright/test';

const port = 4188;

export default defineConfig({
  testDir: './tests/manual',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['line']],
  outputDir: './artifacts/manual-ui-audit/results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'on',
    trace: 'on',
    video: { mode: 'on', size: { width: 1440, height: 1000 } },
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: `pnpm build && pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
