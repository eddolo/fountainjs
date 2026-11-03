import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/native-docx', workers: 1, retries: 0, timeout: 90_000,
  outputDir: 'artifacts/docx-native-audit/browser', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4195', headless: true, video: 'on', trace: 'on', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec vite --config vite.input-audit.config.ts --host 127.0.0.1 --port 4195 --strictPort',
    url: 'http://127.0.0.1:4195/conversion-lab.html', reuseExistingServer: false, timeout: 120_000,
  },
});
