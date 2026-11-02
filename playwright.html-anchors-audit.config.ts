import { defineConfig } from '@playwright/test';
import base from './playwright.input-audit.config';

export default defineConfig({
  ...base,
  testDir: './tests/manual',
  testMatch: 'html-anchors-real.spec.ts',
  outputDir: './artifacts/html-anchors-browser-20261102',
  projects: base.projects?.map(project => ({ ...project, testMatch: 'html-anchors-real.spec.ts' })),
  use: { ...base.use, headless: true, viewport: { width: 1200, height: 850 } },
});
