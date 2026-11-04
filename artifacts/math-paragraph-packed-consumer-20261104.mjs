import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as root from 'fountainjs-editor';
import * as core from 'fountainjs-editor/core';
import * as server from 'fountainjs-editor/html/server';
import * as word from 'fountainjs-editor/docx';
import { PagesExtension } from 'fountainjs-editor/pages';
import { exerciseMathParagraph, expectedMathParagraph } from '../exercise-math-paragraph-20261104.mjs';
assert.ok(import.meta.resolve('fountainjs-editor').includes('/math-paragraph-tarball-consumer-20261104/node_modules/fountainjs-editor/'));
const source = await readFile(new URL('../../tests/fixtures/native-docx/cooling-report.docx', import.meta.url));
const spec = root.composeExtensions([...root.StarterKit.extensions, PagesExtension, root.createMathExtension()]).schema;
for (const api of [root, core]) assert.deepEqual(exerciseMathParagraph(api, root, server, word, source, spec), expectedMathParagraph);
const require = createRequire(import.meta.url);
const cjs = require('fountainjs-editor');
const cjsSpec = cjs.composeExtensions([...cjs.StarterKit.extensions, require('fountainjs-editor/pages').PagesExtension, cjs.createMathExtension()]).schema;
for (const api of [cjs, require('fountainjs-editor/core')]) assert.deepEqual(exerciseMathParagraph(api, cjs,
  require('fountainjs-editor/html/server'), require('fountainjs-editor/docx'), source, cjsSpec), expectedMathParagraph);
console.log('Actual packed ESM/CommonJS root/core: real Word equation paragraph context, complete HTML, native reopening, source editing and exact undo passed without DOM globals.');
