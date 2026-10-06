import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Pinned test-only oracle, downloaded into an explicitly chosen artifact folder.
// Never modify the audited application's dependencies or bundle this in runtime.
const version = '4.14.0';
const integrity = 'sha512-9WTZxEjsZ7b13TH8JPmbV2z8CHbl80/2hm3XPEG4JgNdQLK81IBRXmSxHfMAOkSqQeRxT/0dwNDz2GOm3zzpcQ==';
const directory = path.resolve(process.argv[2]);
assert.ok(path.basename(directory).includes('axe-core'), 'Choose a dedicated axe-core artifact directory.');
await mkdir(directory, { recursive: true });
const response = await fetch(`https://registry.npmjs.org/axe-core/-/axe-core-${version}.tgz`);
assert.ok(response.ok, `npm registry status ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
assert.equal(`sha512-${createHash('sha512').update(bytes).digest('base64')}`, integrity);
const archive = path.join(directory, `axe-core-${version}.tgz`);
await writeFile(archive, bytes);
const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split(/\r?\n/);
for (const entry of entries) {
  assert.ok(entry.startsWith('package/') && !entry.split('/').includes('..') && !entry.includes('\\'), `Unsafe archive entry ${entry}`);
}
for (const entry of ['package/axe.min.js', 'package/LICENSE', 'package/package.json']) assert.ok(entries.includes(entry));
execFileSync('tar', ['-xzf', archive, '-C', directory, 'package/axe.min.js', 'package/LICENSE', 'package/package.json']);
await writeFile(path.join(directory, 'provenance.json'), JSON.stringify({
  name: 'axe-core', version, integrity, license: 'MPL-2.0',
  source: `https://registry.npmjs.org/axe-core/-/axe-core-${version}.tgz`,
  role: 'automated testing only; not Fountain runtime; not full WCAG certification',
}, null, 2));
console.log(JSON.stringify({ version, integrity, bundle: path.join(directory, 'package/axe.min.js') }));
