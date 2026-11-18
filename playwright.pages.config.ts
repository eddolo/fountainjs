import { defineConfig } from '@playwright/test';

const root = process.env.FOUNTAIN_PAGES_PREVIEW_ROOT;
if (!root) throw new Error('Set FOUNTAIN_PAGES_PREVIEW_ROOT to the directory containing the extracted fountainjs site.');
const origin = 'http://127.0.0.1:4206';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'starter-downloads.spec.ts',
  workers: 1,
  retries: 0,
  outputDir: './artifacts/pages-downloads',
  use: {
    browserName: 'chromium',
    headless: true,
    baseURL: origin + '/fountainjs/',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python -m http.server 4206 --bind 127.0.0.1',
    cwd: root,
    url: origin + '/fountainjs/build-info.json',
    reuseExistingServer: false,
  },
});
