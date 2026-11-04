import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from '../playwright.config';
import audit from '../playwright.native-docx-audit.config';

export default defineConfig({ ...base, workers: 1, retries: 0, testDir: '../tests/browser',
  outputDir: './list-marker-default-browser-20261104',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4195', headless: true, video: 'on' },
  projects: base.projects?.filter(project => ['chromium', 'firefox', 'webkit'].includes(project.name!)),
  webServer: { ...audit.webServer, cwd: fileURLToPath(new URL('../', import.meta.url)) },
});
