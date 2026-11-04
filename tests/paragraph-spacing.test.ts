// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, Schema, HTMLExporter, MarkdownExporter, isParagraphLayout,
  paragraphSpacingAt, paragraphSpacingDOMAttributes, resolveParagraphGap, PARAGRAPH_SPACING_STYLES, type ParagraphLayout } from '../src';
import { readFileSync } from 'node:fs';
import { ServerHTMLImporter } from '../src/html/server';
import { exportDOCX, importDOCX } from '../src/docx';

const schema = new Schema(CoreSchemaSpec);
const before: ParagraphLayout = { unit: 'pt', spacingGroup: 'body', spacingBefore: 0, spacingAfter: 10, contextualSpacing: true };
const after: ParagraphLayout = { unit: 'pt', spacingGroup: 'body', spacingBefore: 12, spacingAfter: 0, contextualSpacing: false };
const p = (text: string, layout = before) => schema.node('paragraph', { layout }, [schema.text(text)]);
const doc = (...nodes: ReturnType<typeof p>[]) => schema.node('doc', {}, nodes);

describe('portable contextual paragraph spacing', () => {
  it.each([
    [before, after, 2], [before, { ...after, contextualSpacing: true }, 0],
    [{ ...before, contextualSpacing: false }, after, 12],
    [{ ...before, contextualSpacing: false }, { ...after, contextualSpacing: true }, 0],
    [before, { ...after, spacingGroup: 'Body' }, 12],
    [{ ...before, spacingGroup: undefined, contextualSpacing: undefined }, { ...after, spacingGroup: undefined, contextualSpacing: undefined }, 12],
  ])('resolves declarations %j / %j to %d pt without a DOM', (left, right, expected) => {
    expect(typeof document).toBe('undefined');
    const initial = JSON.stringify([left, right]);
    expect(resolveParagraphGap(left, right)).toBe(expected);
    expect(JSON.stringify([left, right])).toBe(initial);
  });

  it('retains original edge declarations when there is no adjacent paragraph', () => {
    expect(resolveParagraphGap(undefined, after)).toBe(12);
    expect(resolveParagraphGap(before, undefined)).toBe(10);
    expect(resolveParagraphGap()).toBe(0);
    const source = doc(p('First'), p('Second', after));
    expect(paragraphSpacingAt(source, [0])).toEqual({ unit: 'pt', spacingBefore: 0, spacingAfter: 0 });
    expect(paragraphSpacingAt(source, [1])).toEqual({ unit: 'pt', spacingBefore: 2, spacingAfter: 0 });
    expect(source.child(0).attrs.layout).toEqual(before);
    expect(source.child(1).attrs.layout).toEqual(after);
  });

  it.each(['', 'x'.repeat(1025), 'bad\nidentity', '\u0000', '\u007f', '\u0085', '\uD800'])('rejects invalid spacing-group identity %j', spacingGroup => {
    expect(isParagraphLayout({ ...before, spacingGroup })).toBe(false);
    expect(() => p('Invalid', { ...before, spacingGroup })).toThrow();
  });

  it('accepts Unicode and hostile-looking identities as inert, bounded data; requires identity for the rule', () => {
    const layout = { ...before, spacingGroup: '研究 🧪 "><script>alert(1)</script>' };
    const source = doc(p('First', layout), p('Second', { ...after, spacingGroup: layout.spacingGroup }));
    const html = HTMLExporter.export(source, { document: false });
    expect(html).not.toContain('<script');
    expect(ServerHTMLImporter.parse(html, schema).eq(source)).toBe(true);
    expect(isParagraphLayout({ unit: 'pt', contextualSpacing: false })).toBe(false);
    expect(() => resolveParagraphGap({ ...before, spacingAfter: Infinity })).toThrow(/Invalid paragraph spacing/);
  });

  it('walks the model flow across list items/nesting and neutralizes only participating container edges', () => {
    const item = (...nodes: ReturnType<typeof p>[]) => schema.node('list_item', {}, nodes);
    const nested = schema.node('bullet_list', {}, [item(p('Nested', after))]);
    const list = schema.node('ordered_list', {}, [item(p('Item one')), item(p('Item two'), nested)]);
    const source = doc(p('Intro'), list, p('Following', after));
    expect(paragraphSpacingAt(source, [1, 0, 0])?.spacingBefore).toBe(0);
    expect(paragraphSpacingAt(source, [1, 1, 1, 0, 0])?.spacingBefore).toBe(2);
    expect(paragraphSpacingAt(source, [2])?.spacingBefore).toBe(12);
    const projection = paragraphSpacingDOMAttributes(list, { document: source, path: [1] });
    expect(projection['data-fountain-paragraph-spacing']).toBe('');
    expect(projection.style).toContain('margin-block-start:0');
    expect(projection.style).toContain('margin-block-end:0');
    expect(projection.style).toContain('--fountain-paragraph-marker-size:initial');
  });

  it('does not skip atomic content or cross separate quote/table-cell flows', () => {
    const source = doc(p('First'), schema.node('horizontal_rule'), p('Second', after));
    expect(paragraphSpacingAt(source, [0])?.spacingAfter).toBe(10);
    expect(paragraphSpacingAt(source, [2])?.spacingBefore).toBe(12);
    const quote = schema.node('blockquote', {}, [p('Quote', after)]);
    const quoted = doc(p('Outside'), quote, p('Outside after', after));
    expect(paragraphSpacingAt(quoted, [1, 0])?.spacingBefore).toBe(12);
    expect(paragraphSpacingAt(quoted, [2])?.spacingBefore).toBe(12);
    const cell = (text: string, layout: ParagraphLayout) => schema.node('table_cell', {}, [p(text, layout)]);
    const table = schema.node('table', {}, [schema.node('table_row', {}, [cell('Left', before), cell('Right', after)])]);
    expect(paragraphSpacingAt(doc(table), [0, 0, 1, 0])?.spacingBefore).toBe(12);
  });

  it('lets extension schemas explicitly opt their containers into flow, without guessing from HTML tags', () => {
    const extended = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      custom_flow: { group: 'block', content: 'block+', paragraphFlow: 'transparent', toDOM: () => ['section', 0] },
      custom_island: { group: 'block', content: 'block+', toDOM: () => ['section', 0] },
    } });
    const paragraph = (text: string, layout: ParagraphLayout) => extended.node('paragraph', { layout }, [extended.text(text)]);
    for (const [kind, expected] of [['custom_flow', 2], ['custom_island', 12]] as const) {
      const source = extended.node('doc', {}, [paragraph('Before', before), extended.node(kind, {}, [paragraph('Inside', after)])]);
      expect(paragraphSpacingAt(source, [1, 0])?.spacingBefore).toBe(expected);
    }
  });

  it('preserves authoritative JSON through HTML while projecting the present 2 pt gap', () => {
    const source = doc(p('First'), p('Second', after));
    const html = HTMLExporter.export(source, { document: false });
    expect(html).toContain('margin-block-start:2pt');
    expect(html).not.toMatch(/style="[^"]*"[^>]* style=/);
    expect(schema.nodeFromJSON(source.toJSON()).eq(source)).toBe(true);
    expect(ServerHTMLImporter.parse(html, schema).eq(source)).toBe(true);
    expect(MarkdownExporter.exportWithReport(source).losses.some(loss => loss.detail.includes('Paragraph spacing'))).toBe(true);
    const word = exportDOCX(source);
    expect(word.report.issues.filter(issue => issue.code === 'paragraph-contextual-spacing-not-exported')).toEqual([]);
    expect(paragraphSpacingAt(importDOCX(word.bytes, schema).document, [1])?.spacingBefore).toBe(2);
  });

  it('uses one opaque identity across paragraph, heading and code carriers, independently of their presentation', () => {
    const source = doc(p('Prose'), schema.node('heading', { level: 2, layout: after }, [schema.text('Heading')]),
      schema.node('code_block', { language: 'python', layout: before }, [schema.text('print(1)')]));
    expect(paragraphSpacingAt(source, [1])?.spacingBefore).toBe(2);
    expect(paragraphSpacingAt(source, [2])?.spacingBefore).toBe(0);
    const html = HTMLExporter.export(source, { document: false });
    expect(ServerHTMLImporter.parse(html, schema).eq(source)).toBe(true);
  });

  it('projects declared typography onto native markers without changing list-item or descendant document attributes', () => {
    const value = { ...before, fontFamily: 'Arial', fontSize: 11, lineHeight: 14, lineHeightUnit: 'pt' as const, lineHeightRule: 'exact' as const };
    const item = schema.node('list_item', {}, [p('First', value)]);
    const source = doc(schema.node('ordered_list', {}, [item]));
    const snapshot = source.toJSON();
    const projection = paragraphSpacingDOMAttributes(item, { document: source, path: [0, 0] });
    expect(projection['data-fountain-paragraph-marker-font']).toBe('');
    expect(projection.style).toContain('--fountain-paragraph-marker-size:11pt');
    expect(projection.style).toContain('--fountain-paragraph-marker-line:14pt');
    expect(source.toJSON()).toEqual(snapshot);
    expect(HTMLExporter.export(source)).toContain(PARAGRAPH_SPACING_STYLES);
    expect(readFileSync('src/styles.css', 'utf8')).toContain(PARAGRAPH_SPACING_STYLES);
  });
});
