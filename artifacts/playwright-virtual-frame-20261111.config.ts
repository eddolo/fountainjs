import { defineConfig } from '@playwright/test';
import base from './retained-adapter-browser-20261106.config';

export default defineConfig({
  ...base,
  testDir: '.', testMatch: 'virtual-measurement-frame-20261111.spec.ts',
  outputDir: './virtual-measurement-frame-before-20261111', reporter: 'list',
  projects: base.projects!.filter(project => project.name === 'chromium')
    .map(project => ({ ...project, testMatch: 'virtual-measurement-frame-20261111.spec.ts' })),
});
