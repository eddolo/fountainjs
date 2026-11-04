import { SourceMap } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
const bytes = readFileSync(process.argv[2]);
const profile = JSON.parse(process.argv[2].endsWith('.gz') ? gunzipSync(bytes) : bytes);
const dist = resolve(process.argv[3] ?? '.', 'dist');
const output = process.argv[4];
const maps = new Map();
const nodes = new Map(profile.nodes.map(node => [node.id, node]));
const parents = new Map(profile.nodes.flatMap(node => (node.children ?? []).map(child => [child, node.id])));
function originalFunction(frame) {
  const relative = frame.url.split('/dist/')[1];
  if (!relative || frame.lineNumber < 0) return frame.functionName;
  try {
    if (!maps.has(relative)) {
      const raw = JSON.parse(readFileSync(resolve(dist, relative + '.map')));
      maps.set(relative, { raw, map: new SourceMap(raw), functions: raw.sourcesContent.map(source =>
        source.split('\n').flatMap((line, index) => {
          const match = /^(?:export )?(?:async )?function (\w+)/u.exec(line);
          return match ? [{ line: index, name: match[1] }] : [];
        })) });
    }
    const { raw, map, functions } = maps.get(relative);
    const entry = map.findEntry(frame.lineNumber, frame.columnNumber);
    const index = raw.sources.indexOf(entry.originalSource);
    return functions[index]?.findLast(value => value.line <= entry.originalLine)?.name ?? frame.functionName;
  } catch { return frame.functionName; }
}
const names = new Map(profile.nodes.map(node => [node.id, originalFunction(node.callFrame)]));
const categories = { renderMarkdownNestedSource: 'nested patch construction and validation',
  renderNestedSource: 'nested patch construction and validation',
  draftMarkdownNestedSource: 'nested patch construction and validation',
  markdownSourceSeparator: 'adjacent-block validation', markdownSourceProjectionMatches: 'complete-document validation',
  captureMarkdownBlocks: 'initial source capture' };
const totals = new Map();
for (let index = 0; index < profile.samples.length; index++) {
  let node = profile.samples[index], label = 'other';
  while (nodes.has(node)) {
    if (categories[names.get(node)]) { label = categories[names.get(node)]; break; }
    if (!parents.has(node)) break;
    node = parents.get(node);
  }
  totals.set(label, (totals.get(label) ?? 0) + profile.timeDeltas[index]);
}
const report = { method: 'V8 sampled CPU time attributed through shipped source maps to nearest validation/capture ancestor; includes four exports and initial capture',
  milliseconds: Object.fromEntries([...totals].sort((a, b) => b[1] - a[1]).map(([name, micros]) => [name, +(micros / 1000).toFixed(2)])) };
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
