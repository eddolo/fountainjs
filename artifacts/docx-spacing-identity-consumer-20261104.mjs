// Copied into a fresh consumer directory before execution.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as root from 'fountainjs-editor';
import * as core from 'fountainjs-editor/core';
import * as html from 'fountainjs-editor/html/server';
import * as word from 'fountainjs-editor/docx';
import { checkParagraphSpacing } from '../../scripts/fixtures/paragraph-spacing-check.mjs';

assert.ok(import.meta.resolve('fountainjs-editor').includes('/docx-spacing-identity-tarball-consumer-20261104/node_modules/fountainjs-editor/'));
checkParagraphSpacing(root, html, word, root.CoreSchemaSpec);
checkParagraphSpacing(core, html, word, root.CoreSchemaSpec);
const require = createRequire(import.meta.url);
const cjsRoot = require('fountainjs-editor');
const cjsCore = require('fountainjs-editor/core');
for (const api of [cjsRoot, cjsCore]) checkParagraphSpacing(api,
  require('fountainjs-editor/html/server'), require('fountainjs-editor/docx'), cjsRoot.CoreSchemaSpec);
console.log('Actual packed consumer: ESM/CommonJS root/core portable spacing and native Word 10/12 -> 2 pt import contracts passed in pure Node. Export loss remains explicit. No publication.');
