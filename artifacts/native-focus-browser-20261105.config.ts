import { defineConfig } from '@playwright/test';
import base from './cross-container-browser-20261105.config';
import original from '../playwright.config';

export default defineConfig({ ...base, testDir: '../tests/browser', testMatch: ['**/editor.spec.ts', '**/mobile.spec.ts'],
  projects: original.projects,
  outputDir: './native-focus-browser-20261105',
  webServer: { ...base.webServer,
    command: 'pnpm exec vite --config artifacts/native-focus-vite-20261105.config.ts --host 127.0.0.1 --port 4195 --strictPort',
    url: 'http://127.0.0.1:4195/browser-tests.html' },
});
