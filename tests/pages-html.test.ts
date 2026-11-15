// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  CoreExtension,
  EditorView,
  HTMLExporter,
  HTMLImporter,
  Schema,
  composeExtensions,
  createEditor,
  moveBlock,
} from '../src';
import { PagesExtension } from '../src/pages';

describe('page-intent HTML interchange', () => {
  it('round-trips semantic page breaks, references, and definitions', () => {
    const schema = new Schema(composeExtensions([CoreExtension, PagesExtension]).schema);
    const source = schema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'Claim' },
          { type: 'footnote_reference', attrs: { id: 'note-1' } },
        ] },
        { type: 'page_break' },
        { type: 'page_header', attrs: { variant: 'first' }, content: [
          { type: 'paragraph', content: [
            { type: 'text', text: 'Report · ' },
            { type: 'page_field', attrs: { kind: 'page-number' } },
            { type: 'text', text: ' of ' },
            { type: 'page_field', attrs: { kind: 'page-count' } },
          ] },
        ] },
        { type: 'page_footer', attrs: { variant: 'default' }, content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Confidential' }] },
        ] },
        { type: 'footnote_definition', attrs: { id: 'note-1' }, content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Evidence' }] },
        ] },
      ],
    });

    const html = HTMLExporter.export(source, { document: false });
    expect(html).toContain('data-fountain-page-break="true"');
    expect(html).toContain('data-fountain-footnote-reference="note-1"');
    expect(html).toContain('data-fountain-footnote-number="1"');
    expect(html).toContain('aria-label="Footnote 1"');
    const reference = new DOMParser().parseFromString(html, 'text/html').querySelector('a[role="doc-noteref"]');
    expect(reference?.getAttribute('href')).toBe('#fountain-footnote-note-1');
    expect(reference?.getAttribute('aria-label')).toBe('Footnote 1');
    expect(reference?.textContent).toBe('1');
    expect(reference?.parentElement?.getAttribute('role')).toBeNull();
    expect(html).toContain('data-fountain-page-header="first"');
    expect(html).toContain('data-fountain-page-footer="default"');
    expect(html).toContain('data-fountain-page-field="page-number"');
    expect(html).toContain('role="doc-footnote"');
    expect(new DOMParser().parseFromString(html, 'text/html').querySelector('[role="doc-footnote"]')?.tagName).toBe('ASIDE');
    expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(source.toJSON());
  });

  it.each(['section', 'aside'])('retains native note identity when importing the %s HTML carrier', tag => {
    const schema = new Schema(composeExtensions([CoreExtension, PagesExtension]).schema);
    const imported = HTMLImporter.parse(`<${tag} data-fountain-footnote-definition="opaque-note" id="display-anchor"><p>Retained evidence</p></${tag}>`, schema);
    expect(imported.childCount).toBe(1);
    expect(imported.child(0).type.name).toBe('footnote_definition');
    expect(imported.child(0).attrs.id).toBe('opaque-note');
    expect(imported.child(0).textContent).toBe('Retained evidence');
    const exported = HTMLExporter.export(imported, { document: false });
    expect(new DOMParser().parseFromString(exported, 'text/html').querySelector('[role="doc-footnote"]')?.tagName).toBe('ASIDE');
  });

  it('renumbers unchanged reference nodes after document-order changes in the DOM view', () => {
    const kit = composeExtensions([CoreExtension, PagesExtension]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [
            { type: 'text', text: 'Beta' },
            { type: 'footnote_reference', attrs: { id: 'stable-beta' } },
          ] },
          { type: 'paragraph', content: [
            { type: 'text', text: 'Alpha' },
            { type: 'footnote_reference', attrs: { id: 'stable-alpha' } },
          ] },
          { type: 'footnote_definition', attrs: { id: 'stable-alpha' }, content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Alpha note' }] },
          ] },
          { type: 'footnote_definition', attrs: { id: 'stable-beta' }, content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Beta note' }] },
          ] },
        ],
      },
    });
    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    const label = (id: string) => mount.querySelector<HTMLElement>(
      `[data-fountain-footnote-reference="${id}"]`,
    )?.dataset.fountainFootnoteNumber;

    expect([label('stable-beta'), label('stable-alpha')]).toEqual(['1', '2']);
    expect(moveBlock(editor, 1, 0)).toBe(true);
    expect([label('stable-alpha'), label('stable-beta')]).toEqual(['1', '2']);
    expect(mount.querySelector('[data-fountain-footnote-definition="stable-alpha"]')
      ?.getAttribute('aria-label')).toBe('Footnote 1');

    view.destroy();
    editor.destroy();
  });

  it('imports semantic noteref and footnote roles while deriving fresh display order', () => {
    const schema = new Schema(composeExtensions([CoreExtension, PagesExtension]).schema);
    const imported = HTMLImporter.parse(`
      <p>Claim<a role="doc-noteref" href="#source-alpha"><sup>7</sup></a></p>
      <aside role="doc-footnote" id="source-alpha"><p>External evidence</p></aside>
    `, schema);

    expect(imported.toJSON()).toMatchObject({
      content: [
        { content: [
          { text: 'Claim' },
          { type: 'footnote_reference', attrs: { id: 'source-alpha' } },
        ] },
        { type: 'footnote_definition', attrs: { id: 'source-alpha' } },
      ],
    });
    const exported = HTMLExporter.export(imported, { document: false });
    expect(exported).toContain('data-fountain-footnote-number="1"');
    expect(new DOMParser().parseFromString(exported, 'text/html').querySelector('a[role="doc-noteref"]')?.getAttribute('href')).toBe('#fountain-footnote-source-alpha');
    expect(exported).not.toContain('>7</a>');
  });

  it('imports repeated references and endnote-role definitions from external semantic HTML', () => {
    const schema = new Schema(composeExtensions([CoreExtension, PagesExtension]).schema);
    const imported = HTMLImporter.parse(`
      <aside role="doc-endnote appendix" id="alpha"><p>Alpha evidence</p><ul><li><p>Nested support</p></li></ul></aside>
      <section role="doc-footnote" id="beta"><p>Beta evidence</p></section>
      <p>First<a role="doc-noteref citation" href="#beta"><sup>20</sup></a>, repeated<a role="doc-noteref" href="#beta">20</a>, alpha<a role="doc-noteref" href="#alpha">10</a>.</p>
    `, schema);

    expect(imported.content.map((node) => node.type.name)).toEqual([
      'footnote_definition', 'footnote_definition', 'paragraph',
    ]);
    expect(imported.child(0).child(1).type.name).toBe('bullet_list');
    const exported = HTMLExporter.export(imported, { document: false });
    expect(exported.match(/data-fountain-footnote-reference="beta"/gu)).toHaveLength(2);
    expect(exported.match(/data-fountain-footnote-number="1"/gu)).toHaveLength(3);
    expect(exported).toContain('data-fountain-footnote-reference="alpha"');
    expect(exported).toContain('data-fountain-footnote-number="2"');
    expect(HTMLImporter.parse(exported, schema).toJSON()).toEqual(imported.toJSON());
  });
});
