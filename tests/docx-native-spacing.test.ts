// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { isParagraphLayout, paragraphSpacingAt, Schema, type Node, type ParagraphLayout } from '../src/core';
import { StarterKit, composeExtensions } from '../src/extensions';
import { PagesExtension } from '../src/pages';
import { exportDOCX, importDOCX } from '../src/docx';
import { parseDOCXXML } from '../src/docx/xml-parser';
import { PARAGRAPH_BRIDGE_PART, PARAGRAPH_BRIDGE_NS } from '../src/docx/paragraph-bridge';

const schema = new Schema(StarterKit.schema);
const layout: ParagraphLayout = { unit: 'pt', spacingGroup: 'Author group 🧪', spacingBefore: 0, spacingAfter: 10,
  contextualSpacing: true, fontFamily: 'Arial', fontSize: 11, lineHeight: 14, lineHeightUnit: 'pt', lineHeightRule: 'exact' };
const p = (text: string, value = layout) => schema.node('paragraph', { layout: value }, [schema.text(text)]);
const doc = (...content: Node[]) => schema.node('doc', {}, content);
const native = (bytes: Uint8Array, part = 'word/document.xml') => strFromU8(unzipSync(bytes)[part]!);
const styleIDs = (xml: string) => [...xml.matchAll(/<w:pStyle w:val="([^"]+)"\s*\/>/g)].map(match => match[1]);
const loss = (result: ReturnType<typeof exportDOCX>) => result.report.issues.filter(issue => issue.code === 'paragraph-contextual-spacing-not-exported');
const change = (bytes: Uint8Array, mutate: (parts: Record<string, Uint8Array>) => void) => {
  const parts = unzipSync(bytes); mutate(parts); return zipSync(parts);
};
function metadata(parts: Record<string, Uint8Array>) {
  const parsed = parseDOCXXML(strFromU8(parts[PARAGRAPH_BRIDGE_PART]!), { maxXmlNodes: 100_000, maxXmlDepth: 128 });
  const root = parsed.children.find(node => typeof node !== 'string');
  if (!root) throw new Error('Missing metadata root.');
  return JSON.parse(root.children.join('')) as { groups: string[][]; roles: Array<Record<string, unknown>> };
}
function replaceMetadata(parts: Record<string, Uint8Array>, value: unknown) {
  const text = JSON.stringify(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  parts[PARAGRAPH_BRIDGE_PART] = strToU8(`<f:paragraphs xmlns:f="${PARAGRAPH_BRIDGE_NS}" version="1">${text}</f:paragraphs>`);
}
const codeDocument = () => doc(p('Before'), schema.node('code_block', { language: 'python', lineNumbers: false, layout }, [schema.text('answer = 42\nprint(answer)')]));

describe('native Word contextual-spacing bridge', () => {
  it('writes a shared native paragraph style and on/off rules, then retains the original opaque identity', () => {
    expect(typeof globalThis.document).toBe('undefined');
    const source = doc(p('First'), p('Second', { ...layout, spacingBefore: 12, spacingAfter: 0, contextualSpacing: false }));
    const before = source.toJSON();
    const result = exportDOCX(source);
    const xml = native(result.bytes);
    expect(styleIDs(xml)).toHaveLength(2);
    expect(new Set(styleIDs(xml)).size).toBe(1);
    expect(xml).toContain('<w:contextualSpacing w:val="1"/>');
    expect(xml).toContain('<w:contextualSpacing w:val="0"/>');
    expect(xml).toContain('w:before="240"');
    expect(loss(result)).toEqual([]);
    const reopened = importDOCX(result.bytes, schema).document;
    expect(reopened.child(0).attrs.layout).toMatchObject({ spacingGroup: layout.spacingGroup, spacingAfter: 10, contextualSpacing: true });
    expect(reopened.child(1).attrs.layout).toMatchObject({ spacingGroup: layout.spacingGroup, spacingBefore: 12, contextualSpacing: false });
    expect(paragraphSpacingAt(reopened, [1])?.spacingBefore).toBe(2);
    expect(source.toJSON()).toEqual(before);
  });

  it.each([
    [true, true, 0], [false, false, 12], [false, true, 0],
  ])('retains the two-sided rule %s/%s with an expected %s pt gap', (first, second, expected) => {
    const source = doc(p('First', { ...layout, contextualSpacing: first }), p('Second', { ...layout, spacingBefore: 12, spacingAfter: 0, contextualSpacing: second }));
    expect(paragraphSpacingAt(importDOCX(exportDOCX(source).bytes, schema).document, [1])?.spacingBefore).toBe(expected);
  });

  it('does not merge distinct or differently cased identities through a shared Normal ancestor', () => {
    const source = doc(p('First', { ...layout, spacingGroup: 'Body' }), p('Second', { ...layout, spacingGroup: 'body', spacingBefore: 12 }));
    const result = exportDOCX(source);
    expect(new Set(styleIDs(native(result.bytes))).size).toBe(2);
    const reopened = importDOCX(result.bytes, schema).document;
    expect(paragraphSpacingAt(reopened, [1])?.spacingBefore).toBe(12);
    expect(reopened.child(0).attrs.layout).toMatchObject({ spacingGroup: 'Body' });
    expect(reopened.child(1).attrs.layout).toMatchObject({ spacingGroup: 'body' });
  });

  it('keeps an owned group with omitted intent and zero spacing instead of inheriting Normal after-space', () => {
    const source = doc(p('First', { unit: 'pt', spacingGroup: 'Owned' }), p('Second', { unit: 'pt', spacingGroup: 'Owned' }));
    const result = exportDOCX(source);
    expect(native(result.bytes)).toContain('<w:spacing w:before="0" w:after="0"/>');
    const reopened = importDOCX(result.bytes, schema).document;
    expect(reopened.child(0).attrs.layout).toMatchObject({ spacingGroup: 'Owned', spacingBefore: 0, spacingAfter: 0 });
    const value = reopened.child(0).attrs.layout;
    expect(isParagraphLayout(value) && value.contextualSpacing).toBeUndefined();
  });

  it('shares identity across heading, code and caption roles without losing their own meaning', () => {
    const fixture = unzipSync(readFileSync('tests/fixtures/native-docx/cooling-report.docx'));
    const image = Object.keys(fixture).find(name => /^word\/media\/.*\.png$/.test(name))!;
    expect(image).toBeTruthy();
    const source = doc(p('Prose'), schema.node('heading', { level: 2, layout }, [schema.text('Heading')]),
      schema.node('code_block', { language: 'python', lineNumbers: false, layout }, [schema.text('answer = 40 + 2\nprint(answer)')]),
      schema.node('image_super', { src: `data:image/png;base64,${Buffer.from(fixture[image]!).toString('base64')}`, caption: 'Figure source', captionLayout: layout }));
    const result = exportDOCX(source);
    const xml = native(result.bytes);
    expect(styleIDs(xml)).toHaveLength(4);
    expect(new Set(styleIDs(xml)).size).toBe(1);
    expect(xml).toContain('<w:outlineLvl w:val="1"/>');
    expect(xml).toContain('<w:br/>');
    const reopened = importDOCX(result.bytes, schema).document;
    expect(reopened.content.map(node => node.type.name)).toEqual(['paragraph', 'heading', 'code_block', 'image_super']);
    expect(reopened.child(1).attrs.level).toBe(2);
    expect(reopened.child(2).attrs).toMatchObject({ language: 'python', lineNumbers: false, layout: { spacingGroup: layout.spacingGroup } });
    expect(reopened.child(2).textContent).toBe('answer = 40 + 2\nprint(answer)');
    expect(reopened.child(3).attrs).toMatchObject({ captionLayout: { spacingGroup: layout.spacingGroup } });
    expect(reopened.child(3).content.map(inline => inline.textContent).join('') || reopened.child(3).attrs.caption).toBe('Figure source');
  });

  it('takes changed native declarations as authoritative rather than restoring a stale computed gap', () => {
    const archive = unzipSync(exportDOCX(doc(p('First'), p('Second', { ...layout, contextualSpacing: false, spacingBefore: 12, spacingAfter: 0 }))).bytes);
    archive['word/document.xml'] = strToU8(strFromU8(archive['word/document.xml']!).replace('w:before="240"', 'w:before="600"'));
    const reopened = importDOCX(zipSync(archive), schema).document;
    expect(reopened.child(1).attrs.layout).toMatchObject({ spacingGroup: layout.spacingGroup, spacingBefore: 30 });
    expect(paragraphSpacingAt(reopened, [1])?.spacingBefore).toBe(20);
  });

  it('retains the actual paper rule through the shipped native export/reopen boundary', () => {
    const source = importDOCX(readFileSync('tests/fixtures/native-docx/cooling-report.docx'), schema).document;
    const result = exportDOCX(source);
    const reopened = importDOCX(result.bytes, schema).document;
    const index = reopened.content.findIndex(node => node.type.name === 'ordered_list');
    expect(paragraphSpacingAt(reopened, [index, 1, 0])?.spacingBefore).toBe(0);
    expect(paragraphSpacingAt(reopened, [index, 2, 0])?.spacingBefore).toBe(0);
    expect(loss(result)).toEqual([]);
    expect(reopened.child(index).child(0).child(0).attrs.layout).toMatchObject({ spacingAfter: 7, spacingGroup: 'word:style:ListNumber', contextualSpacing: true });
  });

  it('keeps native spacing and outline semantics when optional Fountain metadata is removed', () => {
    const source = doc(p('Before'), schema.node('heading', { level: 3, layout }, [schema.text('Native heading')]));
    const result = importDOCX(change(exportDOCX(source).bytes, parts => {
      delete parts[PARAGRAPH_BRIDGE_PART];
      parts['word/_rels/document.xml.rels'] = strToU8(strFromU8(parts['word/_rels/document.xml.rels']!).replace(/<Relationship Id="rIdFountainParagraphs"[^>]+\/>/, ''));
    }), schema);
    expect(result.document.child(1).type.name).toBe('heading');
    expect(result.document.child(1).attrs.level).toBe(3);
    expect(paragraphSpacingAt(result.document, [1])?.spacingBefore).toBe(0);
    expect(result.document.child(0).attrs.layout).toMatchObject({ contextualSpacing: true, spacingGroup: 'word:style:FountainSpacing1' });
  });

  it('does not restore stale code roles over a changed native heading', () => {
    const result = importDOCX(change(exportDOCX(codeDocument()).bytes, parts => {
      parts['word/document.xml'] = strToU8(strFromU8(parts['word/document.xml']!).replace(/(<w:p w14:paraId="[^"]+"><w:pPr>)/, '$1<w:outlineLvl w:val="3"/>'));
    }), schema);
    expect(result.document.child(1).type.name).toBe('heading');
    expect(result.document.child(1).attrs.level).toBe(4);
    expect(result.report.issues.some(issue => issue.code === 'paragraph-role-binding-invalid')).toBe(true);
    expect(result.document.child(1).textContent).toContain('answer = 42');
  });

  it('does not bind a code role after its native paragraph style is changed', () => {
    const result = importDOCX(change(exportDOCX(codeDocument()).bytes, parts => {
      parts['word/document.xml'] = strToU8(strFromU8(parts['word/document.xml']!).replace(/(<w:p w14:paraId="[^"]+"><w:pPr>)<w:pStyle[^>]+\/>/, '$1<w:pStyle w:val="Normal"/>'));
    }), schema);
    expect(result.document.child(1).type.name).toBe('paragraph');
    expect(result.report.issues.some(issue => issue.code === 'paragraph-role-binding-invalid')).toBe(true);
  });

  it('rejects duplicate native paragraph IDs within a part instead of assigning an arbitrary role', () => {
    const result = importDOCX(change(exportDOCX(codeDocument()).bytes, parts => {
      const xml = strFromU8(parts['word/document.xml']!);
      const id = xml.match(/w14:paraId="([^"]+)"/)![1];
      parts['word/document.xml'] = strToU8(xml.replace('<w:p>', `<w:p w14:paraId="${id}">`));
    }), schema);
    expect(result.document.content.map(node => node.type.name)).toEqual(['paragraph', 'paragraph']);
    expect(result.report.issues.filter(issue => issue.code === 'paragraph-role-binding-invalid')).toHaveLength(2);
  });

  it('accepts an equivalent bound namespace prefix but ignores a foreign paraId lookalike', () => {
    const bytes = exportDOCX(codeDocument()).bytes;
    const alias = importDOCX(change(bytes, parts => {
      parts['word/document.xml'] = strToU8(strFromU8(parts['word/document.xml']!).replaceAll('w14:', 'native14:').replace('xmlns:w14=', 'xmlns:native14=').replace('mc:Ignorable="w14"', 'mc:Ignorable="native14"'));
    }), schema);
    expect(alias.document.child(1).type.name).toBe('code_block');
    const foreign = importDOCX(change(bytes, parts => {
      parts['word/document.xml'] = strToU8(strFromU8(parts['word/document.xml']!).replace('http://schemas.microsoft.com/office/word/2010/wordml', 'urn:foreign'));
    }), schema);
    expect(foreign.document.child(1).type.name).toBe('paragraph');
  });

  it.each(['duplicate-style', 'duplicate-identity', 'unknown-style', 'bad-identity', 'duplicate-role', 'bad-language', 'unknown-role', 'extra-data'] as const)('rejects invalid metadata %s with native content preserved', mutation => {
    const result = importDOCX(change(exportDOCX(codeDocument()).bytes, parts => {
      const value = metadata(parts);
      if (mutation === 'duplicate-style') value.groups.push([value.groups[0]![0]!, 'Other']);
      if (mutation === 'duplicate-identity') value.groups.push(['Normal', value.groups[0]![1]!]);
      if (mutation === 'unknown-style') value.groups[0]![0] = 'Missing';
      if (mutation === 'bad-identity') value.groups[0]![1] = 'bad\u0000identity';
      if (mutation === 'duplicate-role') value.roles.push(value.roles[0]!);
      if (mutation === 'bad-language') value.roles[0]!.language = 'not a token';
      if (mutation === 'unknown-role') value.roles[0]!.kind = 'execute';
      if (mutation === 'extra-data') value.roles[0]!.formattingSnapshot = {};
      replaceMetadata(parts, value);
    }), schema);
    expect(result.report.issues.some(issue => issue.code === 'invalid-paragraph-metadata')).toBe(true);
    expect(result.document.child(1).type.name).toBe('paragraph');
    expect(result.document.child(1).textContent).toContain('answer = 42');
    expect(result.document.child(0).attrs.layout).toMatchObject({ spacingGroup: 'word:style:FountainSpacing1', contextualSpacing: true });
  });

  it.each(['external', 'duplicate', 'missing'] as const)('ignores %s paragraph metadata relationships', mutation => {
    const result = importDOCX(change(exportDOCX(codeDocument()).bytes, parts => {
      const rels = strFromU8(parts['word/_rels/document.xml.rels']!);
      const relation = rels.match(/<Relationship Id="rIdFountainParagraphs"[^>]+\/>/)![0];
      if (mutation === 'external') parts['word/_rels/document.xml.rels'] = strToU8(rels.replace(relation, relation.replace('/>', ' TargetMode="External"/>')));
      if (mutation === 'duplicate') parts['word/_rels/document.xml.rels'] = strToU8(rels.replace(relation, relation + relation.replace('rIdFountainParagraphs', 'anotherID')));
      if (mutation === 'missing') delete parts[PARAGRAPH_BRIDGE_PART];
    }), schema);
    expect(result.report.issues.some(issue => issue.code === 'invalid-paragraph-metadata')).toBe(true);
    expect(result.document.child(1).type.name).toBe('paragraph');
  });

  it('never expands orphaned metadata or infers ownership from a generated-looking style name', () => {
    const result = importDOCX(change(exportDOCX(codeDocument()).bytes, parts => {
      parts['word/_rels/document.xml.rels'] = strToU8(strFromU8(parts['word/_rels/document.xml.rels']!).replace(/<Relationship Id="rIdFountainParagraphs"[^>]+\/>/, ''));
      parts[PARAGRAPH_BRIDGE_PART] = strToU8('not XML');
    }), schema);
    expect(result.document.child(1).type.name).toBe('paragraph');
    expect(result.packageParts.find(part => part.path === PARAGRAPH_BRIDGE_PART)?.handling).toBe('not-interpreted');
    expect(result.document.child(0).attrs.layout).toMatchObject({ spacingGroup: 'word:style:FountainSpacing1' });
  });

  it('keeps explicit run-font overrides and CodeChar defaults in grouped headings', () => {
    const source = doc(schema.node('heading', { level: 2, layout: { unit: 'pt', spacingGroup: 'H', contextualSpacing: true } }, [
      schema.text('Default '), schema.text('Mono', [schema.mark('code')]), schema.text(' Custom', [schema.mark('font_family', { family: 'Courier New' }), schema.mark('font_size', { size: '9pt' })]),
    ]));
    const reopened = importDOCX(exportDOCX(source).bytes, schema).document.child(0);
    expect(reopened.type.name).toBe('heading');
    const fonts = reopened.content.filter(node => node.isText).map(node => node.marks.find(mark => mark.type.name === 'font_family')?.attrs.family);
    expect(fonts).toEqual(['Arial', 'Consolas', 'Courier New']);
    expect(reopened.content.map(node => node.marks.find(mark => mark.type.name === 'font_size')?.attrs.size)).toEqual(['26pt', '26pt', '9pt']);
  });

  it.each(['\r', '\r\n'])('reports the explicit %j to native-line-break normalization', separator => {
    const result = exportDOCX(doc(schema.node('code_block', { language: 'text', layout }, [schema.text(`a${separator}b`)])));
    expect(result.report.issues.filter(issue => issue.code === 'code-line-endings-normalized')).toHaveLength(1);
    expect(importDOCX(result.bytes, schema).document.child(0).textContent).toBe('a\nb');
  });

  it('keeps role identity scoped to each body, footnote and header part', () => {
    const expanded = new Schema(composeExtensions([...StarterKit.extensions, PagesExtension]).schema);
    const code = (text: string, language: string) => expanded.node('code_block', { language, layout }, [expanded.text(text)]);
    const source = expanded.node('doc', {}, [code('print(1)', 'python'), expanded.node('paragraph', {}, [expanded.node('footnote_reference', { id: '1' })]),
      expanded.node('page_header', { variant: 'default' }, [code('theorem demo : True := by trivial', 'lean')]),
      expanded.node('footnote_definition', { id: '1' }, [code('SELECT 1', 'sql')])]);
    const bytes = change(exportDOCX(source).bytes, parts => {
      const value = metadata(parts);
      for (const role of value.roles) {
        const part = String(role.part);
        const oldID = String(role.id);
        role.id = '00000001'; // Legal reuse in different document parts.
        parts[part] = strToU8(strFromU8(parts[part]!).replace(`w14:paraId="${oldID}"`, 'w14:paraId="00000001"'));
      }
      replaceMetadata(parts, value);
    });
    const result = importDOCX(bytes, expanded);
    const codes: Node[] = [];
    result.document.descendants(node => { if (node.type.name === 'code_block') codes.push(node); });
    expect(codes.map(node => node.attrs.language)).toEqual(['python', 'lean', 'sql']);
    expect(codes.map(node => node.textContent)).toEqual(['print(1)', 'theorem demo : True := by trivial', 'SELECT 1']);
    expect(result.report.issues.filter(issue => issue.code === 'paragraph-role-binding-invalid')).toEqual([]);
    expect(codes.every(node => isParagraphLayout(node.attrs.layout) && node.attrs.layout.spacingGroup === layout.spacingGroup)).toBe(true);
  });

  it('propagates the metadata expansion limit instead of converting it into a recoverable warning', () => {
    const bytes = change(exportDOCX(codeDocument()).bytes, parts => { parts[PARAGRAPH_BRIDGE_PART] = strToU8('x'.repeat(8_000_001)); });
    expect(() => importDOCX(bytes, schema)).toThrow(/paragraph metadata exceeds its expanded byte limit/);
  });

  it('bounds native paragraph-style growth before creating an unreadable package', () => {
    const source = doc(...Array.from({ length: 4001 }, (_, index) => p('x', { unit: 'pt', spacingGroup: `g${index}` })));
    expect(() => exportDOCX(source)).toThrow(/4000 styles/);
  });

  it('bounds escaped metadata bytes during collection, including large valid opaque identities', () => {
    const source = doc(...Array.from({ length: 4000 }, (_, index) => p('x', { unit: 'pt', spacingGroup: `${index}${'"'.repeat(1000)}` })));
    expect(() => exportDOCX(source)).toThrow(/paragraph metadata exceeds its expanded byte limit/);
  });

  it('retains an ordinary code block without inventing a spacing group', () => {
    const source = doc(schema.node('code_block', { language: 'lean', lineNumbers: false }, [schema.text('example : True := by\n  trivial')]));
    const reopened = importDOCX(exportDOCX(source).bytes, schema).document.child(0);
    expect(reopened.type.name).toBe('code_block');
    expect(reopened.attrs).toMatchObject({ language: 'lean', lineNumbers: false });
    expect(isParagraphLayout(reopened.attrs.layout) && reopened.attrs.layout.spacingGroup).toBeUndefined();
    expect(reopened.textContent).toBe(source.child(0).textContent);
  });

  it('restores the same physical header referenced by two page variants', () => {
    const expanded = new Schema(composeExtensions([...StarterKit.extensions, PagesExtension]).schema);
    const code = (language: string) => expanded.node('code_block', { language, layout }, [expanded.text(language)]);
    const source = expanded.node('doc', {}, [expanded.node('paragraph'),
      expanded.node('page_header', { variant: 'default' }, [code('lean')]), expanded.node('page_header', { variant: 'first' }, [code('python')])]);
    const result = importDOCX(change(exportDOCX(source).bytes, parts => {
      parts['word/_rels/document.xml.rels'] = strToU8(strFromU8(parts['word/_rels/document.xml.rels']!).replace('Target="header2.xml"', 'Target="header1.xml"'));
    }), expanded);
    const headers = result.document.content.filter(node => node.type.name === 'page_header');
    expect(headers.map(node => node.attrs.variant)).toEqual(['default', 'first']);
    expect(headers.map(node => node.child(0).type.name)).toEqual(['code_block', 'code_block']);
    expect(headers.map(node => node.child(0).attrs.language)).toEqual(['lean', 'lean']);
    expect(result.report.issues.filter(issue => issue.code === 'paragraph-role-binding-invalid')).toEqual([]);
  });

  it.each([1, 2, 3, 4, 5, 6])('retains native outline semantics for heading level %d without role metadata', level => {
    const bytes = exportDOCX(doc(schema.node('heading', { level, layout }, [schema.text('Heading')]))).bytes;
    expect(native(bytes)).toContain(`<w:outlineLvl w:val="${level - 1}"/>`);
    const result = importDOCX(change(bytes, parts => {
      delete parts[PARAGRAPH_BRIDGE_PART];
      parts['word/_rels/document.xml.rels'] = strToU8(strFromU8(parts['word/_rels/document.xml.rels']!).replace(/<Relationship Id="rIdFountainParagraphs"[^>]+\/>/, ''));
    }), schema);
    expect(result.document.child(0).type.name).toBe('heading');
    expect(result.document.child(0).attrs.level).toBe(level);
  });

  it.each([6, 7, 8])('reports unsupported native outline level %d rather than silently clamping it', level => {
    const bytes = change(exportDOCX(doc(schema.node('heading', { level: 1, layout }, [schema.text('Heading')]))).bytes, parts => {
      parts['word/document.xml'] = strToU8(strFromU8(parts['word/document.xml']!).replace('w:outlineLvl w:val="0"', `w:outlineLvl w:val="${level}"`));
    });
    const result = importDOCX(bytes, schema);
    expect(result.document.child(0).type.name).toBe('paragraph');
    expect(result.document.child(0).textContent).toBe('Heading');
    expect(result.report.issues.some(issue => issue.code === 'paragraph-outline-level-not-imported')).toBe(true);
  });

  it('allows a direct body outline override to supersede a built-in heading style name', () => {
    const bytes = change(exportDOCX(doc(schema.node('heading', { level: 2 }, [schema.text('Body now')]))).bytes, parts => {
      parts['word/document.xml'] = strToU8(strFromU8(parts['word/document.xml']!).replace('<w:pPr>', '<w:pPr><w:outlineLvl w:val="9"/>'));
    });
    const result = importDOCX(bytes, schema);
    expect(result.document.child(0).type.name).toBe('paragraph');
    expect(result.document.child(0).textContent).toBe('Body now');
  });
});
