// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createLabContext, detectLabFormat, exportLab, importLab, sameLabDocument, labImages, labSchema } from '../examples/react-app/src/conversion-lab';
import { createEditor, EditorState, Schema, StarterKit } from 'fountainjs-editor';
import { withDOCXExportDefaults } from './fixtures/docx-page-defaults';
const bytes = (text: string) => new TextEncoder().encode(text);
describe('public conversion lab adapters', () => {
  it('keeps each file’s HTML policy and schema through independent editing and reopening', () => {
    const settings = { preserveHTMLStructure: true };
    const context = createLabContext(settings);
    settings.preserveHTMLStructure = false;
    const source = '<section id="part"><p>Before <a id="chapter">Chapter</a><a name="empty"></a> after.</p><!--note--></section>';
    const original = importLab(bytes(source), 'html', context);
    expect(context.options.preserveHTMLStructure).toBe(true);
    expect(Object.isFrozen(context.options)).toBe(true);
    expect(original.issues).toEqual([]);
    expect(original.document.child(0).type.name).toBe('html_container');
    const mounted = new Schema(context.kit.schema).nodeFromJSON(original.document.toJSON());
    for (const format of ['html', 'json', 'markdown'] as const) {
      const output = exportLab(mounted, format, undefined, context);
      const reopened = importLab(output.bytes, format, context);
      expect(sameLabDocument(mounted, reopened.document)).toBe(true);
    }
    const standard = importLab(bytes(source), 'html');
    expect(standard.issues.some(issue => issue.code === 'unmapped-inline-element')).toBe(true);
    expect(() => exportLab(mounted, 'html')).toThrow();
    expect(context.policy).not.toBe(createLabContext().policy);
  });

  it('retains Markdown source while allowing explicit HTML structure conversion', () => {
    const context = createLabContext({ preserveHTMLStructure: true });
    const source = '<section id="part">\r\n\r\nBefore <a id="chapter">Chapter</a> **bold**.\r\n\r\n</section>\r\n';
    const original = importLab(bytes(source), 'markdown', context);
    expect(original.document.child(0).type.name).toBe('html_container');
    expect(new TextDecoder().decode(exportLab(original.document, 'markdown', original.source, context).bytes)).toBe(source);
    expect(importLab(bytes(source), 'markdown').document.textContent).toContain('<section');
  });

  it('preserves untouched Markdown after the live editor adds an automatic caret paragraph', () => {
    const context = createLabContext({ preserveHTMLStructure: true });
    const source = '<section id="part">\n<p>Untouched</p>\n<!--note-->\n</section>\n';
    const result = importLab(bytes(source), 'markdown', context);
    const editor = createEditor({ schema: context.kit.schema, state: EditorState.create({
      schema: context.schema, doc: result.document, plugins: context.kit.plugins,
    }) });
    try {
      expect(editor.state.doc.childCount).toBe(result.document.childCount + 1);
      expect(new TextDecoder().decode(exportLab(editor.state.doc, 'markdown', result.source, context).bytes)).toBe(source);
      const serialized = context.schema.nodeFromJSON(editor.getJSON());
      expect(new TextDecoder().decode(exportLab(serialized, 'markdown', result.source, context).bytes)).not.toBe(source);
    } finally { editor.destroy(); }
  });

  it('does not activate scripts or retain unhandled attributes when structure preservation is enabled', () => {
    const context = createLabContext({ preserveHTMLStructure: true });
    const source = '<p><a id="chapter" onclick="evil()">Readable</a></p><script>evil()</script>';
    const result = importLab(bytes(source), 'html', context);
    expect(result.issues.some(issue => issue.code === 'unmapped-inline-element')).toBe(true);
    const output = new TextDecoder().decode(exportLab(result.document, 'html', undefined, context).bytes);
    expect(output).not.toContain('onclick');
    expect(output).not.toContain('<script');
    expect(result.document.textContent).toContain('Readable');
  });
  it.each(['docx', 'html', 'json'] as const)('retains linked editable notes through %s in the lab schema', format => {
    const document = labSchema.node('doc', {}, [
      labSchema.node('paragraph', {}, [labSchema.text('Claim'), labSchema.node('footnote_reference', { id: '7' })]),
      labSchema.node('footnote_definition', { id: '7' }, [labSchema.node('paragraph', {}, [labSchema.text('Evidence')])]),
    ]);
    const reopened = importLab(exportLab(document, format).bytes, format).document;
    expect(reopened.toJSON()).toEqual(format === 'docx' ? withDOCXExportDefaults(document.toJSON()) : document.toJSON());
  });
  it('detects only supported extensions', () => {
    expect(detectLabFormat('Paper.DOCX')).toBe('docx');
    expect(detectLabFormat('draft.markdown')).toBe('markdown');
    expect(() => detectLabFormat('paper.pdf')).toThrow('Not supported');
  });
  it('retains original Markdown spelling when untouched', () => {
    const source = 'Title\r\n=====\r\n\r\nA __bold__ note.\r\n';
    const result = importLab(bytes(source), 'markdown');
    expect(new TextDecoder().decode(exportLab(result.document, 'markdown', result.source).bytes)).toBe(source);
    expect(result.issues[0].code).toBe('markdown-coverage');
  });
  it('compares and preserves source across independent editor schemas', () => {
    const source = 'Title\r\n=====\r\n\r\nA __bold__ note.\r\n';
    const result = importLab(bytes(source), 'markdown');
    const mounted = new Schema(StarterKit.schema).nodeFromJSON(result.document.toJSON());
    expect(mounted.eq(result.document)).toBe(false);
    expect(sameLabDocument(mounted, result.document)).toBe(true);
    expect(new TextDecoder().decode(exportLab(mounted, 'markdown', result.source).bytes)).toBe(source);
    expect(sameLabDocument(mounted, importLab(bytes('Changed'), 'markdown').document)).toBe(false);
  });
  it.each(['json', 'markdown', 'html', 'docx'] as const)('exports and reopens basic content through %s', format => {
    const original = importLab(bytes('# Report\n\nHello **Ada**.'), 'markdown').document;
    const output = exportLab(original, format);
    const reopened = importLab(output.bytes, format).document;
    expect(reopened.textContent).toContain('Hello Ada.');
    if (format === 'json') expect(reopened.eq(original)).toBe(true);
  });
  it('reports removed wrappers and does not run HTML', () => {
    const result = importLab(bytes('<article><p>Visible</p></article><script>alert(1)</script>'), 'html');
    expect(result.document.textContent).toContain('Visible');
    expect(result.issues.some(issue => issue.code === 'unmapped-block-wrapper')).toBe(true);
    expect(new TextDecoder().decode(exportLab(result.document, 'html').bytes)).not.toContain('<script>');
  });
  it('extracts packaged Word image bytes and distinguishes URL-only images', () => {
    const schema = new Schema(StarterKit.schema);
    const source = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const document = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.node('inline_image', { src: source, alt: 'Embedded proof' })])]);
    const reopened = importLab(exportLab(document, 'docx').bytes, 'docx');
    expect(labImages(reopened.document)).toEqual([{ source, alt: 'Embedded proof', embedded: true }]);
    expect(labImages(importLab(bytes('<p><img src="https://example.com/image.png" alt="Linked" /></p>'), 'html').document)[0].embedded).toBe(false);
  });
  it('rejects corrupt, wrong-root, deeply nested and oversized input', () => {
    expect(() => importLab(bytes('{bad'), 'json')).toThrow();
    expect(() => importLab(bytes('{"type":"paragraph"}'), 'json')).toThrow('complete Fountain document');
    expect(() => importLab(bytes('['.repeat(70) + '0' + ']'.repeat(70)), 'json')).toThrow('depth');
    expect(() => importLab(new Uint8Array(1024 * 1024 + 1), 'markdown')).toThrow('Lab limit');
    expect(() => importLab(bytes('not zip'), 'docx')).toThrow();
    expect(() => importLab(new Uint8Array([255]), 'markdown')).toThrow();
  });
});
