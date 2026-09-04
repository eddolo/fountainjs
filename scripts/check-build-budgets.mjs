import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const kibibyte = 1024;
const limits = Object.freeze({
  'dist/index.js': 100 * kibibyte,
  'dist/index.cjs': 84 * kibibyte,
  'dist/react.js': 64 * kibibyte,
  'dist/react.cjs': 48 * kibibyte,
  'dist/styles.css': 32 * kibibyte,
  'all ESM runtime code': 384 * kibibyte,
  'all CommonJS runtime code': 320 * kibibyte,
});

const entries = await readdir('dist', { withFileTypes: true });
const runtimeFiles = entries.filter((entry) => entry.isFile() && !entry.name.endsWith('.map'));
const sizeOf = async (path) => (await stat(path)).size;
const measured = new Map();

for (const path of ['dist/index.js', 'dist/index.cjs', 'dist/react.js', 'dist/react.cjs', 'dist/styles.css']) {
  measured.set(path, await sizeOf(path));
}
measured.set('all ESM runtime code', (await Promise.all(
  runtimeFiles.filter((entry) => entry.name.endsWith('.js')).map((entry) => sizeOf(join('dist', entry.name))),
)).reduce((total, size) => total + size, 0));
measured.set('all CommonJS runtime code', (await Promise.all(
  runtimeFiles.filter((entry) => entry.name.endsWith('.cjs')).map((entry) => sizeOf(join('dist', entry.name))),
)).reduce((total, size) => total + size, 0));

const failures = [];
for (const [name, limit] of Object.entries(limits)) {
  const size = measured.get(name);
  if (typeof size !== 'number') throw new Error(`No build measurement was produced for ${name}.`);
  console.log(`${name}: ${(size / kibibyte).toFixed(1)} KiB / ${(limit / kibibyte).toFixed(0)} KiB`);
  if (size > limit) failures.push(`${name} exceeds its budget by ${((size - limit) / kibibyte).toFixed(1)} KiB`);
}

if (failures.length) throw new Error(`Build budget failed:\n- ${failures.join('\n- ')}`);
