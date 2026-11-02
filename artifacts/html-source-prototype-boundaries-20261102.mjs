import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Schema, CoreSchemaSpec, HTMLExporter } from '../dist/index.js';
import { createInertHTMLInlineExtension, createInertHTMLRawTextExtension } from '../dist/html-inert.js';
import { ServerHTMLImporter } from '../dist/html-server.js';
import { reconstructSource } from './html-source-reconstruction-prototype-20261102.mjs';

const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
  ...createInertHTMLRawTextExtension({ tags: ['script', 'style', 'textarea'] }).nodes,
  ...createInertHTMLInlineExtension({ tags: ['lab-widget'] }).nodes } });
const importer = new ServerHTMLImporter();
const fixtures = [
  { name: 'script body', tag: 'script', body: 'const x = "<tag> & data";' },
  { name: 'style body', tag: 'style', body: 'p { color: red; }' },
  { name: 'textarea leading LF', tag: 'textarea', body: '\nfirst\nsecond' },
  { name: 'textarea markup', tag: 'textarea', body: '</textarea><b>literal</b>&' },
  { name: 'edited script closing token', tag: 'script', body: 'const x = "</script><p>leaked</p>";' },
  { name: 'edited style closing token', tag: 'style', body: '/* </style><p>leaked</p> */' },
  { name: 'authored CRLF source', tag: 'script', body: 'first\r\nsecond' },
  { name: 'authored NUL source', tag: 'textarea', body: 'first\0second' },
  { name: 'unknown custom tag', tag: 'lab-widget', body: 'editable', attributes: { onclick: 'dangerous()', 'data-v': 'a&b' } },
];
const rows = fixtures.map(fixture => {
  const type = fixture.tag === 'lab-widget' ? 'html_inert_inline' : 'html_inert_raw_text';
  const attrs = { tag: fixture.tag, attributes: fixture.attributes ?? {} };
  const node = schema.node(type, attrs, [schema.text(fixture.body)]);
  const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [node])]);
  const safeHTML = HTMLExporter.export(doc, { document: false });
  const sourceHTML = reconstructSource(safeHTML);
  const reopened = importer.parseWithReport(sourceHTML, schema);
  const actual = [];
  reopened.document.descendants(candidate => { if (candidate.type.name.startsWith('html_inert_')) actual.push({tag: candidate.attrs.tag, body: candidate.textContent, attributes: candidate.attrs.attributes}); });
  const expected = [{tag:fixture.tag,body:fixture.body,attributes:fixture.attributes ?? {}}];
  const retained = JSON.stringify(actual) === JSON.stringify(expected);
  return {name:fixture.name, retained, expected, actual, issues:reopened.issues, sourceHTML};
});
for(const row of rows.slice(0,4)) assert.equal(row.retained,true,row.name);
for(const row of rows.slice(4,8)) assert.equal(row.retained,false,`Expected unresolved prototype boundary: ${row.name}`);
assert.equal(rows.at(-1).retained,true);
assert.ok(rows.at(-1).sourceHTML.includes('onclick="dangerous()"'));
assert.equal(typeof document,'undefined');
writeFileSync('artifacts/html-source-prototype-boundaries-20261102.json',JSON.stringify({status:'prototype only; not shippable',rows},null,2)+'\n');
console.log('Five basic reconstruction cases retained; four edited-source integrity failures reproduced. Output is unsanitized source, never executed.');
