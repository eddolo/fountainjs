import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const baseline = 'artifacts/docx-spacing-identity-tarball-consumer-20261104/node_modules/fountainjs-editor/dist';
const files = directory => readdirSync(directory, { recursive: true }).filter(path => /\.(?:js|cjs|css)$/.test(path)).sort();
assert.deepEqual(files('dist'), files(baseline));
for (const path of files(baseline)) assert.deepEqual(readFileSync(`dist/${path}`), readFileSync(`${baseline}/${path}`), path);
const observations = {};
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const report = JSON.parse(readFileSync(`artifacts/list-marker-visibility-verified-real-20261104/${engine}/observations.json`));
  observations[engine] = { actual: report.actual.pixels.dark, positive: report.positive.pixels.dark,
    negative: report.negative.pixels.dark, completeJSONEqual: report.completeJSONAfterEnterBackspaceEqual };
}
const report = { baselineCommit: 'd0c8d75f37bf064d316ee40cc6a256fc4afc6e41',
  runtimeAndCSSFiles: files(baseline).length, allRuntimeAndCSSByteIdentical: true, observations };
writeFileSync('artifacts/list-marker-runtime-scope-20261104.json', JSON.stringify(report, null, 2) + '\n');
console.log('All 169 runtime/CSS artifacts are byte-identical to the retained d0c8d75 package.');
