import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as root from 'fountainjs-editor';
import * as core from 'fountainjs-editor/core';
import { checkMarkdownContainerReferences } from '../../../scripts/fixtures/markdown-container-reference-check.mjs';

assert.ok(import.meta.resolve('fountainjs-editor').includes('/markdown-container-references-tarball-20261104/consumer/node_modules/fountainjs-editor/'));
for (const name of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) assert.equal(name in globalThis, false, name);
const require = createRequire(import.meta.url), cjs = require('fountainjs-editor');
const results = [checkMarkdownContainerReferences(root), checkMarkdownContainerReferences(core, root.CoreSchemaSpec),
  checkMarkdownContainerReferences(cjs), checkMarkdownContainerReferences(require('fountainjs-editor/core'), cjs.CoreSchemaSpec)];
assert.deepEqual(results, [36, 36, 36, 36]);
console.log(JSON.stringify({ actualTarball: true, entries: 4, checks: 144, noFakeDOM: true, results }));
