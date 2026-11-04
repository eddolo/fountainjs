import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as root from 'fountainjs-editor';
import * as core from 'fountainjs-editor/core';
import {checkMarkdownSourceBoundaries} from '../../../scripts/fixtures/markdown-source-boundary-check.mjs';
assert.ok(import.meta.resolve('fountainjs-editor').includes('/markdown-source-boundaries-tarball-20261104/consumer/node_modules/fountainjs-editor/'));
for(const name of ['window','document','DOMParser','HTMLElement','MutationObserver']) assert.equal(name in globalThis,false,name);
const require=createRequire(import.meta.url);
const cjs=require('fountainjs-editor');
const results=[checkMarkdownSourceBoundaries(root),checkMarkdownSourceBoundaries(core,root.CoreSchemaSpec),
 checkMarkdownSourceBoundaries(cjs),checkMarkdownSourceBoundaries(require('fountainjs-editor/core'),cjs.CoreSchemaSpec)];
assert.deepEqual(results,[12,12,12,12]);
console.log(JSON.stringify({actualTarball:true,entries:4,checks:48,noFakeDOM:true,results}));
