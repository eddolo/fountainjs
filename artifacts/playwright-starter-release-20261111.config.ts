import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../playwright.config';

// Reuse the actual download/navigation assertions against the built Pages site.
// No development server, automatic rebuild or visible browser window.
export default defineConfig({
  ...base,
  testDir: '../tests/browser',
  testMatch: 'starter-downloads.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: './starter-release-fc3aa39a',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4197/fountainjs/', video: 'on' },
  projects: base.projects!.filter(project => ['chromium', 'firefox', 'webkit'].includes(project.name!))
    .map(project => ({ ...project, testMatch: 'starter-downloads.spec.ts' })),
  webServer: {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    command: 'pnpm exec vite preview --config artifacts/vite-release-preview-20261111.config.ts --host 127.0.0.1 --port 4197 --strictPort',
    url: 'http://127.0.0.1:4197/fountainjs/developers.html',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
