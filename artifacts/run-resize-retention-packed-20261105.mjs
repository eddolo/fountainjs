import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const root = resolve('.'), archive = resolve(process.argv[2]);
const consumer = join(root, 'artifacts', `resize-retention-consumer-20261105-${Date.now()}`);
assert.ok(consumer.startsWith(root + sep));
const modules = join(consumer, 'node_modules'), extracted = join(modules, 'fountainjs-editor');
mkdirSync(extracted, { recursive: true });
writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'fountain-resize-retention-consumer', private: true, type: 'module' }));
const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split(/\r?\n/);
assert.ok(entries.every(entry => entry.startsWith('package/') && !entry.split('/').includes('..')));
execFileSync('tar', ['-xzf', archive, '-C', extracted, '--strip-components=1']);
for (const dependency of readdirSync(join(root, 'node_modules'))) {
  if (dependency.startsWith('.') || dependency === 'fountainjs-editor') continue;
  const source = join(root, 'node_modules', dependency), target = join(modules, dependency);
  if (statSync(source).isDirectory() && !existsSync(target)) symlinkSync(realpathSync(source), target, process.platform === 'win32' ? 'junction' : 'dir');
}
let files = 0;
const compare = (directory, prefix = '') => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = join(prefix, entry.name), path = join(directory, entry.name);
    if (entry.isDirectory()) compare(path, relative);
    else { assert.deepEqual(readFileSync(path), readFileSync(join(extracted, 'dist', relative)), relative); files++; }
  }
};
compare(join(root, 'dist'));
copyFileSync(join(root, 'artifacts/resize-retention-packed-probe-20261105.mjs'), join(consumer, 'probe.mjs'));
const result = spawnSync(process.execPath, ['probe.mjs'], { cwd: consumer, encoding: 'utf8' });
writeFileSync(join(root, 'artifacts/resize-retention-packed-node-20261105.log'), result.stdout + result.stderr);
const report = { archive, archiveSha256: createHash('sha256').update(readFileSync(archive)).digest('hex'), consumer,
  allBuildFilesMatch: files, exitCode: result.status, ...(result.status === 0 ? { proof: JSON.parse(result.stdout) } : {}) };
writeFileSync(join(root, 'artifacts/resize-retention-packed-node-20261105.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(result.status ?? 1); }
