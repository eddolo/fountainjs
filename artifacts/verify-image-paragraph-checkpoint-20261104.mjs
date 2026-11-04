import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const logContracts = [
  ['artifacts/image-paragraph-layout-full-unit-20261104.log', /3597 passed/],
  ['artifacts/image-paragraph-layout-capture-browser-20261104.log', /3 passed/],
  ['artifacts/image-paragraph-layout-build-20261104.log', /built in/],
  ['artifacts/image-paragraph-layout-types-20261104.log', /0 errors and 0 warnings/],
  ['artifacts/image-paragraph-layout-package-20261104.log', /package exports loaded successfully/],
  ['artifacts/image-paragraph-layout-headless-20261104.log', /119 modules/],
  ['artifacts/image-paragraph-layout-interop-20261104.log', /CommonJS: complete bordered/],
  ['artifacts/image-paragraph-layout-api-final-20261104.log', /419 declaration files/],
  ['artifacts/image-paragraph-markdown-conformance-20261104.log', /Complete-source oracle sensitivity/],
  ['artifacts/image-paragraph-server-runtimes-20261104.log', /complete HTML page-settings retention/],
  ['artifacts/image-paragraph-packed-consumer-final-20261104.log', /four ESM\/CJS root\/core consumers/],
  ['artifacts/image-paragraph-worker-20261104.log', /"nativeExtent":true/],
  ['artifacts/image-paragraph-approved-budget-20261104.log', /Build budget failed/],
];
const logs = [];
for (const [path, expected] of logContracts) {
  const text = (await readFile(path, 'utf8')).replaceAll('\r\n', '\n').trimEnd() + '\n';
  assert.match(text, expected, path);
  await writeFile(path, text);
  logs.push({ path, sha256: sha(text), canonicalText: 'UTF-8 LF with one final newline' });
}
async function inventory(root) {
  const items = {};
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(?:js|cjs|css)$/.test(path)) {
        const bytes = await readFile(path);
        items[relative(root, path).replaceAll('\\', '/')] = { bytes: bytes.length, sha256: sha(bytes) };
      }
    }
  }
  await walk(root);
  return items;
}
const current = await inventory(resolve('dist'));
const previous = await inventory(resolve('artifacts/docx-settings-tarball-consumer-20261104/node_modules/fountainjs-editor/dist'));
const runtimeChanges = [...new Set([...Object.keys(current), ...Object.keys(previous)])].sort()
  .filter(path => current[path]?.sha256 !== previous[path]?.sha256).map(path => ({ path, previous: previous[path], current: current[path] }));
const nativeGateRoot = 'artifacts/image-paragraph-gate-evidence-20261104/unpacked';
const nativeGate = JSON.parse(await readFile(`${nativeGateRoot}/paragraph-position-report.json`, 'utf8'));
assert.equal(nativeGate.scope.length, 6);
assert.ok(Object.values(nativeGate.deltasPt).every(delta => Object.values(delta).every(value => Math.abs(value) <= 0.01)));
assert.equal(nativeGate.negativeControl.correctlyRejected, true);
assert.equal(nativeGate.captionNegativeControl.correctlyRejected, true);
const nativePages = [];
for (const kind of ['source', 'exported']) for (const page of [1, 2]) {
  const path = `native/${kind}/page-${page}.png`;
  const hash = sha(await readFile(`${nativeGateRoot}/${path}`));
  assert.equal(hash, sha(await readFile(`artifacts/image-paragraph-native-evidence-20261104/unpacked/${path}`)));
  nativePages.push({ path, sha256: hash, equalsIndependentlyReviewedPage: true });
}
const report = { implementationCommit: 'e5fb6c5614c7c5501622b286b3fe5434c8276cf7',
  nativeGateCommit: '5fb1e39', unitTests: 3597, unitFiles: 254,
  nativeGate: { run: 41768955941, job: 126373887202,
    archiveSHA256: 'bc13c69cdadf2dac42496084b88b4e518227ce8e2d9e2432aa82acdd0b6a7a1b', report: nativeGate, pages: nativePages },
  browserEngines: ['chromium', 'firefox', 'webkit'], logs, runtimeChanges,
  packedSHA256: sha(await readFile('artifacts/image-paragraph-tarball-consumer-20261104/fountainjs-editor-0.4.0-beta.2.tgz')),
  approvedLimitsKiB: { docxESM: 185, docxCJS: 149.5, aggregateESM: 1652.5, aggregateCJS: 1375.5 },
  sizeGatePassed: false, failingLimits: ['core ESM', 'core CJS', 'DOCX ESM', 'DOCX CJS', 'CSS', 'aggregate ESM', 'aggregate CJS'],
  priorHTMLTimingGateUnresolved: true, released: false, fullFidelityCertified: false };
await writeFile('artifacts/image-paragraph-verification-20261104.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ unitTests: report.unitTests, runtimeChanges: runtimeChanges.map(item => item.path), packedSHA256: report.packedSHA256,
  sizeGatePassed: false, released: false }, null, 2));
