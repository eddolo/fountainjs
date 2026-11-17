import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../playwright.config';
const port = 4198;
export default defineConfig({
  ...base, testDir: '../tests/browser', testMatch: '**/collaboration-demo.spec.ts',
  fullyParallel: false, workers: 1, retries: 0,
  outputDir: './yjs-native-index-isolated-browser-20261117', reporter: 'list',
  use: { ...base.use, headless: true, baseURL: `http://127.0.0.1:${port}`,
    video: 'on', trace: 'on', screenshot: 'on', viewport: { width: 1440, height: 1000 } },
  projects: base.projects!.filter(project => ['chromium', 'firefox', 'webkit'].includes(project.name!))
    .map(project => ({ ...project, testMatch: '**/collaboration-demo.spec.ts' })),
  webServer: {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    command: `pnpm exec vite --config artifacts/vite.yjs-native-index-isolated-20261117.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/`, reuseExistingServer: false, timeout: 120_000,
  },
});
