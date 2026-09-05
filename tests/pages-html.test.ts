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
    expect(html).toContain('href="#fountain-footnote-note-1">1</a>');
    expect(html).toContain('data-fountain-page-header="first"');
    expect(html).toContain('data-fountain-page-footer="default"');
    expect(html).toContain('data-fountain-page-field="page-number"');
    expect(html).toContain('role="doc-footnote"');
    expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(source.toJSON());
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
    expect(exported).toContain('href="#fountain-footnote-source-alpha">1</a>');
    expect(exported).not.toContain('>7</a>');
  });
});
