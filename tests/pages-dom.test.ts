// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoreExtension, Schema, composeExtensions } from '../src';
import { PagesExtension, createPageGeometry } from '../src/pages';
import { layoutDOMPages, measureDOMPageFlow } from '../src/pages/dom';

function schema() {
  return new Schema(composeExtensions([CoreExtension, PagesExtension]).schema);
}

function rectangle(top: number, height: number): DOMRect {
  return {
    x: 0, y: top, top, bottom: top + height, left: 0, right: 100,
    width: 100, height, toJSON: () => ({}),
  } as DOMRect;
}

afterEach(() => vi.restoreAllMocks());

describe('DOM page measurement adapter', () => {
  it('measures templates, body blocks, manual breaks, and footnote reservations without changing the model', () => {
    const document = schema().nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'page_header', attrs: { variant: 'default' }, content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Header' }] },
        ] },
        { type: 'paragraph', content: [
          { type: 'text', text: 'Claim' },
          { type: 'footnote_reference', attrs: { id: 'note' } },
        ] },
        { type: 'page_break' },
        { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
        { type: 'footnote_definition', attrs: { id: 'note' }, content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Evidence' }] },
        ] },
      ],
    });
    const root = window.document.createElement('div');
    root.innerHTML = `
      <header data-fountain-path="0" data-height="12"></header>
      <p data-fountain-path="1" data-height="30"><sup data-fountain-path="1.1" data-fountain-footnote-reference="note" data-height="8"></sup></p>
      <hr data-fountain-path="2" data-height="0">
      <p data-fountain-path="3" data-height="20"></p>
      <section data-fountain-path="4" data-fountain-footnote-definition="note" data-height="14"></section>
    `;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      return rectangle(Number(this.dataset.fountainPath?.split('.')[0] ?? 0) * 40, Number(this.dataset.height ?? 0));
    });

    const before = document.toJSON();
    const measurement = measureDOMPageFlow(root, document, { lineFragmentNodeTypes: [] });
    expect(measurement.templates).toMatchObject([{ kind: 'header', variant: 'default', path: [0], height: 12 }]);
    expect(measurement.items).toHaveLength(3);
    expect(measurement.items[0].fragments?.[0].footnotes).toEqual([{ id: 'note', height: 14 }]);
    expect(measurement.items[1]).toMatchObject({ breakAfter: true, height: 0 });
    expect(measurement.warnings).toEqual([]);
    expect(measurement.measurementCount).toBeGreaterThan(0);
    expect(document.toJSON()).toEqual(before);

    const snapshot = layoutDOMPages(
      root,
      document,
      createPageGeometry({ size: { width: 100, height: 70 }, margins: 10 }),
      { lineFragmentNodeTypes: [] },
    );
    expect(snapshot.layout.pages).toHaveLength(2);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('reports missing model DOM and unresolved footnotes and rejects invalid line constraints', () => {
    const document = schema().nodeFromJSON({
      type: 'doc',
      content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'Claim' },
        { type: 'footnote_reference', attrs: { id: 'missing' } },
      ] }],
    });
    const empty = window.document.createElement('div');
    expect(measureDOMPageFlow(empty, document).warnings).toMatchObject([{ code: 'missing-rendered-node', path: [0] }]);

    const root = window.document.createElement('div');
    root.innerHTML = '<p data-fountain-path="0" data-height="20"><sup data-fountain-path="0.1" data-fountain-footnote-reference="missing" data-height="8"></sup></p>';
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      return rectangle(0, Number(this.dataset.height ?? 0));
    });
    expect(measureDOMPageFlow(root, document, { lineFragmentNodeTypes: [] }).warnings)
      .toMatchObject([{ code: 'unmeasured-footnote', path: [0, 1] }]);
    expect(() => measureDOMPageFlow(root, document, { minimumTextLines: 0 })).toThrow(/positive safe integer/);
  });
});
