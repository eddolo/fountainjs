import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const roots = ['src', 'tests', 'scripts', 'examples/react-app', 'examples/extensions', 'tools'];
const excluded = new Set(['node_modules', '.git', 'dist', 'build', '.cache', '.svelte-kit', 'playwright-report', 'test-results']);
const paths = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) { if (!excluded.has(entry.name)) walk(path); }
    else if (entry.isFile()) paths.push(path);
  }
}
roots.forEach(walk);
for (const entry of readdirSync('.', { withFileTypes: true })) {
  if (entry.isFile() && /\.(?:json|ts|mjs|js|yaml|yml)$/u.test(entry.name)) paths.push(entry.name);
}
const files = paths.sort().map(path => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }));
const digest = createHash('sha256').update(JSON.stringify(files)).digest('hex');
const target = process.argv.find(value => value.startsWith('--target='))?.slice('--target='.length)
  ?? 'artifacts/html-inert-production-source-20261006.json';
if (process.argv.includes('--check')) {
  const saved = JSON.parse(readFileSync(target, 'utf8'));
  if (saved.digest !== digest) throw new Error(`Production source changed: ${saved.digest} -> ${digest}`);
  console.log(`Unchanged production source: ${files.length} files / ${digest}`);
} else {
  writeFileSync(target, `${JSON.stringify({ capturedAt: new Date().toISOString(), scope: 'source/tests/scripts/examples/tools and root configs; dependencies/builds/docs/artifacts excluded', digest, files }, null, 2)}\n`);
  console.log(`Captured production source: ${files.length} files / ${digest}`);
}
