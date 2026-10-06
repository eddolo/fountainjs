// Exercise the shipped package, not the TypeScript test graph or a fake DOM.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { strToU8, zipSync } from 'fflate';

const require = createRequire(import.meta.url);
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const paragraph = (text, run = '') => `<w:p><w:r><w:rPr>${run}</w:rPr><w:t>${text}</w:t></w:r></w:p>`;
const styles = `<w:styles xmlns:w="${W}">
  <w:style w:type="table" w:styleId="TableNormal"><w:rPr><w:shadow/></w:rPr></w:style>
  <w:style w:type="table" w:styleId="Base"><w:basedOn w:val="TableNormal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:color w:val="334455"/><w:b/></w:rPr></w:style>
  <w:style w:type="table" w:styleId="Child"><w:basedOn w:val="Base"/><w:rPr><w:b/></w:rPr><w:tblStylePr w:type="firstRow"><w:rPr><w:sz w:val="24"/></w:rPr><w:pPr><w:jc w:val="center"/></w:pPr></w:tblStylePr></w:style>
</w:styles>`;
const rows = ['Header', 'Body'].map((text, row) => `<w:tr><w:tc>${paragraph(text, row ? '<w:b w:val="0"/>' : '')}</w:tc></w:tr>`).join('');
const input = zipSync({
  'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body><w:tbl><w:tblPr><w:tblStyle w:val="Child"/><w:tblLook w:firstRow="1" w:noHBand="1" w:noVBand="1"/></w:tblPr><w:tblGrid><w:gridCol w:w="4800"/></w:tblGrid>${rows}</w:tbl></w:body></w:document>`),
  'word/styles.xml': strToU8(styles),
  'word/_rels/document.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
});
assert.equal(typeof globalThis.document, 'undefined');
assert.equal(typeof globalThis.window, 'undefined');
const entries = [
  ['ESM', await import('../dist/index.js'), await import('../dist/docx.js')],
  ['CommonJS', require('../dist/index.cjs'), require('../dist/docx.cjs')],
];
for (const [name, engine, bridge] of entries) {
  const schema = new engine.Schema(engine.StarterKit.schema);
  const imported = bridge.importDOCX(input, schema);
  const table = imported.document.child(0);
  const header = table.child(0).child(0).child(0);
  const body = table.child(1).child(0).child(0);
  const marks = node => node.child(0).marks.map(mark => ({ type: mark.type.name, ...mark.attrs }));
  assert.equal(header.attrs.align, 'center');
  assert.equal(body.attrs.align, 'left');
  assert.ok(marks(header).some(mark => mark.type === 'strong'));
  assert.ok(!marks(body).some(mark => mark.type === 'strong'));
  assert.ok(marks(header).some(mark => mark.type === 'font_size' && mark.size === '12pt'));
  assert.ok(marks(body).some(mark => mark.type === 'font_size' && mark.size === '11pt'));
  assert.ok(marks(body).some(mark => mark.type === 'text_color' && mark.color === '#334455'));
  assert.ok(!imported.report.issues.some(issue => issue.code === 'unrepresented-style-toggle'));
  const reopened = bridge.importDOCX(bridge.exportDOCX(imported.document).bytes, schema).document.child(0);
  for (const index of [0, 1]) {
    const original = table.child(index).child(0).child(0);
    const restored = reopened.child(index).child(0).child(0);
    assert.deepEqual(marks(restored), marks(original));
    assert.deepEqual(restored.attrs, original.attrs);
    assert.equal(restored.textContent, original.textContent);
  }
  console.log(`${name}: DOM-free shipped DOCX table text, Word toggle resets, regional paragraph layout and native reopening passed.`);
}
