import { defineConfig } from '@playwright/test';
import base from './paragraph-spacing-browser.config';
export default defineConfig({ ...base, testMatch: '**/paragraph-spacing-marker-probe.spec.ts',
  projects: base.projects?.filter(project => project.name === 'chromium'), outputDir: './paragraph-spacing-marker-probe-20261104' });
