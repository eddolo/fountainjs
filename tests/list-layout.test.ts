// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { HTMLExporter } from '../src/core/exporters/html-exporter';
import { MarkdownExporter } from '../src/core/exporters/markdown-exporter';
import { ServerHTMLImporter } from '../src/html/server';
import { isListLayout, listLayoutDOMAttributes, type ListLayout } from '../src/core/list-layout';

const schema = new Schema(StarterKit.schema);
const geometry: ListLayout = { unit: 'pt', indentStart: 18, markerOffset: -18, markerStyle: 'decimal' };
const doc = (layout = geometry) => schema.node('doc', {}, [schema.node('ordered_list', { start: 3, layout }, [
  schema.node('list_item', {}, [schema.node('paragraph', {}, [schema.text('First instruction')])]),
  schema.node('list_item', { layout: { ...layout, indentStart: 6 } }, [
    schema.node('paragraph', {}, [schema.text('Second instruction')]),
    schema.node('paragraph', {}, [schema.text('Continuation paragraph')]),
  ]),
])]);

describe('portable list geometry', () => {
  it('retains list defaults and item-local overrides without a DOM', () => {
    expect(typeof document).toBe('undefined');
    const value = doc();
    expect(schema.nodeFromJSON(value.toJSON()).eq(value)).toBe(true);
    expect(value.child(0).attrs.layout).toEqual(geometry);
    expect(value.child(0).child(1).attrs.layout).toEqual({ ...geometry, indentStart: 6 });
    expect(Object.isFrozen(value.child(0).attrs.layout)).toBe(true);
  });
  it('round-trips geometry and marker text through actual safe HTML/server parsing', () => {
    const value = doc({ ...geometry, markerPrefix: 'Step "', markerSuffix: '" —', fontFamily: 'Calibri', fontSize: 11 });
    const html = new HTMLExporter().export(value, { document: false });
    const imported = ServerHTMLImporter.parseWithReport(html, schema).document;
    expect(imported.eq(value)).toBe(true);
    expect(html).toContain('data-fountain-list-layout=');
    expect(html).toContain('role="list"');
    expect(html).toContain('list-style-type:decimal');
    expect(html).not.toContain('list-style:none');
    expect(html).not.toContain('<script');
  });
  it('escapes hostile marker text without executing it or losing its literal data', () => {
    const value = doc({ ...geometry, markerPrefix: '"><script>alert(1)</script>\\', markerSuffix: '<style>' });
    const html = new HTMLExporter().export(value, { document: false });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<style>');
    expect(ServerHTMLImporter.parseWithReport(html, schema).document.eq(value)).toBe(true);
  });
  it.each([
    { ...geometry, markerOffset: Infinity }, { ...geometry, indentStart: NaN },
    { ...geometry, markerStyle: 'decimal);background:url(javascript:bad)' },
    { ...geometry, markerPrefix: 'line\nfeed' }, { ...geometry, markerSuffix: '\u0000' },
    { ...geometry, markerPrefix: 'x'.repeat(257) }, { ...geometry, fontFamily: 'Arial; color:red' },
    { ...geometry, fontSize: 0 }, { ...geometry, executable: 'bad' },
  ])('rejects unbounded or unsafe geometry/marker declarations', value => {
    expect(isListLayout(value)).toBe(false);
    expect(listLayoutDOMAttributes(value)).toEqual({});
    expect(() => doc(value as ListLayout)).toThrow();
  });
  it('does not invent layout for ordinary lists and reports ordinary Markdown omissions', () => {
    expect(listLayoutDOMAttributes(undefined)).toEqual({});
    const result = new MarkdownExporter().exportWithReport(doc());
    expect(result.losses.filter(loss => loss.detail.includes('List marker'))).toHaveLength(2);
    expect(result.markdown).toContain('3. First instruction');
  });
});
