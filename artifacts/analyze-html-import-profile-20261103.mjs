import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { TraceMap, originalPositionFor } = require('../node_modules/.pnpm/@jridgewell+trace-mapping@0.3.31/node_modules/@jridgewell/trace-mapping');
const profile = JSON.parse(readFileSync('artifacts/html-import-cold-profile-20261103.cpuprofile'));
const nodes = new Map(profile.nodes.map(node => [node.id, node]));
const parents = new Map(), cache = new Map(), self = new Map(), total = new Map();
for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
for (let index = 0; index < (profile.samples ?? []).length; index++) {
  const id = profile.samples[index], microseconds = profile.timeDeltas[index] ?? 1000;
  self.set(id, (self.get(id) ?? 0) + microseconds);
  for (let next = id; next; next = parents.get(next)) total.set(next, (total.get(next) ?? 0) + microseconds);
}
function describe(id, microseconds) {
  const frame = nodes.get(id).callFrame;
  let source = frame.url, line = frame.lineNumber + 1, name = frame.functionName;
  try {
    const file = fileURLToPath(frame.url);
    if (!cache.has(file)) cache.set(file, existsSync(file + '.map') ? new TraceMap(JSON.parse(readFileSync(file + '.map'))) : null);
    const map = cache.get(file);
    if (map && line > 0) {
      const original = originalPositionFor(map, { line, column: frame.columnNumber });
      source = original.source ?? source; line = original.line ?? line; name = original.name ?? name;
    }
  } catch { /* Native/VM frames have no source map. */ }
  return { name, source, line, milliseconds: Math.round(microseconds / 100) / 10 };
}
const summary = {
  diagnosticOnly: true, profileDurationMs: (profile.endTime - profile.startTime) / 1000, samples: profile.samples.length,
  self: [...self].sort((left, right) => right[1] - left[1]).slice(0, 35).map(([id, us]) => describe(id, us)),
  inclusive: [...total].sort((left, right) => right[1] - left[1]).filter(([id]) => nodes.get(id).callFrame.url)
    .slice(0, 35).map(([id, us]) => describe(id, us)),
};
writeFileSync('artifacts/html-import-cold-profile-summary-20261103.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ duration: summary.profileDurationMs, self: summary.self.slice(0, 13), inclusive: summary.inclusive.slice(0, 12) }, null, 2));
