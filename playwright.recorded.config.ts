import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Fresh, isolated recording server: never stop or reuse a user's open editor.
// Select journeys/projects with the usual CLI --grep and --project options.
const port = 4198;
export default defineConfig({
  ...base,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: './artifacts/recorded-browser-results',
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 }, video: 'on', trace: 'on',
    launchOptions: { slowMo: 40 },
  },
  webServer: {
    command: `pnpm build && pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/browser-tests.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
