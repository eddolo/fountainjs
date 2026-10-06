// The shipped engine must retain source-owned quote styling without a browser.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';

// Real consumers use one module format. Loading both Yjs builds into a single
// process manufactures a duplicate-constructor warning; verify each in isolation.
const format = process.argv.find(argument => argument.startsWith('--format='))?.slice('--format='.length);
if (!format) {
  for (const value of ['esm', 'cjs']) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--format=${value}`], { stdio: 'inherit' });
    assert.equal(result.status, 0, `${value} compiled quote consumer failed: ${result.error?.message ?? result.signal ?? 'nonzero exit'}`);
  }
  process.exit(0);
}
assert.ok(['esm', 'cjs'].includes(format), 'Expected --format=esm or --format=cjs.');
const require = createRequire(import.meta.url);
const entries = format === 'esm' ? [
  ['ESM', await import('../dist/index.js'), await import('../dist/docx.js'),
    await import('../dist/core.js'), await import('../dist/yjs.js'), await import('yjs')],
] : [
  ['CommonJS', require('../dist/index.cjs'), require('../dist/docx.cjs'),
    require('../dist/core.cjs'), require('../dist/yjs.cjs'), require('yjs')],
];
const layout = { unit: 'pt', fontFamily: 'Arial', fontSize: 11, spacingBefore: 0, spacingAfter: 8,
  lineHeight: 1.15, lineHeightUnit: 'multiple', lineHeightRule: 'auto',
  keepWithNext: false, keepLinesTogether: false, pageBreakBefore: false };
const pageSettings = { unit: 'pt', width: 595.3, height: 841.9, marginTop: 72, marginRight: 72,
  marginBottom: 72, marginLeft: 72, headerDistance: 36, footerDistance: 36, gutter: 0 };

const assertNoDOM = () => {
  for (const name of ['document', 'window', 'DOMParser', 'Range', 'Selection', 'MutationObserver']) {
    assert.equal(typeof globalThis[name], 'undefined', `Compiled consumer unexpectedly acquired ${name}.`);
  }
};
assertNoDOM();
for (const [name, engine, bridge, core, collaboration, Y] of entries) {
  const schema = new engine.Schema(engine.StarterKit.schema);
  const marks = [schema.mark('font_family', { family: 'Arial' }), schema.mark('font_size', { size: '11pt' })];
  for (const border of [false, true]) {
    const source = schema.node('doc', { pageSettings }, [schema.node('blockquote', { appearance: 'explicit' }, [
      schema.node('paragraph', { emphasis: 'explicit', layout: { ...layout, ...(border ? {
        indentStart: 12, borders: { left: { style: 'solid', color: '#123456', width: 2, space: 4 } },
      } : {}) } }, [schema.text('Portable quote styling.', marks)]),
    ])]);
    const before = source.toJSON();
    const exported = bridge.exportDOCX(source);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']);
    assert.ok(xml.includes('<w:pStyle w:val="FountainExplicitQuote"/>'));
    assert.equal((xml.match(/<w:pBdr>/g) ?? []).length, border ? 1 : 0);
    if (!border) assert.ok(!xml.includes('<w:ind'));
    assert.deepEqual(bridge.importDOCX(exported.bytes, schema).document.toJSON(), before);
    assert.deepEqual(source.toJSON(), before);
    const html = engine.HTMLExporter.export(source, { document: false });
    assert.ok(html.includes('<blockquote data-fountain-quote-appearance="explicit" style="margin:0;padding:0;border:0;color:inherit">'));

    // Use the shipped /core entry for the edit loop, with an explicitly supplied
    // built-in schema. No view/preset plugins or DOM shim are constructed.
    const editor = core.createEditor({ schema: engine.StarterKit.schema,
      plugins: [core.createHistoryPlugin()], content: before });
    try {
      editor.dispatch(editor.state.createTransaction().setSelection(core.Selection.cursor([0, 0, 0], 9)));
      assert.equal(core.splitBlock(editor), true);
      assert.equal(editor.state.doc.child(0).attrs.appearance, 'explicit');
      assert.deepEqual(editor.state.doc.child(0).content.map(node => node.attrs),
        [source.child(0).child(0).attrs, source.child(0).child(0).attrs]);
      assert.equal(core.undo(editor), true);
      assert.deepEqual(editor.getJSON(), before);
      assert.equal(core.redo(editor), true);
      assert.deepEqual(editor.state.doc.child(0).content.map(node => node.textContent),
        ['Portable ', 'quote styling.']);
    } finally { editor.destroy(); }

    const initial = schema.node('doc', { pageSettings }, [schema.node('blockquote', {}, source.child(0).content)]).toJSON();
    const leftDoc = new Y.Doc(); const rightDoc = new Y.Doc();
    const make = (document, id) => {
      const kit = core.composeExtensions([core.defineExtension({ name: 'compiled-quote-fixture',
        nodes: engine.StarterKit.schema.nodes, marks: engine.StarterKit.schema.marks }),
      collaboration.createYjsCollaborationExtension({ document, user: { id, name: id, color: '#6547ff' } })]);
      return core.createEditor({ schema: kit.schema, plugins: kit.plugins, content: initial });
    };
    const left = make(leftDoc, 'left');
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc), 'initial-sync');
    const right = make(rightDoc, 'right');
    try {
      assert.equal(core.setNodeAttributes(left, [0], { appearance: 'explicit' }), true);
      Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc), 'left-peer');
      assert.deepEqual(right.getJSON(), left.getJSON());
      assert.equal(right.state.doc.child(0).attrs.appearance, 'explicit');
      right.dispatch(right.state.createTransaction().setSelection(core.Selection.cursor([0, 0, 0], 0)));
      assert.equal(core.insertText(right, 'Peer '), true);
      Y.applyUpdate(leftDoc, Y.encodeStateAsUpdate(rightDoc), 'right-peer');
      assert.equal(core.undoCollaboration(left), true);
      Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc), 'left-peer');
      const expected = { ...initial, content: initial.content.map(quote => ({ ...quote,
        content: quote.content.map(paragraph => ({ ...paragraph,
          content: paragraph.content.map(text => ({ ...text, text: `Peer ${text.text}` })) })),
      })) };
      assert.deepEqual(left.getJSON(), expected);
      assert.deepEqual(right.getJSON(), expected);
    } finally { left.destroy(); right.destroy(); leftDoc.destroy(); rightDoc.destroy(); }
  }
  console.log(`${name}: complete bordered/borderless quote JSON, native Word styles, neutral HTML, core editing/history and Yjs local undo retain source-owned appearance without DOM.`);
}
assertNoDOM();
