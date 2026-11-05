import { defineConfig } from '@playwright/test';
import base from './native-focus-browser-20261105.config';

export default defineConfig({ ...base, testDir: '../tests/manual',
  testMatch: ['**/history-retention-real.spec.ts', '**/structural-wrapping-real.spec.ts'],
  projects: base.projects?.filter(project => ['chromium', 'firefox', 'webkit'].includes(project.name!))
    .map(project => ({ name: project.name, use: project.use })),
  outputDir: './structural-history-browser-direction-20261105', webServer: { ...base.webServer,
    command: 'pnpm exec vite --config artifacts/structural-history-vite-20261105.config.ts --host 127.0.0.1 --port 4195 --strictPort',
  } });
