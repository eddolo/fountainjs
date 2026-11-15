import { defineConfig } from '@playwright/test';
import base from './playwright.input-audit.config';

// OS clipboard integration is separate from synthetic clipboard-event tests.
// No failed browser is skipped or replaced by a programmatically injected paste.
export default defineConfig({
  ...base,
  testDir: './tests/manual',
  testMatch: '**/footnote-clipboard-real.spec.ts',
  projects: base.projects?.map(project => ({ ...project, testMatch: '**/footnote-clipboard-real.spec.ts' })),
});
