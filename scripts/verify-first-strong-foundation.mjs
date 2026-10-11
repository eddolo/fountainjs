import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

// Evidence for an internal foundation, NOT acceptance of the red editor audit.
const root = new URL('../', import.meta.url);
const native = 'artifacts/first-strong-native-final-20261011/first-strong-native-compar-b18c9-ent-native-browser-controls-';
const engines = ['chromium', 'firefox', 'webkit'];
const source = ['src/core/first-strong-direction.ts', 'src/core/bidi-strong-data.ts',
  'scripts/generate-bidi-strong.mjs', 'scripts/verify-first-strong-foundation.mjs',
  'tests/first-strong-direction.test.ts', 'tests/manual/first-strong-native.spec.ts',
  'playwright.first-strong-audit.config.ts', 'tests/fixtures/unicode/DerivedBidiClass-17.0.0.txt',
  'tests/fixtures/unicode/LICENSE.txt', 'THIRD_PARTY_NOTICES.md'];
const logs = ['artifacts/first-strong-final-focused-20261011.log',
  'artifacts/first-strong-stable-full-units-20261011.log',
  'artifacts/first-strong-native-final-20261011.log',
  ...['api', 'headless', 'budget', 'package'].map(name => `artifacts/first-strong-test-${name}-20261011.log`),
  'artifacts/first-strong-typecheck-20261011.log'];
const read = path => readFileSync(new URL(path, root));
assert.match(read(logs[0]).toString(), /Tests\s+32 passed/);
assert.match(read(logs[1]).toString(), /Tests\s+2922 passed/);
assert.match(read(logs[1]).toString(), /Test Files\s+218 passed/);
assert.match(read(logs[2]).toString(), /3 passed/);
assert.match(read(logs[3]).toString(), /411 declaration files/);
assert.match(read(logs[4]).toString(), /100 modules/);
assert.match(read(logs[5]).toString(), /all ESM runtime code: 1598.5 KiB/);
assert.match(read(logs[6]).toString(), /package exports loaded successfully/);
assert.match(read(logs[7]).toString(), /0 errors and 0 warnings/);
const comparisons = engines.map(engine => {
  const observed = JSON.parse(read(`${native}${engine}/first-strong-native-observations.json`));
  assert.equal(observed.engine, engine);
  assert.equal(observed.expected.length, 17);
  assert.deepEqual(observed.observed.map(value => value.direction), observed.expected);
  return { engine, matched: 17, cases: observed.fixtures.map(value => value.name) };
});
const pngs = engines.map(engine => `${native}${engine}/first-strong-native-controls.png`);
const paths = [...source, ...logs, ...pngs,
  ...engines.map(engine => `${native}${engine}/first-strong-native-observations.json`)];
const hashes = paths.map(path => ({ path,
  sha256: createHash('sha256').update(read(path)).digest('hex'),
  gitBlob: execFileSync('git', ['hash-object', `--path=${path}`, path], { cwd: root, encoding: 'utf8' }).trim(),
}));
const report = {
  date: '2026-10-11', baseSource: 'f61886183d861a029d8bfca7c7854897a228edfc',
  scope: 'Private first-strong foundation; no editor/model/schema/view/export/Yjs integration or public API change',
  standards: ['https://www.unicode.org/Public/17.0.0/ucd/extracted/DerivedBidiClass.txt',
    'https://html.spec.whatwg.org/multipage/dom.html#the-dir-attribute', 'https://www.unicode.org/license.txt'],
  unicode: { version: '17.0.0', codePoints: 1114112, disjointRanges: 1123,
    sourceSHA256: '4867b4b7f0731ed1bfcd34cc6251211ff1542541fce0734b6fbda139ee80b3a4',
    contract: 'L/R/AL first-strong only, not full bidi layout or exhaustive browser Unicode conformance' },
  focused: { passed: 32, files: 1, fakeDOM: false,
    includes: 'Independent exhaustive table, streaming, nested exclusions, deep iteration, fragmented live edit/delete/reorder, explicit override detachment' },
  stableFull: { passed: 2922, files: 218, sourceFrozenDuringRun: true },
  gates: ['API 411 declaration files', 'Existing headless boundary 100 modules',
    'Packed ESM/CommonJS entry contracts', 'Existing size budgets unchanged', 'TypeScript/Svelte/Angular types'],
  native: { runs: 3, comparisons, boundedCases: 51, retries: 0,
    integration: false, reviewedPNGs: pngs, videos: 'Recorded locally, not watched or committed',
    visualNote: 'Eligible RTL/LTR and nested exclusions visible; engine UA placement differs, not pixel-equality evidence' },
  unresolved: ['Six public nested-direction audit failures unchanged',
    'Persistent ownership/schema/import identity contract', 'List/move/split integration',
    'Incremental view/virtualized model projection', 'HTML/reader/reopen and copy/paste membership',
    'Yjs integration', 'Custom renderer isolation contract'],
  unchanged: ['npm 0.4.0-beta.2', 'Parity ledger/PROD-04 Partial', 'CommonMark scores', 'Public API'],
  initialRuns: 'first-strong-direction-focused, first-strong-native, and first-strong-final-full-units logs are intermediate, not final certificates',
  hashPolicy: 'SHA256 identifies original raw bytes; Git blobs identify LF-normalized checkout content. --check validates Git blobs for cross-platform checkouts.',
  hashes,
};
const destination = 'artifacts/first-strong-foundation-verification-20261011.json';
if (process.argv.includes('--check')) {
  const saved = JSON.parse(read(destination));
  for (const item of saved.hashes) assert.equal(hashes.find(value => value.path === item.path)?.gitBlob, item.gitBlob, item.path);
  const comparable = value => ({ ...value, hashes: value.hashes.map(({ sha256, ...item }) => item) });
  assert.deepEqual(comparable(saved), comparable(report));
  console.log(`Verified ${hashes.length} source/evidence blobs; 32 focused tests, 2922 full tests, 51 bounded native cases. Editor integration remains open.`);
} else {
  writeFileSync(new URL(destination, root), JSON.stringify(report, null, 2) + '\n');
  console.log(`Saved ${destination}: ${hashes.length} source/evidence hashes.`);
}
