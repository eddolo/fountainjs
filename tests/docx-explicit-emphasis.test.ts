// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { exportDOCX, importDOCX } from '../src/docx';
import { withDOCXExportDefaults } from './fixtures/docx-page-defaults';

const schema = new Schema(StarterKit.schema);
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const docx = (paragraph: string) => zipSync({ 'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body>${paragraph}</w:body></w:document>`) });
const reset = '<w:rPr><w:b w:val="0"/><w:i w:val="0"/></w:rPr>';

describe('native DOCX explicit emphasis', () => {
  it('exports absolute normal/bold/italic run declarations and reopens editable emphasis in pure Node', () => {
    expect(typeof document).toBe('undefined');
    const source = schema.node('doc', {}, [schema.node('heading', { level: 1, emphasis: 'explicit' }, [
      schema.text('Normal'), schema.text('Bold', [schema.mark('strong')]), schema.text('Italic', [schema.mark('em')]),
    ]), schema.node('blockquote', {}, [schema.node('paragraph', { emphasis: 'explicit' }, [schema.text('Upright')])])]);
    const exported = exportDOCX(source);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']);
    expect(xml).toContain(`${reset}<w:t>Normal</w:t>`);
    expect(xml).toContain('<w:i w:val="0"/><w:b/></w:rPr><w:t>Bold</w:t>');
    expect(xml).toContain('<w:b w:val="0"/><w:i/></w:rPr><w:t>Italic</w:t>');
    const reopened = importDOCX(exported.bytes, schema).document;
    // Quote's existing native style supplies explicit left justification;
    // Normal/Heading do not. Keep the full-tree appearance assertion below.
    expect(strFromU8(unzipSync(exported.bytes)['word/styles.xml']!)).toContain('<w:jc w:val="left"/>');
    expect(reopened.child(0).attrs).not.toHaveProperty('alignExplicit');
    expect(reopened.child(1).child(0).attrs.alignExplicit).toBe(true);
    expect(reopened.toJSON()).toEqual(withDOCXExportDefaults(source.toJSON()));
  });

  it('preserves an empty explicit paragraph and heading', () => {
    for (const type of ['heading', 'paragraph']) {
      const source = schema.node('doc', {}, [schema.node(type, { emphasis: 'explicit' })]);
      expect(importDOCX(exportDOCX(source).bytes, schema).document.child(0).attrs.emphasis).toBe('explicit');
    }
  });

  it('does not reinterpret a partial direct override as a complete resolved style', () => {
    const result = importDOCX(docx(`<w:p><w:pPr>${reset}</w:pPr><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>Partial</w:t></w:r></w:p>`), schema);
    expect(result.document.child(0).attrs.emphasis).toBeUndefined();
  });

  it('recognizes off/on spellings and does not activate an explicit off mark', () => {
    const result = importDOCX(docx(`<w:p><w:pPr>${reset}</w:pPr><w:r><w:rPr><w:b w:val="off"/><w:i w:val="on"/></w:rPr><w:t>Italic</w:t></w:r></w:p>`), schema);
    expect(result.document.child(0).attrs.emphasis).toBe('explicit');
    expect(result.document.child(0).child(0).marks.map(mark => mark.type.name)).toEqual(['em']);
  });

  it('does not trust a foreign paragraph-mark reset', () => {
    const foreign = reset.replaceAll('w:', 'x:').replace('<x:rPr>', '<x:rPr xmlns:x="urn:foreign">');
    const result = importDOCX(docx(`<w:p><w:pPr>${foreign}</w:pPr><w:r>${reset}<w:t>Text</w:t></w:r></w:p>`), schema);
    expect(result.document.child(0).attrs.emphasis).toBeUndefined();
  });
});
