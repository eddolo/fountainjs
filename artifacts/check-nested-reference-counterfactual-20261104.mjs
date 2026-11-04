import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as before from './markdown-html-source-tarball-20261104/consumer/node_modules/fountainjs-editor/dist/index.js';
import * as after from '../dist/index.js';
import { checkMarkdownNestedReferences } from '../scripts/fixtures/markdown-nested-reference-check.mjs';

const baselineTarballSHA256 = createHash('sha256').update(await readFile('artifacts/markdown-html-source-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz')).digest('hex');
assert.equal(baselineTarballSHA256, '14d81117fcb590ba0fd2cd7edfa7dcc4ebb65efd04f05a687b337498002ab7c5');
let baselineFirstFailure;
try { checkMarkdownNestedReferences(before); }
catch (error) { baselineFirstFailure = error.message; }
assert.equal(baselineFirstFailure, 'Reference-scoped nested edit rewrote unrelated source.');
const currentChecks = checkMarkdownNestedReferences(after);
assert.equal(currentChecks, 42);
const report = { baseline: 'actual PR #12 tarball', baselineTarballSHA256,
  baselineFirstFailure, baselineStopsAtFirstFailure: true, currentChecks,
  scope: 'Source spelling retention; not a claim that the baseline lost visible document content' };
await writeFile('artifacts/markdown-nested-references-counterfactual-20261104.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
