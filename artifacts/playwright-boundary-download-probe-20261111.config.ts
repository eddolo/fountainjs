import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../playwright.config';

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'document-boundary-download-probe-20261111.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { ...base.use, video: 'on', trace: 'on' },
  projects: base.projects!.filter(project => project.name === 'chromium')
    .map(project => ({ ...project, testMatch: 'document-boundary-download-probe-20261111.spec.ts' })),
  webServer: { ...base.webServer as object, cwd: fileURLToPath(new URL('../', import.meta.url)) },
});
