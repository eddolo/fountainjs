import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { basename, dirname, resolve, relative } from 'node:path';

const entries = ['index', 'core', 'react', 'yjs', 'yjs-retained'];
const files = readdirSync('dist').filter(name => /\.(js|cjs|css)$/.test(name));
const bytes = Object.fromEntries(files.map(name => {
  const data = readFileSync(`dist/${name}`);
  return [name, { bytes: data.length, gzip: gzipSync(data).length, sha256: createHash('sha256').update(data).digest('hex') }];
}));
const closures = {};
for (const entry of entries) for (const extension of ['js', 'cjs']) {
  const name = `${entry}.${extension}`;
  if (!bytes[name]) continue;
  const queue = [resolve('dist', name)], seen = new Set(), sources = new Set(), unmapped = [];
  while (queue.length) {
    const path = queue.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    const code = readFileSync(path, 'utf8');
    for (const match of code.matchAll(/(?:from\s*|import\s*|require\(\s*)["'](\.\.?\/[^"']+)["']/g)) {
      if (/\.(js|cjs)$/.test(match[1])) queue.push(resolve(dirname(path), match[1]));
    }
    if (existsSync(path + '.map')) {
      const map = JSON.parse(readFileSync(path + '.map', 'utf8'));
      for (const source of map.sources) sources.add(relative(resolve('.'), resolve(dirname(path), source)).replaceAll('\\', '/'));
    } else unmapped.push(basename(path));
  }
  const names = [...seen].map(path => basename(path)).sort();
  closures[name] = { files: names, bytes: names.reduce((sum, file) => sum + bytes[file].bytes, 0), gzip: names.reduce((sum, file) => sum + bytes[file].gzip, 0), sources: [...sources].sort(), unmapped };
}
writeFileSync(`artifacts/yjs-retained-package-${process.argv[2]}-20261107.json`, JSON.stringify({ files: bytes, closures }, null, 2) + '\n');
console.log(Object.fromEntries(Object.entries(closures).map(([entry, data]) => [entry, { bytes: data.bytes, gzip: data.gzip, files: data.files.length, retainedSources: data.sources.filter(path => path.includes('/retained-')) }])));
