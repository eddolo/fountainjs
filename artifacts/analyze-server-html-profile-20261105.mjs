import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';
const { TraceMap, originalPositionFor } = createRequire(import.meta.resolve('vite'))('@jridgewell/trace-mapping');
const profile = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const nodes = new Map(profile.nodes.map(node => [node.id, node])), times = new Map(), maps = new Map(), groups = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  const id = profile.samples[i]; times.set(id, (times.get(id) ?? 0) + profile.timeDeltas[i]);
}
for (const [id, elapsed] of times) {
  const frame = nodes.get(id).callFrame;
  let source = frame.url, line = frame.lineNumber + 1, name = frame.functionName, snippet;
  if (source.startsWith('file:')) {
    const path = fileURLToPath(source);
    let mapPath = path + '.map';
    if (!existsSync(mapPath) && process.argv[4]) mapPath = join(process.argv[4], basename(mapPath));
    if (existsSync(mapPath)) {
      let map = maps.get(mapPath);
      if (!map) { map = new TraceMap(JSON.parse(readFileSync(mapPath, 'utf8'))); maps.set(mapPath, map); }
      const original = originalPositionFor(map, { line, column: frame.columnNumber });
      if (original.source && original.line) {
        source = original.source; line = original.line; name = original.name ?? name;
        const index = map.sources.indexOf(original.source);
        snippet = map.sourcesContent?.[index]?.split('\n')[line - 1]?.trim();
      }
    }
  }
  const key = JSON.stringify([source, line, name]);
  const row = groups.get(key) ?? { source, line, name, snippet, selfMs: 0 };
  row.selfMs += elapsed / 1000; groups.set(key, row);
}
const rows = [...groups.values()].sort((a, b) => b.selfMs - a.selfMs).map(row => ({ ...row, selfMs: +row.selfMs.toFixed(2) }));
writeFileSync(process.argv[3], JSON.stringify(rows, null, 2) + '\n');
console.log(JSON.stringify(rows.slice(0, 22), null, 2));
