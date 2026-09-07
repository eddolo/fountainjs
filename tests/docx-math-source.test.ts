import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync, Zip, ZipPassThrough } from 'fflate';
import { Schema, StarterKit, composeExtensions, createMathExtension } from '../src';
import { exportDOCX, importDOCX } from '../src/docx';

const schema = new Schema(composeExtensions([...StarterKit.extensions, createMathExtension()]).schema);
const source = String.raw`\frac{x}{y}` + '\r\n\u200b';
const p = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
const math = (latex = source) => schema.node('math_block', { latex, ariaLabel: 'Original equation' });
const doc = schema.node('doc', {}, [
  schema.node('paragraph', {}, [schema.text('Before '), schema.node('inline_math', { latex: 'x', ariaLabel: 'Inline x' }), schema.text(' after')]),
  math(),
]);
const exportFile = (document = doc) => exportDOCX(document, { resolveMath: node => node.type.name === 'inline_math'
  ? { type: 'text', value: 'x' }
  : { type: 'fraction', numerator: { type: 'text', value: 'x' }, denominator: { type: 'text', value: 'y' } },
}).bytes;
const change = (bytes: Uint8Array, edit: (parts: Record<string, Uint8Array>) => void) => {
  const parts = unzipSync(bytes); edit(parts); return zipSync(parts);
};
const editXML = (bytes: Uint8Array, edit: (xml: string) => string) => change(bytes, parts => {
  parts['word/document.xml'] = strToU8(edit(strFromU8(parts['word/document.xml'])));
});
const read = (bytes: Uint8Array, activeSchema = schema) => importDOCX(bytes, activeSchema, { restoreMathSource: true });
const allMath = (document: ReturnType<typeof read>['document']) => {
  const result: { type: string; latex: unknown; ariaLabel: unknown }[] = [];
  document.descendants(node => { if (['inline_math', 'math_block'].includes(node.type.name)) result.push({ type: node.type.name, latex: node.attrs.latex, ariaLabel: node.attrs.ariaLabel }); });
  return result;
};

describe('opt-in bound DOCX math-source restoration', () => {
  it('restores exact TeX, Unicode/line endings and accessibility labels without browser globals', () => {
    expect(typeof document).toBe('undefined');
    const bytes = exportFile();
    const reopened = read(bytes);
    expect(allMath(reopened.document)).toEqual(allMath(doc));
    expect(reopened.document.toJSON()).toEqual(doc.toJSON());
    expect(reopened.report.fidelity).toBe('lossy');
    expect(reopened.report.issues.map(issue => issue.code)).toEqual(['math-source-restored-experimental', 'math-source-restored-experimental']);
    expect(allMath(importDOCX(bytes, schema).document)).toEqual([]);
  });

  it('does not restore stale source after an actual equation edit', () => {
    const bytes = editXML(exportFile(), xml => xml.replace('>y</m:t>', '>z</m:t>'));
    const reopened = read(bytes);
    expect(allMath(reopened.document)).toHaveLength(1);
    expect(reopened.document.textContent).toContain('[Word equation: import not yet supported]');
    expect(reopened.report.issues).toContainEqual(expect.objectContaining({ code: 'math-source-not-restored', message: expect.stringContaining('OMML changed') }));
  });

  it('retains binding across paragraph insertion and harmless XML prefix changes', () => {
    const bytes = editXML(exportFile(), xml => xml.replace('<w:body>', '<w:body><w:p><w:r><w:t>New introduction</w:t></w:r></w:p>')
      .replaceAll('xmlns:m=', 'xmlns:eq=').replaceAll('<m:', '<eq:').replaceAll('</m:', '</eq:').replaceAll(' m:', ' eq:')
      .replaceAll('><eq:', '>\n  <eq:'));
    const reopened = read(bytes);
    expect(allMath(reopened.document)).toEqual(allMath(doc));
    expect(reopened.document.child(0).textContent).toBe('New introduction');
  });

  it('uses identity rather than equal rendered math or stale model paths after reordering', () => {
    const original = schema.node('doc', {}, [math(String.raw`{x \over y}`), math(String.raw`\frac{x}{y}`)]);
    const bytes = editXML(exportFile(original), xml => {
      const paragraphs = [...xml.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)].map(match => match[0]);
      expect(paragraphs).toHaveLength(2);
      return xml.replace(paragraphs.join(''), paragraphs.reverse().join(''));
    });
    expect(allMath(read(bytes).document)).toEqual(allMath(original).reverse());
  });

  it('refuses property edits even when flattened equation text is unchanged', () => {
    const reopened = read(editXML(exportFile(), xml => xml.replace('m:val="center"', 'm:val="left"')));
    expect(allMath(reopened.document).map(node => node.type)).toEqual(['inline_math']);
    expect(reopened.report.issues.some(issue => issue.message.includes('OMML changed'))).toBe(true);
  });

  it.each([
    (xml: string) => xml.replace('<w:bookmarkStart w:id="2" w:name="FountainMath_2"/>', ''),
    (xml: string) => xml.replace('<w:bookmarkEnd w:id="2"/>', '<w:bookmarkEnd w:id="1"/>'),
    (xml: string) => xml.replace('<w:bookmarkStart w:id="2"', '<w:bookmarkStart w:id="1"'),
    (xml: string) => xml.replace('w:name="FountainMath_2"', 'w:name="FountainMath_1"'),
    (xml: string) => xml.replace('<w:bookmarkEnd w:id="2"/>', '<w:r><w:t>Extra</w:t></w:r><w:bookmarkEnd w:id="2"/>'),
    (xml: string) => xml.replaceAll('http://schemas.openxmlformats.org/officeDocument/2006/math', 'urn:fake-math'),
  ])('refuses missing, ambiguous, enlarged or namespace-spoofed bindings', edit => {
    const reopened = read(editXML(exportFile(), edit));
    expect(allMath(reopened.document).some(node => node.type === 'math_block')).toBe(false);
    expect(reopened.report.issues.some(issue => issue.code === 'math-source-not-restored')).toBe(true);
  });

  it('keeps displayed equations and prose in order when Word combines them into a paragraph', () => {
    const bytes = editXML(exportFile(schema.node('doc', {}, [math()])), xml => xml.replace('<w:p>', '<w:p><w:r><w:t>Before</w:t></w:r>')
      .replace('</w:p>', '<w:r><w:t>After</w:t></w:r></w:p>'));
    const reopened = read(bytes);
    expect(reopened.document.content.map(node => node.type.name)).toEqual(['paragraph', 'math_block', 'paragraph']);
    expect(reopened.document.child(0).textContent).toBe('Before');
    expect(reopened.document.child(1).attrs.latex).toBe(source);
    expect(reopened.document.child(2).textContent).toBe('After');
  });

  it('restores equations within quotes and table cells', () => {
    const nested = schema.node('doc', {}, [schema.node('blockquote', {}, [p('Quote'), math()]),
      schema.node('table', {}, [schema.node('table_row', {}, [schema.node('table_cell', {}, [p('Cell'), math()])])]),
    ]);
    expect(allMath(read(exportFile(nested)).document)).toEqual(allMath(nested));
  });

  it('warns when the schema cannot accept math, without silently flattening its meaning', () => {
    const reopened = read(exportFile(), new Schema(StarterKit.schema));
    expect(allMath(reopened.document)).toEqual([]);
    expect(reopened.report.issues.some(issue => issue.code === 'math-source-not-restored')).toBe(true);
  });

  it('keeps inline math when a Word paragraph uses a text-only code style', () => {
    const reopened = read(editXML(exportFile(), xml => xml.replace('<w:p>', '<w:p><w:pPr><w:pStyle w:val="Code"/></w:pPr>')));
    expect(allMath(reopened.document)).toEqual(allMath(doc));
    expect(reopened.document.child(0).type.name).toBe('paragraph');
    expect(reopened.report.issues.some(issue => issue.code === 'code-style-not-applied')).toBe(true);
  });

  it('does not authenticate a package author or prove that its TeX matches the projection', () => {
    const claimed = change(exportFile(), parts => {
      parts['customXml/fountainMath.xml'] = strToU8(strFromU8(parts['customXml/fountainMath.xml'])
        .replace('&quot;source&quot;:&quot;x&quot;', '&quot;source&quot;:&quot;claimed source&quot;'));
    });
    const reopened = read(claimed);
    expect(allMath(reopened.document)[0].latex).toBe('claimed source');
    expect(reopened.report.issues.some(issue => issue.code === 'math-source-restored-experimental' && issue.message.includes('untrusted'))).toBe(true);
    expect(allMath(importDOCX(claimed, schema).document)).toEqual([]);
  });

  it('rejects duplicate selected ZIP entries rather than trusting the last copy', () => {
    const parts = unzipSync(exportFile());
    const chunks: Uint8Array[] = [];
    const zip = new Zip((error, chunk) => { if (error) throw error; chunks.push(chunk); });
    const add = (name: string, bytes: Uint8Array) => {
      const entry = new ZipPassThrough(name); zip.add(entry); entry.push(bytes, true);
    };
    for (const [name, bytes] of Object.entries(parts)) add(name, bytes);
    add('customXml/fountainMath.xml', parts['customXml/fountainMath.xml']);
    zip.end();
    const bytes = Buffer.concat(chunks);
    expect(() => read(bytes)).toThrow(/duplicate selected ZIP parts/);
    expect(() => importDOCX(bytes, schema)).not.toThrow();
  });

  it('rejects duplicate expanded bookmark attributes even with different prefixes', () => {
    const bytes = editXML(exportFile(), xml => xml.replace('w:name="FountainMath_2"',
      'w:name="FountainMath_2" q:name="FountainMath_2" xmlns:q="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'));
    const reopened = read(bytes);
    expect(allMath(reopened.document)).toEqual([]);
    expect(reopened.report.issues.some(issue => issue.code === 'invalid-math-source-metadata')).toBe(true);
  });

  it('does not use an injected document element as a missing package relationship', () => {
    const bytes = change(exportFile(), parts => {
      delete parts['word/_rels/document.xml.rels'];
      parts['word/document.xml'] = strToU8(strFromU8(parts['word/document.xml']).replace('<w:body>',
        '<w:body><Relationship xmlns="http://schemas.openxmlformats.org/package/2006/relationships" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/fountainMath.xml"/>'));
    });
    const reopened = read(bytes);
    expect(allMath(reopened.document)).toEqual([]);
    expect(reopened.report.issues.some(issue => issue.code === 'invalid-math-source-metadata')).toBe(true);
  });

  it.each(['metadata', 'relationship', 'version', 'oversize', 'duplicate'])('rejects invalid metadata or linkage: %s', kind => {
    const bytes = change(exportFile(), parts => {
      if (kind === 'relationship') parts['word/_rels/document.xml.rels'] = strToU8(strFromU8(parts['word/_rels/document.xml.rels']).replace('Target="../customXml/fountainMath.xml"', 'Target="https://example.org/math.xml" TargetMode="External"'));
      else if (kind === 'metadata') parts['customXml/fountainMath.xml'] = strToU8('<broken>');
      else if (kind === 'version') parts['customXml/fountainMath.xml'] = strToU8(strFromU8(parts['customXml/fountainMath.xml']).replace('math:v2', 'math:v1'));
      else if (kind === 'oversize') parts['customXml/fountainMath.xml'] = strToU8(' '.repeat(8_000_001));
      else parts['customXml/fountainMath.xml'] = strToU8(strFromU8(parts['customXml/fountainMath.xml']).replace('FountainMath_2', 'FountainMath_1'));
    });
    if (kind === 'oversize') expect(() => read(bytes)).toThrow(/expanded byte limit/);
    else {
      const reopened = read(bytes);
      expect(allMath(reopened.document)).toEqual([]);
      expect(reopened.report.issues.some(issue => issue.code === 'invalid-math-source-metadata')).toBe(true);
    }
    // Opt-out never extracts/parses private source metadata.
    expect(() => importDOCX(bytes, schema)).not.toThrow();
  });
});
