// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { detectLabFormat, exportLab, importLab, sameLabDocument, labImages } from '../examples/react-app/src/conversion-lab';
import { Schema, StarterKit } from 'fountainjs-editor';
const bytes = (text: string) => new TextEncoder().encode(text);
describe('public conversion lab adapters', () => {
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
