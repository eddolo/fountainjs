import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testDir: './tests/browser',
  workers: 1,
  retries: 0,
  outputDir: './artifacts/gitlab-vue2-browser',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4198', video: 'on', trace: 'on' },
  projects: base.projects!.filter(project => ['chromium', 'firefox', 'webkit'].includes(project.name!))
    .map(project => ({ ...project, testMatch: '**/gitlab-vue2.spec.ts' })),
  webServer: {
    command: 'pnpm exec vite build --config vite.gitlab-bridge.config.ts && pnpm exec vite preview --config vite.gitlab-bridge.config.ts --host 127.0.0.1 --port 4198 --strictPort',
    url: 'http://127.0.0.1:4198/tests/browser/fixtures/gitlab-vue2.html',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
