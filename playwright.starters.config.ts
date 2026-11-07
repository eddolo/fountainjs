import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const root = process.env.FOUNTAIN_STARTER_ROOT;
if (!root) throw new Error('Set FOUNTAIN_STARTER_ROOT to the directory containing both installed starter projects.');

export default defineConfig({
  testDir: './tests/manual',
  testMatch: 'starter-projects.spec.ts',
  outputDir: './artifacts/starter-consumer-browser',
  workers: 1,
  use: { headless: true, video: 'on', trace: 'on', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
  ],
  webServer: [
    { kind: 'plain-dom', port: 4201 },
    { kind: 'react', port: 4202 },
  ].map(({ kind, port }) => ({
    cwd: resolve(root, `fountainjs-${kind}`),
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
  })),
});
