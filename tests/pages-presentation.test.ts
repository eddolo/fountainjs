import { describe, expect, it } from 'vitest';
import { CoreExtension, Schema, composeExtensions } from '../src';
import {
  PagesExtension,
  createPageGeometry,
  layoutPages,
  projectPagePresentation,
} from '../src/pages';

function schema() {
  return new Schema(composeExtensions([CoreExtension, PagesExtension]).schema);
}

function documentWithFurniture() {
  return schema().nodeFromJSON({
    type: 'doc',
    content: [
      { type: 'page_header', attrs: { variant: 'default' }, content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'Page ' },
          { type: 'page_field', attrs: { kind: 'page-number' } },
          { type: 'text', text: ' of ' },
          { type: 'page_field', attrs: { kind: 'page-count' } },
        ] },
      ] },
      { type: 'page_header', attrs: { variant: 'first' }, content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First page' }] },
      ] },
      { type: 'page_footer', attrs: { variant: 'default' }, content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Default footer' }] },
      ] },
      { type: 'page_footer', attrs: { variant: 'even' }, content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Even footer' }] },
      ] },
      { type: 'paragraph', content: [
        { type: 'text', text: 'Claim' },
        { type: 'footnote_reference', attrs: { id: 'evidence' } },
      ] },
      { type: 'footnote_definition', attrs: { id: 'evidence' }, content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Evidence body' }] },
      ] },
    ],
  });
}

describe('page presentation projection', () => {
  it('selects page variants, resolves fields, and assigns canonical footnotes without cloning model nodes', () => {
    const document = documentWithFurniture();
    const layout = layoutPages([
      { id: 'first', height: 40, fragments: [{ id: 'first:1', height: 40, footnotes: [{ id: 'evidence', height: 10 }] }] },
      { id: 'second', height: 50, breakBefore: true },
      { id: 'third', height: 50, breakBefore: true },
    ], createPageGeometry({ size: { width: 100, height: 100 }, margins: 10 }));

    const result = projectPagePresentation(document, layout);
    expect(result.pageCount).toBe(3);
    expect(result.warnings).toEqual([]);
    expect(result.pages.map((page) => [page.header?.variant, page.footer?.variant])).toEqual([
      ['first', 'default'],
      ['default', 'even'],
      ['default', 'default'],
    ]);
    expect(result.pages[1]?.header?.fields.map((field) => [field.kind, field.value])).toEqual([
      ['page-number', '2'],
      ['page-count', '3'],
    ]);
    expect(result.pages[0]?.footnotes[0]).toMatchObject({
      id: 'evidence',
      height: 10,
      sourcePath: [5],
    });
    expect(result.pages[0]?.footnotes[0]?.source).toBe(document.child(5));
    expect(result.pages[0]?.header?.source).toBe(document.child(1));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.pages)).toBe(true);
    expect(Object.isFrozen(result.pages[0]?.footnotes)).toBe(true);
  });

  it('warns and fails closed for ambiguous templates and unresolved footnote definitions', () => {
    const source = schema().nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'page_header', attrs: { variant: 'default' }, content: [{ type: 'paragraph' }] },
        { type: 'page_header', attrs: { variant: 'default' }, content: [{ type: 'paragraph' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
      ],
    });
    const layout = Object.freeze({
      pages: Object.freeze([Object.freeze({
        number: 1,
        placements: Object.freeze([]),
        footnotes: Object.freeze([{ id: 'missing', height: 12 }]),
        usedHeight: 12,
        availableHeight: 80,
      })]),
      warnings: Object.freeze([]),
    });

    const result = projectPagePresentation(source, layout);
    expect(result.pages[0]?.header).toBeUndefined();
    expect(result.pages[0]?.footnotes).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'invalid-template-contract',
      'missing-footnote-definition',
    ]);
  });

  it('rejects non-sequential external page layouts', () => {
    expect(() => projectPagePresentation(documentWithFurniture(), {
      pages: [{ number: 2, placements: [], footnotes: [], usedHeight: 0, availableHeight: 80 }],
      warnings: [],
    })).toThrow(/sequential/);
  });
});
