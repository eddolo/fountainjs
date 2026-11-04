import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as root from 'fountainjs-editor';
import * as core from 'fountainjs-editor/core';
import { checkMarkdownHTMLSourceBoundaries } from '../../../scripts/fixtures/markdown-html-source-boundary-check.mjs';

assert.ok(import.meta.resolve('fountainjs-editor').includes('/markdown-html-source-tarball-20261104/consumer/node_modules/fountainjs-editor/'));
for (const name of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) assert.equal(name in globalThis, false, name);
const require = createRequire(import.meta.url), cjs = require('fountainjs-editor');
const results = [checkMarkdownHTMLSourceBoundaries(root), checkMarkdownHTMLSourceBoundaries(core, root.CoreSchemaSpec),
  checkMarkdownHTMLSourceBoundaries(cjs), checkMarkdownHTMLSourceBoundaries(require('fountainjs-editor/core'), cjs.CoreSchemaSpec)];
assert.deepEqual(results, [50, 50, 50, 50]);
console.log(JSON.stringify({ actualTarball: true, entries: 4, checks: 200, noFakeDOM: true, results }));
