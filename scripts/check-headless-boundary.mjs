import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';

const root = resolve('.');
const entries = [
  resolve('src/headless/index.ts'),
  resolve('src/ai/document-tools.ts'),
  resolve('src/ai/conversation.ts'),
  resolve('src/ai/generated-media.ts'),
];
const forbidden = [
  `${resolve('src/view')}${sep}`,
  `${resolve('src/react')}${sep}`,
  resolve('src/core/importers/html-importer.ts'),
  resolve('src/extensions/collaboration.ts'),
  resolve('src/extensions/index.ts'),
].map((path) => path.toLowerCase());
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const visited = new Set();

function resolveSource(from, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(from), specifier);
  const candidates = extname(base)
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), resolve(base, 'index.tsx')];
  return candidates.find((candidate) => existsSync(candidate));
}

function visit(file, chain = []) {
  const normalized = file.toLowerCase();
  const denied = forbidden.find((path) => normalized === path || normalized.startsWith(path));
  if (denied) {
    throw new Error(`Headless import boundary reached ${relative(root, file)} via ${[...chain, file].map((item) => relative(root, item)).join(' -> ')}`);
  }
  if (visited.has(normalized)) return;
  visited.add(normalized);
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const imported = resolveSource(file, match[1]);
    if (imported) visit(imported, [...chain, file]);
  }
}

entries.forEach((entry) => visit(entry));
console.log(`Headless source boundary verified across ${visited.size} modules.`);
