import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../playwright.config';

export default defineConfig({
  ...base,
  testDir: '../tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: './toolbar-history-browser-final-20261111',
  reporter: 'list',
  grep: /recovers nested Markdown lists and quotes through an editor and reader|opens and cancels public configuration panels|lets Tab leave the editor when public emoji suggestions close|keeps the active option visible while wrapping through public slash suggestions/,
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
