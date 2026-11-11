import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const productionTests = ['**/starter-downloads.spec.ts', '**/docx-caption-production-real.spec.ts', '**/site-identity-production.spec.ts'];

export default defineConfig({
  ...base,
  testDir: './tests',
  testMatch: productionTests,
  workers: 1,
  retries: 0,
  outputDir: './artifacts/production-browser',
  use: {
    ...base.use,
    baseURL: 'http://127.0.0.1:4197/fountainjs/',
    headless: true,
    video: 'on',
    trace: 'on',
    viewport: { width: 1440, height: 1000 },
  },
  projects: base.projects!
    .filter(project => ['chromium', 'firefox', 'webkit'].includes(project.name!))
    .map(project => ({ ...project, testMatch: productionTests })),
  webServer: {
    command: 'pnpm exec vite build --base /fountainjs/ && pnpm exec vite preview --config vite.production-preview.config.ts --host 127.0.0.1 --port 4197 --strictPort',
    url: 'http://127.0.0.1:4197/fountainjs/developers.html',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
