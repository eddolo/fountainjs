import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const root = resolve('artifacts/docx-native-spacing-real-20261104');
const reference = resolve('artifacts/docx-spacing-identity-real-20261104');
const baselineDist = resolve('artifacts/docx-spacing-identity-tarball-consumer-20261104/node_modules/fountainjs-editor/dist');
const records = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const observation = JSON.parse(await readFile(resolve(root, engine, 'observations.json'), 'utf8'));
  // Same <0.05 CSS-pixel bound as the browser journey's toBeCloseTo(0, 1).
  // Retain raw subpixel readings rather than rounding the evidence to zero.
  assert.ok(observation.initialGaps.every(value => Math.abs(value) < 0.05));
  assert.ok(Math.abs(observation.nativeReopenGap) < 0.05);
  assert.ok(Math.abs(observation.readerGap) < 0.05);
  const images = {};
  for (const name of ['imported.png', 'reader.png', 'native-export-reopened.png']) {
    const bytes = await readFile(resolve(root, engine, name));
    images[name] = { sha256: sha(bytes) };
    if (name !== 'native-export-reopened.png') {
      images[name].priorSHA256 = sha(await readFile(resolve(reference, engine, name)));
      images[name].priorByteEquality = images[name].sha256 === images[name].priorSHA256;
    }
  }
  const bytes = await readFile(resolve(root, engine, 'actual-export.docx'));
  const readerHTMLSHA256 = sha(await readFile(resolve(root, engine, 'reader.html')));
  const previousReaderHTMLSHA256 = sha(await readFile(resolve(reference, engine, 'reader.html')));
  assert.equal(readerHTMLSHA256, previousReaderHTMLSHA256);
  const parts = unzipSync(bytes);
  const previous = unzipSync(await readFile(resolve(reference, engine, 'actual-export.docx')));
  const changedParts = [...new Set([...Object.keys(parts), ...Object.keys(previous)])].sort().filter(name =>
    !parts[name] || !previous[name] || sha(parts[name]) !== sha(previous[name]));
  const xml = strFromU8(parts['word/document.xml']);
  assert.equal((xml.match(/<w:contextualSpacing w:val="1"\/>/g) ?? []).length, 4);
  assert.ok(parts['customXml/fountainParagraphs.xml']);
  records.push({ engine, observation, images, readerHTMLSHA256, previousReaderHTMLSHA256, exportedSHA256: sha(bytes), partSHA256: Object.fromEntries(Object.entries(parts).map(([name, data]) => [name, sha(data)])),
    changedPartsFromPrevious: changedParts, nativeMetadata: strFromU8(parts['customXml/fountainParagraphs.xml']) });
}
for (const [name, digest] of Object.entries(records[0].partSHA256)) {
  if (name === 'docProps/core.xml') continue;
  assert.ok(records.every(record => record.partSHA256[name] === digest), `Cross-engine native part differs: ${name}`);
}
const runtime = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = resolve(directory, entry.name);
    if (entry.isDirectory()) { await inspect(name); continue; }
    if (!/\.(?:js|cjs|css)$/.test(entry.name)) continue;
    const path = relative(resolve('dist'), name).replaceAll('\\', '/');
    const current = await readFile(name), previous = await readFile(resolve(baselineDist, path));
    runtime.push({ path, sha256: sha(current), previousSHA256: sha(previous), equal: sha(current) === sha(previous), bytes: current.length, previousBytes: previous.length });
  }
}
await inspect(resolve('dist'));
const sourceSHA256 = sha(await readFile('tests/fixtures/native-docx/cooling-report.docx'));
assert.equal(sourceSHA256, '52c8f9038c22f7ab1294690901362ea1f4dc8a2b6691091be5e4096ab6806495');
const videos = [];
for (const folder of await readdir('artifacts/docx-native-spacing-browser-20261104', { withFileTypes: true })) {
  if (!folder.isDirectory()) continue;
  for (const file of await readdir(resolve('artifacts/docx-native-spacing-browser-20261104', folder.name))) {
    if (!file.endsWith('.webm')) continue;
    const path = `artifacts/docx-native-spacing-browser-20261104/${folder.name}/${file}`;
    const bytes = await readFile(path); videos.push({ path, bytes: bytes.length, sha256: sha(bytes) });
  }
}
assert.equal(videos.length, 6); // Editor and standalone-reader page per engine.
const unitLog = await readFile('artifacts/docx-native-spacing-final-full-unit-20261104.log', 'utf8');
assert.match(unitLog, /Tests\s+3577 passed \(3577\)/);
assert.match(unitLog, /Test Files\s+251 passed \(251\)/);
const checks = { fullUnits: { passed: 3577, files: 251, newContracts: 45 }, desktopJourneys: { passed: 3, workers: 1, headless: true, recordedPages: 6 },
  frameworkTypes: true, pureNodePackedESMAndCommonJS: true, workerdNativeGapPt: 2, headlessSourceModules: 119, publicDeclarations: 419,
  sizeGate: { passed: false, failingCeilings: 7, limitsChanged: false }, priorHTMLTimingFailureResolved: false };
const logNames = ['final-full-unit', 'final-types', 'build', 'types', 'package', 'headless', 'interop', 'api', 'budgets', 'workerd', 'browser'];
const logs = Object.fromEntries(await Promise.all(logNames.map(async name => {
  const path = `artifacts/docx-native-spacing-${name}-20261104.log`;
  const text = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').trimEnd();
  return [name, { path, sha256: sha(text ? text + '\n' : '') }];
})));
const result = { sourceCommit: 'b2d04c6f9e1f625b38baf90d83f7a21dd6dbc7ef', sourceSHA256, checks, logs, logHashFormat: 'UTF-8; BOM removed; LF; trailing blank lines omitted', videos,
  actualTarballSHA256: sha(await readFile('artifacts/docx-native-spacing-tarball-consumer-20261104/fountainjs-editor-0.4.0-beta.2.tgz')),
  engines: records, runtime, runtimeChanges: runtime.filter(record => !record.equal), actualBrowserFiles: true,
  nativeRendering: { run: 41761593707, job: 126350295939, conclusion: 'success', review: 'artifacts/docx-native-spacing-native-review-20261104.json', completeFidelityCertified: false }, sizeCapsUnchanged: true };
await writeFile('artifacts/docx-native-spacing-verification-20261104.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ engines: records.map(({ engine, images, observation, changedPartsFromPrevious }) => ({ engine, images, nativeReopenGap: observation.nativeReopenGap, changedPartsFromPrevious })),
  runtimeFiles: runtime.length, changedRuntimeFiles: result.runtimeChanges.map(({ path, bytes, previousBytes }) => ({ path, bytes, previousBytes })) }, null, 2));
