import { defineConfig } from '@playwright/test';
import base from './playwright.input-audit.config';

export default defineConfig({
  ...base,
  testDir: './tests/manual',
  testMatch: 'first-strong-native.spec.ts',
  outputDir: './artifacts/first-strong-native-20261011',
  projects: base.projects?.map(project => ({ ...project, testMatch: 'first-strong-native.spec.ts' })),
  use: { ...base.use, viewport: { width: 1300, height: 1100 } },
});
