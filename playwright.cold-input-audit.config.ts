import { defineConfig } from '@playwright/test';
import base from './playwright.input-audit.config';

const port = 4196;
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `pnpm build && pnpm exec vite --config vite.cold-input-audit.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/browser-tests.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
