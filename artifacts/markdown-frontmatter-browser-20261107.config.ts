import { defineConfig } from '@playwright/test';
import base from './site-font-production-browser.config';

export default defineConfig({
  ...base,
  testMatch: '**/markdown-frontmatter-real.spec.ts',
  outputDir: './markdown-frontmatter-browser-20261107',
  reporter: [['list'], ['json', { outputFile: 'markdown-frontmatter-browser-20261107.json' }]],
  webServer: {
    ...base.webServer,
    command: 'pnpm exec vite preview --config vite.input-audit.config.ts --outDir ../../artifacts/markdown-frontmatter-site-20261107 --host 127.0.0.1 --port 4195 --strictPort',
    url: 'http://127.0.0.1:4195/conversion-lab.html',
  },
});
