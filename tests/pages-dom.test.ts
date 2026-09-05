// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoreExtension, Schema, composeExtensions } from '../src';
import { PagesExtension, createPageGeometry } from '../src/pages';
import {
  createDOMPageLayoutController,
  layoutDOMPages,
  measureDOMPageFlow,
  projectDOMPageContent,
} from '../src/pages/dom';

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
    expect(measurement.fragmentSources).toMatchObject([
      { itemId: 'block:1:paragraph', kind: 'whole', sourcePath: [1], clipOffset: 0, height: 30 },
      { itemId: 'block:2:page_break', kind: 'manual-break', sourcePath: [2], clipOffset: 0, height: 0 },
      { itemId: 'block:3:paragraph', kind: 'whole', sourcePath: [3], clipOffset: 0, height: 20 },
    ]);
    expect(Object.isFrozen(measurement.fragmentSources)).toBe(true);
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
    expect(snapshot.content.pages).toMatchObject([
      {
        number: 1,
        placements: [
          {
            itemId: 'block:1:paragraph',
            contentHeight: 30,
            continuationHeight: 0,
            sources: [{ sourcePath: [1], kind: 'whole' }],
          },
          { itemId: 'block:2:page_break', sources: [{ sourcePath: [2], kind: 'manual-break' }] },
        ],
      },
      {
        number: 2,
        placements: [
          { itemId: 'block:3:paragraph', sources: [{ sourcePath: [3], kind: 'whole' }] },
        ],
      },
    ]);
    expect(Object.isFrozen(snapshot.content.pages[0]?.placements[0]?.sources)).toBe(true);
    expect(snapshot.presentation.pages).toHaveLength(2);
    expect(snapshot.presentation.pages[0]?.header).toMatchObject({ variant: 'default', sourcePath: [0] });
    expect(snapshot.presentation.pages[0]?.footnotes[0]).toMatchObject({ id: 'note', sourcePath: [4] });
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

  it('provides explicit timed reflow cycles and deterministic teardown', () => {
    const document = schema().nodeFromJSON({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Measured' }] }],
    });
    const root = window.document.createElement('div');
    root.innerHTML = '<p data-fountain-path="0" data-height="20"></p>';
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      return rectangle(0, Number(this.dataset.height ?? 0));
    });
    const cycles: number[] = [];
    const controller = createDOMPageLayoutController(
      root,
      () => document,
      () => createPageGeometry({ size: { width: 100, height: 100 }, margins: 10 }),
      { observe: false, measurement: { lineFragmentNodeTypes: [] }, onLayout: (cycle) => cycles.push(cycle.revision) },
    );
    const cycle = controller.refreshNow('manual');
    expect(cycle).toMatchObject({ revision: 1, reason: 'manual', snapshot: { layout: { pages: [{ number: 1 }] } } });
    expect(cycle.durationMs).toBeGreaterThanOrEqual(0);
    expect(cycles).toEqual([1]);
    controller.destroy();
    expect(controller.isDestroyed).toBe(true);
    expect(() => controller.refreshNow()).toThrow(/destroyed/);
    controller.destroy();
  });

  it('fails closed when an external layout references a missing or duplicate measured fragment', () => {
    const source = Object.freeze({
      itemId: 'paragraph', fragmentId: 'paragraph:1', fragmentIndex: 0,
      kind: 'text-line' as const, sourcePath: Object.freeze([0]), partPaths: Object.freeze([]),
      clipOffset: 0, height: 10,
    });
    const measurement = Object.freeze({
      items: Object.freeze([]), fragmentSources: Object.freeze([source]), templates: Object.freeze([]),
      warnings: Object.freeze([]), measurementCount: 0,
    });
    const layout = Object.freeze({
      pages: Object.freeze([Object.freeze({
        number: 1,
        placements: Object.freeze([Object.freeze({
          itemId: 'paragraph', fragmentFrom: 0, fragmentTo: 2, height: 20,
          continuedBefore: false, continuedAfter: false,
        })]),
        footnotes: Object.freeze([]), usedHeight: 20, availableHeight: 100,
      })]),
      warnings: Object.freeze([]),
    });
    expect(() => projectDOMPageContent(measurement, layout)).toThrow(/no complete measured fragment source range/);
    expect(() => projectDOMPageContent({
      ...measurement,
      fragmentSources: [source, source],
    }, { ...layout, pages: [] })).toThrow(/duplicated/);
  });
});
