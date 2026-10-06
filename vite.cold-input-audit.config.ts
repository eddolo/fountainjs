import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import base from './vite.config.ts';

// Keep first-use dependency discovery reproducible without deleting or sharing
// the cache of a user's already-running development server.
export default defineConfig({
  ...base,
  cacheDir: mkdtempSync(join(tmpdir(), 'fountain-cold-input-audit-')),
  server: { ...base.server, open: false },
});
