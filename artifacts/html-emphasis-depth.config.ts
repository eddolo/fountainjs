import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../playwright.config';

export default defineConfig({
  ...base,
  testDir: '../tests/browser',
  workers: 1,
  retries: 0,
  outputDir: './html-emphasis-depth-browser-frozen-20261103',
  projects: base.projects?.filter(project => ['chromium', 'firefox', 'webkit'].includes(project.name!)),
  use: { ...base.use, headless: true, baseURL: 'http://127.0.0.1:4194', video: 'on', trace: 'on' },
  webServer: {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    command: 'pnpm exec vite --config artifacts/vite-quiet-audit.config.ts --host 127.0.0.1 --port 4194 --strictPort',
    url: 'http://127.0.0.1:4194/browser-tests.html',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
