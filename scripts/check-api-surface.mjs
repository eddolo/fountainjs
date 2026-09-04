import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = resolve(repositoryRoot, 'package.json');
const snapshotPath = resolve(repositoryRoot, 'api-surface.json');
const declarationRoot = resolve(repositoryRoot, 'dist');
const write = process.argv.includes('--write');

function publicTypeEntries(value, entries = new Set()) {
  if (!value || typeof value !== 'object') return entries;
  for (const [condition, target] of Object.entries(value)) {
    if (condition === 'types' && typeof target === 'string') entries.add(target);
    else publicTypeEntries(target, entries);
  }
  return entries;
}

function portablePath(file) {
  return relative(repositoryRoot, file).split(sep).join('/');
}

function declarationFor(fromFile, specifier) {
  const target = resolve(dirname(fromFile), specifier);
  const candidates = specifier.endsWith('.cjs')
    ? [target.slice(0, -4) + '.d.cts']
    : specifier.endsWith('.mjs')
      ? [target.slice(0, -4) + '.d.mts']
      : specifier.endsWith('.js')
        ? [target.slice(0, -3) + '.d.ts']
        : [target + '.d.ts', resolve(target, 'index.d.ts')];
  return candidates.find((candidate) => existsSync(candidate));
}

function hash(content) {
  return createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');
}

const packageJSON = JSON.parse(readFileSync(packagePath, 'utf8'));
const roots = [...publicTypeEntries(packageJSON.exports)].map((target) => resolve(repositoryRoot, target));
if (!roots.length) throw new Error('No public type entries were found in package.json exports.');

const queued = [...roots];
const declarations = new Map();
while (queued.length) {
  const file = queued.pop();
  if (!file || declarations.has(file)) continue;
  if (!existsSync(file)) throw new Error(`Public declaration is missing: ${portablePath(file)}`);
  if (relative(declarationRoot, file).startsWith('..')) {
    throw new Error(`Public declaration escaped dist/: ${portablePath(file)}`);
  }
  const content = readFileSync(file, 'utf8');
  declarations.set(file, hash(content));
  for (const match of content.matchAll(/['"](\.\.?\/[^'"]+)['"]/g)) {
    const dependency = declarationFor(file, match[1]);
    if (!dependency) {
      throw new Error(`Cannot resolve declaration import ${match[1]} from ${portablePath(file)}.`);
    }
    queued.push(dependency);
  }
}

const files = Object.fromEntries(
  [...declarations]
    .map(([file, digest]) => [portablePath(file), digest])
    .sort(([left], [right]) => left.localeCompare(right)),
);
const current = { version: 1, files };

if (write) {
  writeFileSync(snapshotPath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Recorded ${Object.keys(files).length} public declaration files in api-surface.json.`);
  process.exit(0);
}

if (!existsSync(snapshotPath)) {
  throw new Error('api-surface.json is missing. Review the declarations and run pnpm test:api -- --write.');
}
const expected = JSON.parse(readFileSync(snapshotPath, 'utf8'));
if (expected.version !== 1 || !expected.files || typeof expected.files !== 'object') {
  throw new Error('api-surface.json has an unsupported shape.');
}

const expectedFiles = expected.files;
const added = Object.keys(files).filter((file) => !(file in expectedFiles));
const removed = Object.keys(expectedFiles).filter((file) => !(file in files));
const changed = Object.keys(files).filter((file) => file in expectedFiles && files[file] !== expectedFiles[file]);
if (added.length || removed.length || changed.length) {
  const details = [
    ...added.map((file) => `  added: ${file}`),
    ...removed.map((file) => `  removed: ${file}`),
    ...changed.map((file) => `  changed: ${file}`),
  ].join('\n');
  throw new Error(
    `The public TypeScript API surface changed:\n${details}\nReview compatibility and CHANGELOG.md, then run pnpm test:api -- --write.`,
  );
}

console.log(`Public API surface verified across ${Object.keys(files).length} declaration files.`);
