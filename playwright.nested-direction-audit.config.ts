import { defineConfig } from '@playwright/test';
import base from './playwright.input-audit.config';

// Deliberately outside the passing release matrix until shared automatic
// ownership survives these transforms. No expected-failure/skip annotation:
// this audit must report a real failure when the user-visible contract fails.
export default defineConfig({
  ...base,
  testDir: './tests/manual',
  testMatch: 'nested-direction-real.spec.ts',
  outputDir: './artifacts/nested-direction-real-20261011',
  projects: base.projects?.map(project => ({ ...project, testMatch: 'nested-direction-real.spec.ts' })),
  use: { ...base.use, viewport: { width: 1300, height: 950 } },
});
