// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { importDOCX } from '../src/docx';

const schema = new Schema(StarterKit.schema);
const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const rels = 'http://schemas.openxmlformats.org/package/2006/relationships';
const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
const drawing = '<w:r><w:drawing><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="' + office + '" r:embed="img"/></w:drawing></w:r>';
function source(body = '<w:p/>', parts: Record<string, Uint8Array> = {}) {
  return zipSync({ 'word/document.xml': strToU8(`<w:document xmlns:w="${word}"><w:body>${body}</w:body></w:document>`), ...parts });
}

describe('DOCX intake inventory without a DOM', () => {
  it('counts only successfully created image nodes as imported assets', () => {
    const bytes = source(`<w:p>${drawing}</w:p>`, {
      'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="${rels}"><Relationship Id="img" Type="${office}/image" Target="media/body.png"/></Relationships>`),
      'word/media/body.png': png, 'word/media/header.png': png,
    });
    const result = importDOCX(bytes, schema);
    expect(result.packageParts.filter(part => part.handling === 'imported-image').map(part => part.path)).toEqual(['word/media/body.png']);
    expect(result.packageParts.filter(part => part.handling === 'unrepresented-media').map(part => part.path)).toEqual(['word/media/header.png']);
    const failed = importDOCX(bytes, schema, { createImageSource: () => { throw new Error('host refused'); } });
    expect(failed.packageParts.filter(part => part.handling === 'unrepresented-media')).toHaveLength(2);
    expect(failed.packageParts.some(part => part.handling === 'imported-image')).toBe(false);
  });

  it.each(['../assets/diagram%20one.png', '/assets/diagram%20one.png'])('imports the image in place from %s', target => {
    const bytes = source(`<w:p><w:r><w:t>Before</w:t></w:r>${drawing}<w:r><w:t>After</w:t></w:r></w:p>`, {
      'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="${rels}"><Relationship Id="img" Type="${office}/image" Target="${target}"/><Relationship Id="unused" Type="${office}/image" Target="../assets/unused.png"/></Relationships>`),
      'assets/diagram one.png': png, 'assets/unused.png': png, 'word/media/unused.png': png,
    });
    const result = importDOCX(bytes, schema, { maxMediaFiles: 2, maxMediaBytes: 2 * png.length });
    const paragraph = result.document.child(0);
    expect(paragraph.child(0).text).toBe('Before');
    expect(paragraph.child(1).type.name).toBe('inline_image');
    expect(paragraph.child(1).attrs.src).toBe(`data:image/png;base64,${Buffer.from(png).toString('base64')}`);
    expect(paragraph.child(2).text).toBe('After');
    expect(result.packageParts.find(part => part.path === 'assets/diagram one.png')?.handling).toBe('imported-image');
    expect(result.packageParts.find(part => part.path === 'assets/unused.png')?.handling).toBe('not-interpreted');
    expect(() => importDOCX(bytes, schema, { maxMediaFiles: 1 })).toThrow('selected media files');
    expect(() => importDOCX(bytes, schema, { maxMediaBytes: png.length })).toThrow('media exceeds');
    const selectedBytes = result.packageParts.filter(part => part.handling !== 'not-interpreted')
      .reduce((total, part) => total + part.declaredBytes, 0);
    expect(() => importDOCX(bytes, schema, { maxExpandedBytes: selectedBytes - 1 })).toThrow('selected expanded byte limit');
  });

  it.each([
    ['urn:not-opc', office, '../assets/diagram.png', ''],
    [rels, 'urn:not-office', '../assets/diagram.png', ''],
    [rels, office, '../../assets/diagram.png', ''],
    [rels, office, '../assets/diagram.png', 'External'],
  ])('does not read a custom image part through %s %s %s %s', (namespace, kind, target, mode) => {
    const result = importDOCX(source(`<w:p>${drawing}</w:p>`, {
      'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="${namespace}"><Relationship Id="img" Type="${kind}/image" Target="${target}"${mode ? ` TargetMode="${mode}"` : ''}/></Relationships>`),
      'assets/diagram.png': png,
    }), schema, { maxMediaBytes: 1 });
    expect(result.packageParts.find(part => part.path === 'assets/diagram.png')?.handling).toBe('not-interpreted');
    expect(result.report.issues.some(issue => issue.code === 'missing-image-part' || issue.code === 'external-image-omitted')).toBe(true);
  });
  it('lists skipped bytes without parsing or expanding them as document content', () => {
    const result = importDOCX(source('<w:p><w:r><w:t>Body</w:t></w:r></w:p>', {
      'word/header1.xml': strToU8('deliberately invalid XML: not interpreted'),
      'word/media/header.png': new Uint8Array([1, 2, 3]),
      'customXml/unknown.xml': strToU8('<never-execute/>'),
    }), schema);
    expect(result.document.textContent).toBe('Body');
    expect(result.packageParts).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'word/document.xml', handling: 'adapter-input' }),
      expect.objectContaining({ path: 'word/header1.xml', handling: 'not-interpreted' }),
      { path: 'word/media/header.png', declaredBytes: 3, handling: 'unrepresented-media' },
    ]));
    expect(result.report.fidelity).toBe('lossy');
    expect(result.report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unrepresented-story-part', sourcePart: 'word/header1.xml' }),
      expect.objectContaining({ code: 'unrepresented-media-part', sourcePart: 'word/media/header.png' }),
    ]));
    expect(Object.isFrozen(result.packageParts)).toBe(true);
    expect(result.packageParts.every(Object.isFrozen)).toBe(true);
  });

  it('finds nonstandard story names through relationships and does not fetch external stories', () => {
    const relationships = `<Relationships xmlns="${rels}"><Relationship Id="h" Type="${office}/header" Target="stories/title.xml"/><Relationship Id="f" Type="${office}/footer" TargetMode="External" Target="https://private.invalid/footer"/></Relationships>`;
    const result = importDOCX(source('', {
      'word/_rels/document.xml.rels': strToU8(relationships),
      'word/stories/title.xml': strToU8('<uninterpreted/>'),
    }), schema);
    expect(result.report.issues.filter(issue => issue.code.endsWith('-relationship'))).toHaveLength(2);
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'unrepresented-story-part', sourcePart: 'word/stories/title.xml' }));
    expect(JSON.stringify(result.report)).not.toContain('https://private.invalid');
  });

  it('locates note markers in paragraphs and nested table cells without inventing note content', () => {
    const result = importDOCX(source('<w:p><w:r><w:t>A</w:t><w:footnoteReference w:id="5"/></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:endnoteReference w:id="8"/><w:commentReference w:id="9"/></w:r></w:p></w:tc></w:tr></w:tbl>'), schema);
    const notes = result.report.issues.filter(issue => issue.code === 'unrepresented-note-reference');
    expect(notes).toHaveLength(3);
    expect(notes[0].path).toEqual([0]);
    expect(notes[1].path).toEqual([1, 0, 0, 0]);
    expect(notes.every(note => note.sourcePart === 'word/document.xml')).toBe(true);
    expect(result.document.textContent).toBe('A');
  });

  it('bounds all archive entries including skipped parts', () => {
    const bytes = source('', { 'unused/a.xml': strToU8('a'), 'unused/b.xml': strToU8('b') });
    expect(() => importDOCX(bytes, schema, { maxArchiveEntries: 2 })).toThrow('archive entries');
    expect(importDOCX(bytes, schema, { maxArchiveEntries: 3 }).packageParts).toHaveLength(3);
    expect(() => importDOCX(bytes, schema, { maxArchiveEntries: 0 })).toThrow('positive safe integer');
  });

  it('keeps selected expansion limits even when unused media has no document node', () => {
    expect(() => importDOCX(source('', { 'word/media/unused.png': new Uint8Array(32) }), schema, { maxMediaBytes: 16 })).toThrow('media exceeds');
  });

  it('does not treat matching names in foreign relationship namespaces as Word references', () => {
    const result = importDOCX(source('', { 'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="urn:not-opc"><Relationship Type="${office}/header" Target="x.xml"/></Relationships>`) }), schema);
    expect(result.report.issues).toEqual([]);
  });
});
