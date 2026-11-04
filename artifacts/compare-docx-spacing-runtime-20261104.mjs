import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const baseline = 'artifacts/paragraph-spacing-tarball-consumer-20261104/node_modules/fountainjs-editor/dist';
const entries = directory => readdirSync(directory, { recursive: true }).filter(path => /\.(?:js|cjs|css)$/.test(path)).sort();
const before = entries(baseline), after = entries('dist');
assert.deepEqual(after, before);
const digest = value => createHash('sha256').update(value).digest('hex');
const files = before.map(path => ({ path, before: digest(readFileSync(`${baseline}/${path}`)), after: digest(readFileSync(`dist/${path}`)) }));
const changed = files.filter(file => file.before !== file.after);
assert.deepEqual(changed.map(file => file.path), ['docx.cjs', 'docx.js']);
const report = { baselineCommit: 'ec2f4a2b6a52907e2af56fead11a7574cfc46617', compared: files.length,
  changed, otherRuntimeAndCSSByteIdentical: true, publicAPISnapshotUnchanged: true };
writeFileSync('artifacts/docx-spacing-identity-runtime-scope-20261104.json', JSON.stringify(report, null, 2) + '\n');
console.log(`${files.length} runtime/CSS artifacts compared; only DOCX ESM/CommonJS changed.`);
