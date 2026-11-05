import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as root from 'fountainjs-editor';
import * as core from 'fountainjs-editor/core';
import * as server from 'fountainjs-editor/html/server';

assert.ok(import.meta.resolve('fountainjs-editor/html/server').includes('/server-html-tarball-20261105/consumer/node_modules/fountainjs-editor/'));
for (const name of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) assert.equal(name in globalThis, false, name);
const require = createRequire(import.meta.url);
const cjs = require('fountainjs-editor'), cjsCore = require('fountainjs-editor/core'), cjsServer = require('fountainjs-editor/html/server');
const oldBase = new URL('../../code-label-tarball-20261104/consumer/node_modules/fountainjs-editor/dist/', import.meta.url);
const oldRoot = await import(new URL('index.js', oldBase)), oldCore = await import(new URL('core.js', oldBase));
const oldServer = await import(new URL('html-server.js', oldBase));
const oldCJS = require(fileURLToPath(new URL('index.cjs', oldBase))), oldCJSCore = require(fileURLToPath(new URL('core.cjs', oldBase)));
const oldCJSServer = require(fileURLToPath(new URL('html-server.cjs', oldBase)));
const entries = [
  [root, server, root.CoreSchemaSpec, oldRoot, oldServer, oldRoot.CoreSchemaSpec],
  [core, server, root.CoreSchemaSpec, oldCore, oldServer, oldRoot.CoreSchemaSpec],
  [cjs, cjsServer, cjs.CoreSchemaSpec, oldCJS, oldCJSServer, oldCJS.CoreSchemaSpec],
  [cjsCore, cjsServer, cjs.CoreSchemaSpec, oldCJSCore, oldCJSServer, oldCJS.CoreSchemaSpec],
];
function setup(api, htmlAPI, spec) {
  const observed = [];
  const shared = { tag: 'span[data-observed]', getAttrs(element) {
    observed.push({ tag: element.tagName, keys: element.getAttributeNames(), tokens: element.getSourceTokens(), parent: element.parentElement?.tagName ?? null });
    return { id: element.getAttribute('data-observed') };
  } };
  const schema = new api.Schema({ ...spec,
    nodes: { ...spec.nodes, panel: { group: 'block', content: 'block+', attrs: { tone: { default: 'info' } }, parseHTML: [
      { tag: 'aside[data-panel]', priority: 90, getAttrs() { return false; } },
      { tag: 'aside[data-panel]', priority: 80, getAttrs(element) { return { tone: element.dataset.tone ?? 'info' }; } },
    ] }, legacy: { group: 'block', content: 'block+', parseDOM: [{ tag: 'section[data-legacy]', getAttrs() { throw new Error('DOM-only callback must never run'); } }] } },
    marks: { ...spec.marks, observed: { attrs: { id: { default: '' } }, parseHTML: [shared], parseDOM: [shared] },
      invalid: { parseHTML: [{ tag: '[[invalid' }] } },
  });
  return { schema, observed, importer: new htmlAPI.ServerHTMLImporter({ sourceTokens: true, maxInputBytes: 2 * 1024 * 1024, maxNodes: 100_000 }) };
}
const fixtures = [
  '<p><strong>Bold</strong> <em>em</em> <a href="https://example.com">link</a></p>',
  '<aside data-panel data-tone="warning"><p><span data-observed="one">First</span></p></aside><p><span data-observed="two">Second</span></p>',
  '<section data-legacy><p>Legacy body</p></section><p><unknown-inline>Unknown</unknown-inline><!-- comment --><a href="javascript:alert(1)">Unsafe</a><img src="javascript:alert(2)"></p>',
  '<table><thead><tr><th colspan="2">Title</th></tr></thead><tbody><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></tbody></table>',
  '<blockquote><ol start="0"><li><p>List</p></li></ol></blockquote><pre data-language="x&quot;y"><code>one\n&lt;literal&gt;</code></pre>',
  '<html lang="ar"><head><title>Host title</title></head><body><p dir="rtl" style="color:#123456;font-weight:bold">שלום <span data-observed="unicode">日本語</span></p></body></html>',
  '<svg viewBox="0 0 10 10"><text>SVG</text></svg><p><b data-observed="orphan">Malformed<table><tr><td>cell</b>tail',
  Array.from({ length: 1000 }, (_, i) => `<p><strong>Paragraph ${i}</strong> with <a href="https://example.com/${i}">a safe link</a>.</p>`).join(''),
];
let cases = 0;
for (const [api, htmlAPI, spec, oldAPI, oldHTML, oldSpec] of entries) for (const html of fixtures) {
  for (const method of ['parseWithReport', 'parseFragmentWithReport']) {
    const actual = setup(api, htmlAPI, spec), parent = setup(oldAPI, oldHTML, oldSpec);
    const result = actual.importer[method](html, actual.schema), expected = parent.importer[method](html, parent.schema);
    const json = value => 'document' in value ? value.document.toJSON() : value.nodes.map(node => node.toJSON());
    assert.deepEqual(json(result), json(expected));
    assert.deepEqual(result.issues, expected.issues);
    assert.deepEqual(actual.observed, parent.observed);
    assert.ok(result.issues.some(issue => issue.code === 'invalid-selector'));
    cases++;
  }
}
console.log(JSON.stringify({ actualTarball: true, noFakeDOM: true, entries: 4, fullModelIssueAndTokenComparisons: cases, reference: 'actual parent package', skippedDOMCallbacks: true }));
