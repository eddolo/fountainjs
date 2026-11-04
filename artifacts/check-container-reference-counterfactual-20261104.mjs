import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as before from './markdown-nested-references-tarball-20261104/consumer/node_modules/fountainjs-editor/dist/index.js';
import * as after from '../dist/index.js';
import { checkMarkdownContainerReferences } from '../scripts/fixtures/markdown-container-reference-check.mjs';

const baselineTarballSHA256 = createHash('sha256').update(await readFile('artifacts/markdown-nested-references-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz')).digest('hex');
assert.equal(baselineTarballSHA256, 'e684488c040777acae594d62af33b8ec012cc13aa847b7f4475edbbc57b1c09b');
let baselineFirstFailure;
try { checkMarkdownContainerReferences(before); }
catch (error) { baselineFirstFailure = error.message; }
assert.equal(baselineFirstFailure, 'Container-carried definitions caused unrelated source rewriting.');
const currentChecks = checkMarkdownContainerReferences(after);
assert.equal(currentChecks, 36);
const report = { baseline: 'actual PR #13 tarball', baselineTarballSHA256,
  baselineFirstFailure, baselineStopsAtFirstFailure: true, currentChecks,
  scope: 'Source spelling retention; not a claim that the baseline lost visible document content' };
await writeFile('artifacts/markdown-container-references-counterfactual-20261104.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
