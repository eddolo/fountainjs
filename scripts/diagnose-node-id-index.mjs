import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, cpus, platform, release } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

// Installed-public-package diagnostic. Correctness assertions are mandatory;
// timings describe this process/host and do not replace product acceptance.
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index], value = process.argv[index + 1];
  assert(['--package-root', '--sizes', '--repeats', '--output', '--tarball'].includes(key), `Unknown option: ${key}`);
  assert(value && !value.startsWith('--') && !options.has(key), `Expected one value for ${key}`);
  options.set(key, value);
}
assert(options.has('--package-root') && options.has('--output'), 'Pass --package-root and a fresh --output.');
assert.equal(typeof globalThis.document, 'undefined', 'Run in pure Node, without a fake DOM.');
assert.equal(typeof globalThis.gc, 'function', 'Run Node with --expose-gc.');
const packageRoot = realpathSync(resolve(options.get('--package-root')));
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
assert.equal(manifest.name, 'fountainjs-editor');
const requirePackage = createRequire(join(packageRoot, 'package.json'));
const { CoreExtension, Schema, composeExtensions } = requirePackage('fountainjs-editor');
const { createStableNodeIdIndex } = requirePackage('fountainjs-editor/node-ids');
const sizes = (options.get('--sizes') ?? '1000,5000,10000').split(',').map(Number);
const repeats = Number(options.get('--repeats') ?? 7), output = resolve(options.get('--output'));
assert(sizes.length && sizes.length <= 8 && new Set(sizes).size === sizes.length
  && sizes.every(value => Number.isSafeInteger(value) && value >= 2 && value <= 100_000));
assert(Number.isSafeInteger(repeats) && repeats >= 2 && repeats <= 50);
assert(!existsSync(output), 'Refusing to overwrite diagnostic evidence.');
const sha256 = value => createHash('sha256').update(value).digest('hex');
function fingerprint() {
  const files = [];
  const visit = path => {
    if (statSync(path).isDirectory()) for (const entry of readdirSync(path).sort()) visit(join(path, entry));
    else files.push(path);
  };
  visit(join(packageRoot, 'dist')); files.push(join(packageRoot, 'package.json'));
  const hash = createHash('sha256'); let bytes = 0;
  for (const path of files.sort()) {
    const data = readFileSync(path); bytes += data.length;
    hash.update(relative(packageRoot, path).replaceAll('\\', '/')).update('\0').update(data).update('\0');
  }
  return { algorithm: 'SHA-256(sorted relative path + NUL + contents + NUL)', scope: 'dist/** and package.json',
    sha256: hash.digest('hex'), files: files.length, bytes };
}
function summary(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = quantile => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
  return { count: samples.length, medianMs: at(0.5), p95Ms: at(0.95), samplesMs: samples };
}
const schema = new Schema(composeExtensions([CoreExtension]).schema);
const report = {
  format: 'fountain-node-id-index-diagnostic/1', harnessSha256: sha256(readFileSync(fileURLToPath(import.meta.url))), startedAt: new Date().toISOString(),
  package: { root: packageRoot, version: manifest.version, fingerprint: fingerprint(),
    ...(options.has('--tarball') ? { tarball: resolve(options.get('--tarball')), tarballSha256: sha256(readFileSync(resolve(options.get('--tarball')))) } : {}) },
  runtime: { node: process.version, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model },
  configuration: { sizes, repeats, gc: 'before each measured construction; outside timer',
    cases: ['unique', 'all-colliding', 'mixed-groups'], timed: 'createStableNodeIdIndex only; fixture creation and assertions excluded', timingThresholds: null },
  scope: 'Single-host public CommonJS package diagnostic of index construction, not paste-to-paint, collaborative typing or production certification. Every source node remains intact. Duplicate IDs must fail closed while preserving all paths and collision diagnostics.',
  cases: [], ok: false,
};
try {
  for (const size of sizes) for (const kind of report.configuration.cases) {
    const ids = Array.from({ length: size }, (_, index) => kind === 'unique' ? `block-${index}`
      : kind === 'all-colliding' ? 'copied-id' : `group-${index % 16}`);
    const document = schema.node('doc', {}, ids.map((nodeId, index) =>
      schema.node('paragraph', { nodeId }, [schema.text(`Block ${index}`)])));
    schema.validate(document);
    const groups = new Map();
    ids.forEach((id, index) => { const group = groups.get(id) ?? []; group.push(index); groups.set(id, group); });
    const sourceSha256 = sha256(JSON.stringify(document.toJSON())), samples = [];
    let held;
    for (let repeat = 0; repeat < repeats; repeat++) {
      globalThis.gc();
      const started = performance.now(), index = createStableNodeIdIndex(document);
      samples.push(performance.now() - started);
      assert.equal(index.size, groups.size);
      assert.equal(index.entries.length, size);
      assert.equal(index.issues.length, size - groups.size);
      assert(Object.isFrozen(index.entries) && Object.isFrozen(index.issues));
      for (const [id, positions] of groups) {
        const entries = index.getAll(id);
        assert(Object.isFrozen(entries));
        assert.equal(entries.length, positions.length);
        assert.equal(index.get(id), positions.length === 1 ? entries[0] : undefined);
        assert.equal(index.has(id), positions.length === 1);
        positions.forEach((position, ordinal) => {
          const entry = entries[ordinal];
          assert(Object.isFrozen(entry) && Object.isFrozen(entry.path));
          assert.equal(entry.id, id); assert.deepEqual(entry.path, [position]);
          assert.equal(entry.node, document.child(position));
        });
      }
      for (const issue of index.issues) {
        assert.equal(issue.reason, 'duplicate');
        const position = issue.path[0], id = ids[position];
        assert.deepEqual(issue.path, [position]);
        assert.equal(issue.value, id);
        assert.deepEqual(issue.duplicateOf, [groups.get(id)[0]]);
      }
      assert.equal(index.get('missing-id'), undefined);
      assert(Object.isFrozen(index.getAll('missing-id')));
      assert.equal(sha256(JSON.stringify(document.toJSON())), sourceSha256);
      if (held) assert.equal(held.getAll(ids[0]).length, groups.get(ids[0]).length);
      held = index;
    }
    report.cases.push({ size, kind, groups: groups.size, duplicateIssues: size - groups.size,
      sourceSha256, ok: true, construction: summary(samples) });
    process.stderr.write(`Node-ID index: ${kind}, ${size} blocks passed\n`);
  }
  report.ok = true;
} catch (error) {
  report.error = { message: error.message, stack: error.stack }; process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}
