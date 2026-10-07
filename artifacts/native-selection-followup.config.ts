import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../playwright.config';

export default defineConfig({
  ...base,
  testDir: '../tests/browser',
  workers: 1,
  retries: 0,
  outputDir: './native-selection-native-oracle-recorded-20261007',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4196', video: 'on', trace: 'on' },
  webServer: {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    command: 'pnpm exec vite --host 127.0.0.1 --port 4196 --strictPort',
    url: 'http://127.0.0.1:4196/browser-tests.html',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
