import { defineConfig } from '@playwright/test';
import base from './native-focus-browser-20261105.config';
export default defineConfig({ ...base, testDir: '.', testMatch: 'native-focus-highlight-visual.spec.ts', projects: base.projects!.slice(0, 3).map(p => ({ name: p.name, use: p.use })), outputDir: './native-focus-highlight-visual-20261105' });
