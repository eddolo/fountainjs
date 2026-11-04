// Copied into the fresh local consumer directory by the paired PowerShell runner.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as root from 'fountainjs-editor';
import * as core from 'fountainjs-editor/core';
import * as html from 'fountainjs-editor/html/server';
import * as word from 'fountainjs-editor/docx';
import { checkParagraphSpacing } from '../../scripts/fixtures/paragraph-spacing-check.mjs';

assert.ok(import.meta.resolve('fountainjs-editor').includes('/paragraph-spacing-tarball-consumer-20261104/node_modules/fountainjs-editor/'));
checkParagraphSpacing(root, html, word, root.CoreSchemaSpec);
checkParagraphSpacing(core, html, word, root.CoreSchemaSpec);
const require = createRequire(import.meta.url);
const cjsRoot = require('fountainjs-editor');
const cjsCore = require('fountainjs-editor/core');
checkParagraphSpacing(cjsRoot, require('fountainjs-editor/html/server'), require('fountainjs-editor/docx'), cjsRoot.CoreSchemaSpec);
checkParagraphSpacing(cjsCore, require('fountainjs-editor/html/server'), require('fountainjs-editor/docx'), cjsRoot.CoreSchemaSpec);
console.log('Actual packed tarball: pure-Node ESM/CommonJS root/core contextual gap, JSON, HTML, transaction and explicit native loss contracts passed. No publication.');
