import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Record this bounded native-pointer preflight without enabling video for
// every editor test. The ordinary full matrix still includes these assertions.
export default defineConfig({
  ...base,
  testMatch: '**/editor.spec.ts',
  grep: /keeps a host control stable through a virtual measurement frame/,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: './artifacts/virtual-host-browser',
  use: { ...base.use, headless: true, video: 'on' },
  projects: base.projects!.filter(project => ['chromium', 'firefox', 'webkit'].includes(project.name!))
    .map(project => ({ ...project, testMatch: '**/editor.spec.ts' })),
});
