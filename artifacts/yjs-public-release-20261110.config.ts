import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../playwright.config';

// Isolate this recording from any demo server already open on the user's PC.
const port = 4197;
export default defineConfig({
  ...base,
  testDir: '../tests/browser',
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: './yjs-public-release-20261110',
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}`, headless: true,
    trace: 'on', video: 'on', screenshot: 'only-on-failure' },
  webServer: {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    command: `pnpm exec vite --config vite.input-audit.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/browser-tests.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: base.projects?.filter(project => ['chromium', 'firefox', 'webkit'].includes(project.name!)),
});
