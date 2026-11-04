import { defineConfig } from '@playwright/test';
import base from '../playwright.native-docx-audit.config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  ...base,
  testDir: '../tests/manual',
  testMatch: '**/issue-editor-audit.spec.ts',
  outputDir: './issue-input-production-browser-20261104',
  webServer: {
    ...base.webServer,
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    command: 'pnpm exec vite preview --config vite.input-audit.config.ts --host 127.0.0.1 --port 4195 --strictPort',
    url: 'http://127.0.0.1:4195/issue-editor.html',
  },
});
