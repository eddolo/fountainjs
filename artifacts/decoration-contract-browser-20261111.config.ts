import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../playwright.config';

export default defineConfig({
  ...base,
  testDir: '../tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: './decoration-contract-browser-20261111',
  reporter: 'list',
  grep: /wraps, indents, lifts, and exits lists through browser-visible commands and keys|turns multi-format and multi-block selections into visible paragraph boundaries|distinguishes rendered widget labels from authored document text|maps decorations through typing without persisting widget content/,
  projects: base.projects?.filter(project => ['chromium', 'firefox', 'webkit'].includes(project.name!)),
  use: { ...base.use, video: 'on', trace: 'on', screenshot: 'on' },
  webServer: {
    ...base.webServer,
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    command: 'pnpm exec vite --config vite.input-audit.config.ts --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/browser-tests.html',
    reuseExistingServer: false,
  },
});
