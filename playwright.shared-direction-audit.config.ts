import { defineConfig } from '@playwright/test';
import base from './playwright.input-audit.config';

// Trusted keyboard clipboard events and independent native controls, with no
// injected clipboard data. Default to background browsers to avoid disrupting
// the user's desktop. A headed diagnostic requires explicit separate choice.
// One worker, no retries, fresh private server, and no use of the user's 4173.
const matches = ['nested-direction-real.spec.ts', 'shared-direction-copy-real.spec.ts', 'shared-direction-virtual-real.spec.ts', 'shared-direction-weak-real.spec.ts', 'inherited-clipboard-real.spec.ts'];
export default defineConfig({
  ...base,
  testDir: './tests/manual',
  testMatch: matches,
  outputDir: './artifacts/shared-direction-native-background-20261011',
  projects: base.projects?.map(project => ({ ...project, testMatch: matches })),
  use: { ...base.use, headless: true, viewport: { width: 1300, height: 950 } },
});
