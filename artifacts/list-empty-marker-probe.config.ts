import { defineConfig } from '@playwright/test';
import base from './docx-theme-language-browser.config';
export default defineConfig({ ...base, testDir: '../tests/manual', projects: base.projects?.filter(project => project.name === 'chromium'),
  testMatch: '**/list-empty-marker-probe.spec.ts', outputDir: './list-empty-marker-probe-browser-20261104' });
