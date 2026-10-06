import { defineConfig } from '@playwright/test';
import base from './playwright.config';

process.env.FJS_AUDIT_VIEWER_ORIGIN = 'http://127.0.0.1:4193';
process.env.FJS_CONVERSION_AUDIT_URL = 'http://127.0.0.1:4193/conversion-lab.html';
process.env.FJS_AUDIT_VERIFY_SHADING = '1';
process.env.FJS_AUDIT_VERIFY_INTAKE = '1';
process.env.FJS_AUDIT_VERIFY_FOOTNOTES = '1';
process.env.FJS_AUDIT_VERIFY_TEMPLATES = '1';
process.env.FJS_AUDIT_VERIFY_BREAKS = '1';
process.env.FJS_AUDIT_VERIFY_SETTINGS = '1';
process.env.FJS_AUDIT_VERIFY_LAYOUT = '1';
process.env.FJS_AUDIT_VERIFY_TABLE_WIDTHS = '1';

// Run after the library build. A separate port avoids touching users' lab drafts.
export default defineConfig({
  ...base,
  testDir: './tests/manual',
  testMatch: 'conversion-real-document-audit.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: './artifacts/docx-paragraph-layout-20260912',
  use: { ...base.use, viewport: { width: 1440, height: 1000 }, video: 'on', trace: 'on', launchOptions: { slowMo: 60 } },
  projects: ['chromium', 'firefox', 'webkit'].map(name => ({ name, use: { browserName: name as 'chromium' | 'firefox' | 'webkit' } })),
  webServer: {
    // Demos consume package exports from dist, not the TypeScript sources.
    // Never record stale editor behavior after a source-only fix.
    command: `pnpm build && "C:/Users/cappu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe" -e "import('vite').then(async v => { const s = await v.createServer({server:{host:'127.0.0.1',port:4193,strictPort:true,open:false}}); await s.listen(); })"`,
    url: 'http://127.0.0.1:4193/conversion-lab.html',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
