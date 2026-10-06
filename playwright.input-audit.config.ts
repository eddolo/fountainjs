import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Isolated real-input regression recording: never reuse or stop the user's
// demo server, and always rebuild the package consumed by browser demos.
const port = 4194;
export default defineConfig({
  ...base,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}`, video: 'on', trace: 'on' },
  projects: base.projects?.filter(project => ['chromium', 'firefox', 'webkit'].includes(project.name ?? '')),
  webServer: {
    command: `pnpm build && pnpm exec vite --config vite.input-audit.config.ts --force --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/browser-tests.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
