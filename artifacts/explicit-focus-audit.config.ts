import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../playwright.config';

export default defineConfig({
  ...base, testDir: '../tests/browser', workers: 1, retries: 0,
  outputDir: './explicit-focus-browser-20261103',
  use: { ...base.use, headless: true, baseURL: 'http://127.0.0.1:4194', video: 'on', trace: 'on' },
  webServer: {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    command: 'pnpm exec vite --config vite.input-audit.config.ts --host 127.0.0.1 --port 4194 --strictPort',
    url: 'http://127.0.0.1:4194/browser-tests.html', reuseExistingServer: false, timeout: 120_000,
  },
});
