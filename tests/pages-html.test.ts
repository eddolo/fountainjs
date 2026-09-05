// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { CoreExtension, HTMLExporter, HTMLImporter, Schema, composeExtensions } from '../src';
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
        { type: 'footnote_definition', attrs: { id: 'note-1' }, content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Evidence' }] },
        ] },
      ],
    });

    const html = HTMLExporter.export(source, { document: false });
    expect(html).toContain('data-fountain-page-break="true"');
    expect(html).toContain('data-fountain-footnote-reference="note-1"');
    expect(html).toContain('role="doc-footnote"');
    expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(source.toJSON());
  });
});
