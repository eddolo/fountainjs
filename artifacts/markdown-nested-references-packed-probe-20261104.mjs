import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as root from 'fountainjs-editor';
import * as core from 'fountainjs-editor/core';
import { checkMarkdownNestedReferences } from '../../../scripts/fixtures/markdown-nested-reference-check.mjs';

assert.ok(import.meta.resolve('fountainjs-editor').includes('/markdown-nested-references-tarball-20261104/consumer/node_modules/fountainjs-editor/'));
for (const name of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) assert.equal(name in globalThis, false, name);
const require = createRequire(import.meta.url), cjs = require('fountainjs-editor');
const results = [checkMarkdownNestedReferences(root), checkMarkdownNestedReferences(core, root.CoreSchemaSpec),
  checkMarkdownNestedReferences(cjs), checkMarkdownNestedReferences(require('fountainjs-editor/core'), cjs.CoreSchemaSpec)];
assert.deepEqual(results, [42, 42, 42, 42]);
console.log(JSON.stringify({ actualTarball: true, entries: 4, checks: 168, noFakeDOM: true, results }));
