import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as root from 'fountainjs-editor';
import * as core from 'fountainjs-editor/core';
import { checkMarkdownReferenceBoundaries } from '../../../scripts/fixtures/markdown-reference-boundary-check.mjs';

assert.ok(import.meta.resolve('fountainjs-editor').includes('/markdown-reference-boundaries-tarball-20261104/consumer/node_modules/fountainjs-editor/'));
for (const name of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) assert.equal(name in globalThis, false, name);
const require = createRequire(import.meta.url), cjs = require('fountainjs-editor');
const results = [checkMarkdownReferenceBoundaries(root), checkMarkdownReferenceBoundaries(core, root.CoreSchemaSpec),
  checkMarkdownReferenceBoundaries(cjs), checkMarkdownReferenceBoundaries(require('fountainjs-editor/core'), cjs.CoreSchemaSpec)];
assert.deepEqual(results, [12, 12, 12, 12]);
console.log(JSON.stringify({ actualTarball: true, entries: 4, checks: 48, noFakeDOM: true,
  includesNativeEditorEnter: true, results }));
