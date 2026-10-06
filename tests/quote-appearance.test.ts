// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import * as Y from 'yjs';
import { CoreExtension, HTMLExporter, HTMLImporter, MarkdownExporter, Schema, Selection, StarterKit,
  closeHistory, composeExtensions, createEditor, insertText, joinBackward, redo, setNodeAttributes,
  splitBlock, toggleQuote, undo, undoCollaboration } from '../src';
import { exportDOCX, importDOCX } from '../src/docx';
import { ServerHTMLImporter } from '../src/html/server';
import { createYjsCollaborationExtension } from '../src/yjs';
import { withDOCXExportDefaults } from './fixtures/docx-page-defaults';

const schema = new Schema(StarterKit.schema);
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function nativeQuote() {
  return zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body><w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr><w:r><w:t>A source-owned quote border.</w:t></w:r></w:p></w:body></w:document>`),
    'word/styles.xml': strToU8(`<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="240"/><w:pBdr><w:left w:val="single" w:sz="16" w:space="4" w:color="123456"/></w:pBdr></w:pPr></w:style></w:styles>`),
    'word/_rels/document.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
  });
}
const explicitDocument = () => schema.node('doc', {}, [schema.node('blockquote', { appearance: 'explicit' }, [
  schema.node('paragraph', { emphasis: 'explicit', layout: { unit: 'pt', indentStart: 12,
    borders: { left: { style: 'solid', color: '#123456', width: 2, space: 4 } } } }, [schema.text('One quote border.')]),
])]);

describe('source-owned quote appearance', () => {
  it('neutralizes only an explicitly styled quote container and keeps ordinary quote defaults', () => {
    const source = explicitDocument();
    const root = document.createElement('div'); root.innerHTML = HTMLExporter.export(source, { document: false });
    const quote = root.querySelector('blockquote')!;
    expect(quote.dataset.fountainQuoteAppearance).toBe('explicit');
    expect(quote.style.borderLeftWidth).toBe('0px');
    expect(quote.style.margin).toBe('0px');
    expect(quote.style.padding).toBe('0px');
    expect(quote.querySelector('p')!.style.borderLeftWidth).toBe('2pt');
    expect(source.child(0).type.spec.toDOM!(source.child(0))).toEqual(['blockquote', {
      'data-fountain-quote-appearance': 'explicit', style: 'margin:0;padding:0;border:0;color:inherit',
    }, 0]);
    const ordinary = schema.node('blockquote', {}, [schema.node('paragraph', {}, [schema.text('Ordinary quote.')])]);
    expect(ordinary.toJSON().attrs).toBeUndefined();
    expect(ordinary.type.spec.toDOM!(ordinary)).toEqual(['blockquote', 0]);
    expect(HTMLExporter.export(ordinary, { document: false })).toBe('<blockquote><p>Ordinary quote.</p></blockquote>');
  });

  it('keeps the container mode through browser/server HTML and refuses invalid modes', () => {
    const source = explicitDocument(); const html = HTMLExporter.export(source, { document: false });
    expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(source.toJSON());
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(source.toJSON());
    expect(HTMLImporter.parse('<blockquote data-fountain-quote-appearance="bogus"><p>Literal</p></blockquote>', schema).child(0).attrs.appearance).toBeUndefined();
    expect(() => schema.node('blockquote', { appearance: 'bogus' })).toThrow(/appearance/);
    expect(() => schema.node('blockquote', { appearance: '<script>' })).toThrow(/appearance/);
  });

  it('imports an independently authored Word quote without adding a second host border', () => {
    const source = importDOCX(nativeQuote(), schema).document;
    expect(source.child(0).attrs.appearance).toBe('explicit');
    expect(source.child(0).child(0).attrs.layout).toMatchObject({ unit: 'pt', indentStart: 12,
      borders: { left: { style: 'solid', color: '#123456', width: 2, space: 4 } } });
    const root = document.createElement('div'); root.innerHTML = HTMLExporter.export(source, { document: false });
    expect(root.querySelector('blockquote')!.style.borderLeftWidth).toBe('0px');
    expect(root.querySelector<HTMLElement>('blockquote p')!.style.borderLeftWidth).toBe('2pt');
    const exported = exportDOCX(source);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']!);
    expect(xml).toContain('<w:pStyle w:val="FountainExplicitQuote"/>');
    expect(xml.match(/<w:left w:val="single"/g)).toHaveLength(1);
    expect(importDOCX(exported.bytes, schema).document.toJSON()).toEqual(withDOCXExportDefaults(source.toJSON()));
  });

  it('does not resurrect the built-in Word Quote border or indent when explicit source declares neither', () => {
    const source = schema.node('doc', {}, [schema.node('blockquote', { appearance: 'explicit' }, [
      schema.node('paragraph', { emphasis: 'explicit', layout: { unit: 'pt', fontFamily: 'Georgia', fontSize: 13 } },
        [schema.text('A borderless scientific quotation.')]),
    ])]);
    const exported = exportDOCX(source);
    const archive = unzipSync(exported.bytes); const xml = strFromU8(archive['word/document.xml']!);
    expect(xml).toContain('<w:pStyle w:val="FountainExplicitQuote"/>');
    expect(xml).not.toContain('<w:pBdr>'); expect(xml).not.toContain('<w:ind');
    const styles = new DOMParser().parseFromString(strFromU8(archive['word/styles.xml']!), 'application/xml');
    const neutral = [...styles.getElementsByTagNameNS(W, 'style')].find(style => style.getAttributeNS(W, 'styleId') === 'FountainExplicitQuote')!;
    expect(neutral).toBeDefined(); expect(neutral.getElementsByTagNameNS(W, 'pBdr')).toHaveLength(0);
    expect(importDOCX(exported.bytes, schema).document.toJSON()).toEqual(withDOCXExportDefaults(source.toJSON()));
  });

  it('reports the container styling boundary when exporting ordinary Markdown', () => {
    const result = MarkdownExporter.exportWithReport(explicitDocument());
    expect(result.losses).toContainEqual(expect.objectContaining({ kind: 'attribute', type: 'blockquote', path: [0],
      detail: expect.stringContaining('Explicit quote appearance') }));
    expect(result.markdown).toContain('> One quote border.');
  });

  it('warns when a host-owned quote schema cannot express the neutral container', () => {
    const host = new Schema({ ...StarterKit.schema, nodes: { ...StarterKit.schema.nodes,
      blockquote: { ...schema.nodes.blockquote.spec, attrs: {} },
    } });
    const imported = importDOCX(nativeQuote(), host);
    expect(imported.document.child(0).attrs.appearance).toBeUndefined();
    expect(imported.document.child(0).child(0).textContent).toBe('A source-owned quote border.');
    expect(imported.report.issues).toContainEqual(expect.objectContaining({ code: 'quote-appearance-not-imported', severity: 'warning' }));
  });

  it('retains the container and paragraph appearance through Enter, join and quote undo/redo', () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins,
      content: explicitDocument().toJSON() });
    try {
      const before = editor.getJSON();
      const originalParagraph = editor.state.doc.child(0).child(0);
      editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0, 0], 4)));
      expect(splitBlock(editor)).toBe(true);
      const quote = editor.state.doc.child(0);
      expect(quote.attrs.appearance).toBe('explicit');
      expect(quote.content.map(paragraph => paragraph.textContent)).toEqual(['One ', 'quote border.']);
      for (const paragraph of quote.content) expect(paragraph.attrs).toEqual(originalParagraph.attrs);
      const split = editor.getJSON();
      closeHistory(editor);
      expect(joinBackward(editor)).toBe(true);
      // Joining retains the two text leaves used by the mapped edit. Do not
      // demand unrelated text-leaf coalescing or normalize the actual tree.
      const joinedParagraph = { ...originalParagraph.toJSON(), content: [
        { type: 'text', text: 'One ' }, { type: 'text', text: 'quote border.' },
      ] };
      const joined = { ...before, content: before.content!.map((node, index) => index === 0
        ? { ...node, content: [joinedParagraph] } : node) };
      expect(editor.getJSON()).toEqual(joined);
      expect(undo(editor)).toBe(true);
      expect(editor.getJSON()).toEqual(split);
      expect(redo(editor)).toBe(true);
      expect(editor.getJSON()).toEqual(joined);
      closeHistory(editor);
      expect(toggleQuote(editor)).toBe(true);
      expect(editor.state.doc.child(0).type.name).toBe('paragraph');
      expect(editor.state.doc.child(0).toJSON()).toEqual(joinedParagraph);
      const unwrapped = editor.getJSON();
      expect(undo(editor)).toBe(true);
      expect(editor.getJSON()).toEqual(joined);
      expect(redo(editor)).toBe(true);
      expect(editor.getJSON()).toEqual(unwrapped);
    } finally { editor.destroy(); }
  });

  it('syncs the container mode and locally undoes it without losing a peer text edit or paragraph appearance', () => {
    const leftDoc = new Y.Doc(); const rightDoc = new Y.Doc();
    const initial = schema.node('doc', {}, [schema.node('blockquote', {}, explicitDocument().child(0).content)]).toJSON();
    const make = (document: Y.Doc, id: string) => {
      const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({
        document, user: { id, name: id, color: '#6547ff' },
      })]);
      return createEditor({ schema: kit.schema, plugins: kit.plugins, content: initial });
    };
    const left = make(leftDoc, 'left');
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc), 'initial-sync');
    const right = make(rightDoc, 'right');
    try {
      const paragraphAttrs = left.state.doc.child(0).child(0).attrs;
      expect(setNodeAttributes(left, [0], { appearance: 'explicit' })).toBe(true);
      Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc), 'left-peer');
      expect(right.getJSON()).toEqual(left.getJSON());
      expect(right.state.doc.child(0).attrs.appearance).toBe('explicit');
      right.dispatch(right.state.createTransaction().setSelection(Selection.cursor([0, 0, 0], 0)));
      expect(insertText(right, 'Remote ')).toBe(true);
      Y.applyUpdate(leftDoc, Y.encodeStateAsUpdate(rightDoc), 'right-peer');
      expect(undoCollaboration(left)).toBe(true);
      Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc), 'left-peer');
      expect(right.getJSON()).toEqual(left.getJSON());
      expect(left.state.doc.child(0).attrs.appearance).toBeUndefined();
      expect(left.state.doc.child(0).child(0).textContent).toBe('Remote One quote border.');
      expect(left.state.doc.child(0).child(0).attrs).toEqual(paragraphAttrs);
    } finally { left.destroy(); right.destroy(); leftDoc.destroy(); rightDoc.destroy(); }
  });
});
