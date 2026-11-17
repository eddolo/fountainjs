import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../../../playwright.config';
const root = fileURLToPath(new URL('../../../', import.meta.url));
export default defineConfig({
  ...base,
  testDir: fileURLToPath(new URL('../../../tests/browser', import.meta.url)),
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { ...base.use, trace: 'on', video: 'on', screenshot: 'on' },
  projects: base.projects!.filter(project => ['chromium', 'firefox', 'webkit'].includes(project.name!)),
  webServer: { ...base.webServer, cwd: root, reuseExistingServer: false },
});
