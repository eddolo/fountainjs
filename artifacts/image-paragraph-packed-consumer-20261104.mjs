import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { strFromU8, unzipSync } from 'fflate';
import * as root from 'fountainjs-editor';
import * as core from 'fountainjs-editor/core';
import * as html from 'fountainjs-editor/html/server';
import * as word from 'fountainjs-editor/docx';

assert.ok(import.meta.resolve('fountainjs-editor').includes('/image-paragraph-tarball-consumer-20261104/node_modules/fountainjs-editor/'));
assert.equal(typeof globalThis.document, 'undefined');
const source = readFileSync(new URL('../../tests/fixtures/native-docx/cooling-report.docx', import.meta.url));
function check(api, htmlAPI, wordAPI, spec) {
  const schema = new api.Schema(spec);
  const document = wordAPI.importDOCX(source, schema).document;
  const before = document.toJSON();
  const images = document.content.filter(node => node.type.name === 'image_super');
  assert.equal(images.length, 2);
  for (const image of images) assert.equal(image.attrs.imageLayout.spacingAfter, 7);
  assert.equal(images[0].attrs.width, '566.4px');
  assert.equal(images[0].attrs.height, '181.247979px');
  const markup = root.HTMLExporter.export(document);
  assert.deepEqual(htmlAPI.ServerHTMLImporter.parse(markup, schema).toJSON(), before);
  const exported = wordAPI.exportDOCX(document);
  const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']);
  assert.ok(xml.includes('<wp:extent cx="5394960" cy="1726387"/>'));
  const reopened = wordAPI.importDOCX(exported.bytes, schema).document;
  const reopenedImages = reopened.content.filter(node => node.type.name === 'image_super');
  assert.deepEqual(reopenedImages.map(node => node.attrs.imageLayout), images.map(node => node.attrs.imageLayout));
  assert.deepEqual(reopenedImages.map(node => node.attrs.src), images.map(node => node.attrs.src));
  assert.deepEqual(document.toJSON(), before);
}
check(root, html, word, root.CoreSchemaSpec);
check(core, html, word, root.CoreSchemaSpec);
const require = createRequire(import.meta.url);
const cjs = require('fountainjs-editor');
for (const api of [cjs, require('fountainjs-editor/core')]) check(api,
  require('fountainjs-editor/html/server'), require('fountainjs-editor/docx'), cjs.CoreSchemaSpec);
console.log('Actual tarball: four ESM/CJS root/core consumers preserve image layout, fractional dimensions, embedded bytes and complete HTML JSON without a DOM.');
