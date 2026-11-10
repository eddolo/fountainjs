// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { unzipSync, zipSync } from 'fflate';
import { createLabContext, detectLabFormat, exportLab, importLab, labReportIssues, sameLabDocument, labImages, labSchema } from '../examples/react-app/src/conversion-lab';
import { recoverLabDOCXImage } from '../examples/react-app/src/conversion-lab-docx-media';
import { createEditor, EditorState, Schema, StarterKit } from 'fountainjs-editor';
import { withDOCXExportDefaults } from './fixtures/docx-page-defaults';
const bytes = (text: string) => new TextEncoder().encode(text);
describe('public conversion lab adapters', () => {
  it.each(['', '\uFEFF'])('preserves the original Markdown UTF-8 encoding marker (%j)', marker => {
    const source = bytes(marker + '# Heading\r\n\r\nA\uFEFFB\r\n');
    const imported = importLab(source, 'markdown');
    const options = { markdownBOM: imported.markdownBOM };
    expect(imported.document.child(0).type.name).toBe('heading');
    expect(imported.document.child(0).textContent).toBe('Heading');
    expect(imported.document.child(1).textContent).toBe('A\uFEFFB');
    expect(exportLab(imported.document, 'markdown', imported.source, undefined, options).bytes).toEqual(source);
    expect(exportLab(imported.document, 'json', imported.source, undefined, options).bytes[0]).toBe(0x7b);
  });
  it('recovers only the selected inventoried raster and retains the original bytes', () => {
    const raster = new Uint8Array(readFileSync(new URL('./fixtures/cross-container-figure.png', import.meta.url)));
    const source = exportLab(importLab(bytes('Original body'), 'markdown').document, 'docx');
    const archive = zipSync({ ...unzipSync(source.bytes), 'word/media/missing.png': raster, 'assets/another.png': raster,
      'word/media/disguised.png': bytes('<svg xmlns="http://www.w3.org/2000/svg"/>') });
    const document = importLab(archive, 'docx');
    expect(labImages(document.document)).toEqual([]);
    const missing = document.packageParts!.find(part => part.path.endsWith('/missing.png'))!;
    const disguised = document.packageParts!.find(part => part.path.endsWith('/disguised.png'))!;
    expect(recoverLabDOCXImage(archive, missing)).toEqual({ bytes: raster, type: 'image/png', fileName: 'missing.png' });
    expect(recoverLabDOCXImage(archive, { ...missing, path: 'assets/another.png' })).toEqual({ bytes: raster, type: 'image/png', fileName: 'another.png' });
    expect(() => recoverLabDOCXImage(archive, { ...missing, path: '../assets/another.png' })).toThrow('unrepresented media');
    expect(() => recoverLabDOCXImage(archive, disguised)).toThrow('not a supported PNG');
    expect(() => recoverLabDOCXImage(archive, { ...missing, declaredBytes: missing.declaredBytes + 1 })).toThrow('inventory');
  });
  it('identifies actual Markdown formatting losses and their document locations', () => {
    const original = importLab(bytes('<pre>before <em>styled</em> <span style="color:#cc0000">red</span></pre>'), 'html');
    const output = exportLab(original.document, 'markdown');
    expect(output.issues).toContainEqual(expect.objectContaining({ code: 'mark', type: 'em', path: [0, 1] }));
    expect(output.issues).toContainEqual(expect.objectContaining({ code: 'mark', type: 'text_color', path: [0, 3] }));
    expect(importLab(output.bytes, 'markdown').document.textContent).toBe(original.document.textContent);
    expect(original.document.child(0).child(1).marks.some(mark => mark.type.name === 'em')).toBe(true);
  });

  it('requires explicit opt-in for source package paths in both report sections', () => {
    const issues = Object.freeze([Object.freeze({ code: 'part-loss', message: 'Review this warning.',
      path: Object.freeze([2, 1]), sourcePart: 'word/private-project.xml' })]);
    const redacted = labReportIssues(issues, false);
    expect(redacted[0].path).toEqual([2, 1]);
    expect(JSON.stringify({ importIssues: redacted, roundTrip: { issues: redacted } })).not.toContain('private-project');
    expect(labReportIssues(issues, true)[0].sourcePart).toBe('word/private-project.xml');
    expect(issues[0].sourcePart).toBe('word/private-project.xml');
  });

  it('keeps the location of an actual unavailable Word image export', () => {
    const original = importLab(bytes('<p><img src="https://example.com/unfetched.png" alt="Remote figure"></p>'), 'html');
    const output = exportLab(original.document, 'docx');
    expect(output.issues).toContainEqual(expect.objectContaining({ code: 'image-source-unavailable', path: [0, 0] }));
    expect(importLab(output.bytes, 'docx').document.textContent).toContain('Remote figure');
  });

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

  it('imports CommonMark source for editing and exports an offline HTML reader', () => {
    const context = createLabContext({ commonMarkSourceReview: true });
    const declaration = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">';
    const source = [
      declaration, '', '# Review', '', '<script>window.sourceRan = true</script>', '',
      '<javascript:alert(1)> https://example.test', '', 'Draft body.', '', '<div title="unfinished',
    ].join('\r\n');
    const result = importLab(bytes(source), 'markdown', context);
    const types: string[] = [];
    result.document.descendants(node => { types.push(node.type.name); });
    expect(context.options).toMatchObject({ commonMarkText: true, preserveHTMLStructure: true, retainBlockedAutolinks: true });
    expect(result.document.attrs.htmlSourceEnvelope).toMatchObject({ doctype: declaration, mode: 'quirks' });
    expect(types).toEqual(expect.arrayContaining(['html_inert_raw_text', 'html_inert_anchor', 'html_source_eof']));
    expect(importLab(bytes(source), 'markdown').document.textContent).toContain('<script>');
    expect(new TextDecoder().decode(exportLab(result.document, 'markdown', result.source, context).bytes)).toBe(source);
    const html = exportLab(result.document, 'html', result.source, context, { omitMarkdownCaretHosts: true });
    const reader = new TextDecoder().decode(html.bytes);
    expect(reader).toContain('Content-Security-Policy');
    expect(reader).toContain("default-src 'none'");
    expect(reader).not.toContain('<script>');
    expect(reader).not.toContain('href="javascript:');
    const reopened = importLab(html.bytes, 'html', context);
    expect(reopened.document.attrs.htmlSourceEnvelope).toEqual(result.document.attrs.htmlSourceEnvelope);
    expect(reopened.document.textContent).toContain('window.sourceRan = true');
    expect(reopened.document.textContent).toContain('<div title="unfinished');

    const editor = createEditor({ schema: context.kit.schema, state: EditorState.create({
      schema: context.schema, doc: result.document, plugins: context.kit.plugins,
    }) });
    try {
      const index = result.document.content.findIndex(node => node.textContent === 'Draft body.');
      editor.dispatch(editor.state.createTransaction().insertText([index, 0], 'Draft body.'.length, ' Reviewed.'));
      const edited = exportLab(editor.state.doc, 'markdown', result.source, context);
      expect(new TextDecoder().decode(edited.bytes)).toBe(source.replace('Draft body.', 'Draft body. Reviewed.'));
      expect(edited.issues).toEqual([]);
      expect(importLab(edited.bytes, 'markdown', context).document.toJSON()).toEqual(editor.getJSON());
      const authoredTail = editor.state.doc.copy([...editor.state.doc.content,
        context.schema.node('paragraph', {}, [context.schema.text('')]),
      ]);
      expect(exportLab(authoredTail, 'markdown', result.source, context).issues).toContainEqual(
        expect.objectContaining({ code: 'markdown-source-rewritten' }),
      );
    } finally { editor.destroy(); }
  });

  it.each(['\n', '\r\n'])('preserves the complete mixed source when the author appends a paragraph (%j)', ending => {
    const context = createLabContext({ commonMarkSourceReview: true });
    const original = [
      '<!DOCTYPE HTML>', '', '<script>const historical = 1;</script>', '', 'Original _emphasis_.', '',
    ].join(ending);
    const imported = importLab(bytes(original), 'markdown', context);
    const appended = context.schema.node('paragraph', {}, [context.schema.text('New paragraph.')]);
    const edited = imported.document.copy([...imported.document.content, appended]);
    const output = exportLab(edited, 'markdown', imported.source, context);
    expect(new TextDecoder().decode(output.bytes)).toBe(original + ending + 'New paragraph.');
    expect(output.issues).toEqual([]);
    expect(importLab(output.bytes, 'markdown', context).document.toJSON()).toEqual(edited.toJSON());

    const index = imported.document.childCount - 1;
    const replacement = context.schema.node('paragraph', {}, [context.schema.text('Revised paragraph.')]);
    const revised = imported.document.copy([...imported.document.content.slice(0, index), replacement, appended]);
    const saved = exportLab(revised, 'markdown', imported.source, context);
    const expected = original.replace('Original _emphasis_.', 'Revised paragraph.') + ending + 'New paragraph.';
    expect(new TextDecoder().decode(saved.bytes)).toBe(expected);
    expect(saved.issues).toEqual([]);
    expect(importLab(saved.bytes, 'markdown', context).document.toJSON()).toEqual(revised.toJSON());
  });

  it('omits the generated typing paragraph when a list is appended to mixed source', () => {
    const context = createLabContext({ commonMarkSourceReview: true });
    const original = '<!DOCTYPE HTML>\n\nOriginal _emphasis_.\n\n';
    const imported = importLab(bytes(original), 'markdown', context);
    const list = importLab(bytes('- New item'), 'markdown', context).document.child(0);
    const edited = imported.document.copy([...imported.document.content, list]);
    const editor = createEditor({ schema: context.kit.schema, state: EditorState.create({
      schema: context.schema, doc: edited, plugins: context.kit.plugins,
    }) });
    try {
      expect(editor.state.doc.childCount).toBe(edited.childCount + 1);
      const output = exportLab(editor.state.doc, 'markdown', imported.source, context);
      expect(new TextDecoder().decode(output.bytes)).toBe(original + '- New item');
      expect(output.issues).toEqual([]);
      expect(importLab(output.bytes, 'markdown', context).document.toJSON()).toEqual(edited.toJSON());
    } finally { editor.destroy(); }
  });

  it('reports source rewriting if an unfinished HTML token would swallow appended content', () => {
    const context = createLabContext({ commonMarkSourceReview: true });
    const original = '<!DOCTYPE HTML>\n\n<div title="unfinished';
    const imported = importLab(bytes(original), 'markdown', context);
    const appended = context.schema.node('paragraph', {}, [context.schema.text('Keep the new text.')]);
    const edited = imported.document.copy([...imported.document.content, appended]);
    const output = exportLab(edited, 'markdown', imported.source, context);
    expect(new TextDecoder().decode(output.bytes)).not.toBe(original + '\n\nKeep the new text.');
    expect(output.issues).toContainEqual(expect.objectContaining({ code: 'markdown-source-rewritten' }));
    expect(importLab(output.bytes, 'markdown', context).document.textContent).toContain('Keep the new text.');
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

  it('rewrites the editable span while keeping identical text inside raw HTML and the live caret out of source', () => {
    const context = createLabContext({ commonMarkSourceReview: true });
    const source = '<script>Same text.</script>\n\nSame text.\n\n***\n';
    const result = importLab(bytes(source), 'markdown', context);
    const editor = createEditor({ schema: context.kit.schema, state: EditorState.create({
      schema: context.schema, doc: result.document, plugins: context.kit.plugins,
    }) });
    try {
      expect(editor.state.doc.childCount).toBe(result.document.childCount + 1);
      editor.dispatch(editor.state.createTransaction().insertText([1, 0], 'Same text.'.length, ' Edited.'));
      const output = exportLab(editor.state.doc, 'markdown', result.source, context);
      expect(new TextDecoder().decode(output.bytes)).toBe('<script>Same text.</script>\n\nSame text. Edited.\n\n***\n');
      expect(output.issues).toEqual([]);
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
