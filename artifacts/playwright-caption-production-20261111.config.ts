import { defineConfig } from '@playwright/test';
import base from './playwright-starter-release-20261111.config';

export default defineConfig({
  ...base,
  testDir: '../tests/manual',
  testMatch: 'docx-caption-production-real.spec.ts',
  outputDir: './caption-production-verified-1e86e5e0',
  projects: base.projects!.map(project => ({ ...project, testMatch: 'docx-caption-production-real.spec.ts' })),
});
