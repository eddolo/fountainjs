import { defineConfig } from '@playwright/test';
import base from './cross-container-browser-20261105.config';

export default defineConfig({ ...base, testDir: '../tests/browser', testMatch: '**/editor.spec.ts',
  grep: /opens and cancels public configuration panels|keeps the public native colour field|compares list-first code text-click|edits RTL blocks/,
  outputDir: './structural-formatting-focus-browser-20261105',
  // editor.spec's unchanged beforeEach requires its development-only harness.
  // The demo production build intentionally excludes browser-tests.html.
  webServer: { ...base.webServer,
    command: 'pnpm exec vite --config vite.input-audit.config.ts --host 127.0.0.1 --port 4195 --strictPort',
    url: 'http://127.0.0.1:4195/browser-tests.html' },
});
