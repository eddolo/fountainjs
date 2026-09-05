// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoreExtension, Schema, composeExtensions } from '../src';
import { PagesExtension, createPageGeometry } from '../src/pages';
import {
  DOMEditablePageSurface,
  createDOMPageLayoutController,
  layoutDOMPages,
  measureDOMPageFlow,
  projectDOMPageContent,
  type DOMPageLayoutCycle,
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
    expect(measurement.contentWidth).toBe(100);
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

  it('turns real footnote line boxes into legal continuation fragments', () => {
    const document = schema().nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'Claim' },
          { type: 'footnote_reference', attrs: { id: 'long' } },
        ] },
        { type: 'footnote_definition', attrs: { id: 'long' }, content: [{
          type: 'paragraph', content: [{ type: 'text', text: 'One two three four' }],
        }] },
      ],
    });
    const root = window.document.createElement('div');
    root.innerHTML = `
      <p data-fountain-path="0" data-height="10">Claim<sup data-fountain-footnote-reference="long" data-height="5"></sup></p>
      <section data-fountain-path="1" data-fountain-footnote-definition="long" data-height="38"><p>One two three four</p></section>
    `;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      const top = this.dataset.fountainFootnoteDefinition ? 20 : 0;
      return rectangle(top, Number(this.dataset.height ?? 0));
    });

    let selected: Node | null = null;
    vi.spyOn(window.document, 'createRange').mockReturnValue({
      selectNodeContents: (node: Node) => { selected = node; },
      getClientRects: () => selected instanceof window.HTMLElement && selected.closest('[data-fountain-footnote-definition]')
        ? [rectangle(20, 8), rectangle(30, 8), rectangle(40, 8), rectangle(50, 8)] as unknown as DOMRectList
        : [] as unknown as DOMRectList,
      detach: () => {},
    } as unknown as Range);

    const snapshot = layoutDOMPages(
      root,
      document,
      createPageGeometry({ size: { width: 100, height: 50 }, margins: 10 }),
      { lineFragmentNodeTypes: ['paragraph'] },
    );

    expect(snapshot.measurement.items[0]?.fragments?.[0]?.footnotes).toMatchObject([{
      id: 'long',
      height: 38,
      fragments: [
        { id: 'long:line:1', height: 9 },
        { id: 'long:line:2', height: 10 },
        { id: 'long:line:3', height: 10 },
        { id: 'long:line:4', height: 9 },
      ],
    }]);
    expect(snapshot.layout.pages.map((page) => page.footnotes)).toMatchObject([
      [{ id: 'long', fragmentFrom: 0, fragmentTo: 2, height: 19, continuedAfter: true }],
      [{ id: 'long', fragmentFrom: 2, fragmentTo: 4, height: 19, continuedBefore: true }],
    ]);
    expect(snapshot.presentation.pages.map((page) => page.footnotes[0]?.sourcePath)).toEqual([[1], [1]]);
    expect(measureDOMPageFlow(root, document, { lineFragmentNodeTypes: [] })
      .items[0]?.fragments?.[0]?.footnotes).toEqual([{ id: 'long', height: 38 }]);
  });

  it('measures host-declared custom block fragments without changing the model', () => {
    const document = schema().nodeFromJSON({
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Custom surface' }] }],
    });
    const root = window.document.createElement('div');
    root.innerHTML = `
      <section data-fountain-path="0" data-top="0" data-height="70">
        <div data-custom-fragment="one" data-top="0" data-height="20">One</div>
        <div data-custom-fragment="two" data-top="25" data-height="20">Two</div>
        <div data-custom-fragment="three" data-top="50" data-height="20">Three</div>
      </section>
    `;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      return rectangle(Number(this.dataset.top ?? 0), Number(this.dataset.height ?? 0));
    });
    let context: unknown;
    const snapshot = layoutDOMPages(
      root,
      document,
      createPageGeometry({ size: { width: 100, height: 50 }, margins: 5 }),
      {
        lineFragmentNodeTypes: [],
        blockContinuation: (value) => {
          context = value;
          return {
            fragments: [...value.element.querySelectorAll<HTMLElement>('[data-custom-fragment]')],
            minimumStart: 1,
            minimumEnd: 1,
            continuationHeight: 3,
          };
        },
      },
    );

    expect(context).toMatchObject({ modelDocument: document, node: document.child(0), path: [0] });
    expect(Object.isFrozen(context)).toBe(true);
    expect(snapshot.measurement.items[0]).toMatchObject({
      id: 'block:0:paragraph',
      minimumStart: 1,
      minimumEnd: 1,
      continuationHeight: 3,
      fragments: [
        { id: 'block:0:paragraph:custom:1', height: 22.5 },
        { id: 'block:0:paragraph:custom:2', height: 25 },
        { id: 'block:0:paragraph:custom:3', height: 22.5 },
      ],
    });
    expect(snapshot.measurement.fragmentSources).toMatchObject([
      { kind: 'custom', fragmentIndex: 0, clipOffset: 0, height: 22.5 },
      { kind: 'custom', fragmentIndex: 1, clipOffset: 22.5, height: 25 },
      { kind: 'custom', fragmentIndex: 2, clipOffset: 47.5, height: 22.5 },
    ]);
    expect(snapshot.layout.pages).toHaveLength(3);
    expect(snapshot.content.pages.map((page) => page.placements[0]?.continuedBefore)).toEqual([
      false, true, true,
    ]);
    expect(document.textContent).toBe('Custom surface');

    expect(() => measureDOMPageFlow(root, document, {
      blockContinuation: ({ element }) => ({
        fragments: [element.querySelector<HTMLElement>('[data-custom-fragment]')!],
      }),
    })).toThrow(/at least two fragment elements/);
  });

  it('keeps a one-line rendered heading with the following block', () => {
    const document = schema().nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Lead' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'One-line heading' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Following paragraph' }] },
      ],
    });
    const root = window.document.createElement('div');
    root.innerHTML = `
      <p data-fountain-path="0" data-height="60">Lead</p>
      <h2 data-fountain-path="1" data-height="10">One-line heading</h2>
      <p data-fountain-path="2" data-height="40">Following paragraph</p>
    `;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      return rectangle(0, Number(this.dataset.height ?? 0));
    });

    const snapshot = layoutDOMPages(
      root,
      document,
      createPageGeometry({ size: { width: 100, height: 100 }, margins: 10 }),
      { lineFragmentNodeTypes: [] },
    );

    expect(snapshot.measurement.items[1]).toMatchObject({
      id: 'block:1:heading',
      height: 10,
      keepWithNext: true,
    });
    expect(snapshot.layout.pages.map((page) => page.placements.map((placement) => placement.itemId))).toEqual([
      ['block:0:paragraph'],
      ['block:1:heading', 'block:2:paragraph'],
    ]);
  });

  it('measures blockquotes at canonical direct-child boundaries with repeated container overhead', () => {
    const document = schema().nodeFromJSON({
      type: 'doc',
      content: [{
        type: 'blockquote',
        content: ['First quote block', 'Second quote block', 'Third quote block'].map((text) => ({
          type: 'paragraph', content: [{ type: 'text', text }],
        })),
      }],
    });
    const root = window.document.createElement('div');
    root.innerHTML = `
      <blockquote data-fountain-path="0" data-top="0" data-height="75">
        <p data-fountain-path="0.0" data-top="5" data-height="20">First quote block</p>
        <p data-fountain-path="0.1" data-top="25" data-height="20">Second quote block</p>
        <p data-fountain-path="0.2" data-top="45" data-height="20">Third quote block</p>
      </blockquote>
    `;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      return rectangle(Number(this.dataset.top ?? 0), Number(this.dataset.height ?? 0));
    });

    const snapshot = layoutDOMPages(
      root,
      document,
      createPageGeometry({ size: { width: 100, height: 70 }, margins: 10 }),
      { lineFragmentNodeTypes: [] },
    );

    expect(snapshot.measurement.items[0]).toMatchObject({
      id: 'block:0:blockquote',
      continuationHeight: 15,
      fragments: [
        { id: 'block:0:blockquote:child:1', height: 35 },
        { id: 'block:0:blockquote:child:2', height: 20 },
        { id: 'block:0:blockquote:child:3', height: 20 },
      ],
    });
    expect(snapshot.measurement.fragmentSources).toMatchObject([
      { kind: 'block-child', partPaths: [[0, 0]], height: 35 },
      { kind: 'block-child', partPaths: [[0, 1]], height: 20 },
      { kind: 'block-child', partPaths: [[0, 2]], height: 20 },
    ]);
    expect(snapshot.layout.warnings).toEqual([]);
    expect(snapshot.content.pages.map((page) => page.placements[0])).toMatchObject([
      { continuationHeight: 0, sources: [{ partPaths: [[0, 0]] }] },
      { continuationHeight: 15, sources: [{ partPaths: [[0, 1]] }] },
      { continuationHeight: 15, sources: [{ partPaths: [[0, 2]] }] },
    ]);
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

  it('groups complex table spans and repeats headers only when their rowspans stay inside the header', () => {
    const pageSchema = schema();
    const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const document = pageSchema.nodeFromJSON({
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          { type: 'table_row', content: [
            { type: 'table_header', attrs: { colspan: 2, rowspan: 1 }, content: [paragraph('Report')] },
            { type: 'table_header', attrs: { colspan: 1, rowspan: 2 }, content: [paragraph('Owner')] },
          ] },
          { type: 'table_row', content: [
            { type: 'table_header', content: [paragraph('Quarter')] },
            { type: 'table_header', content: [paragraph('Status')] },
          ] },
          { type: 'table_row', content: [
            { type: 'table_cell', attrs: { rowspan: 2 }, content: [paragraph('Group A')] },
            { type: 'table_cell', content: [paragraph('A1')] },
            { type: 'table_cell', content: [paragraph('Ada')] },
          ] },
          { type: 'table_row', content: [
            { type: 'table_cell', attrs: { colspan: 2 }, content: [paragraph('A2 merged')] },
          ] },
          { type: 'table_row', content: [
            { type: 'table_cell', content: [paragraph('Tail')] },
            { type: 'table_cell', attrs: { colspan: 2 }, content: [paragraph('Done')] },
          ] },
        ],
      }],
    });
    const root = window.document.createElement('div');
    root.innerHTML = `
      <table data-fountain-path="0" data-height="100"><tbody>
        <tr data-fountain-path="0.0" data-height="20"><th data-fountain-path="0.0.0" colspan="2">Report</th><th data-fountain-path="0.0.1" rowspan="2">Owner</th></tr>
        <tr data-fountain-path="0.1" data-height="20"><th data-fountain-path="0.1.0">Quarter</th><th data-fountain-path="0.1.1">Status</th></tr>
        <tr data-fountain-path="0.2" data-height="20"><td data-fountain-path="0.2.0" rowspan="2">Group A</td><td data-fountain-path="0.2.1">A1</td><td data-fountain-path="0.2.2">Ada</td></tr>
        <tr data-fountain-path="0.3" data-height="20"><td data-fountain-path="0.3.0" colspan="2">A2 merged</td></tr>
        <tr data-fountain-path="0.4" data-height="20"><td data-fountain-path="0.4.0">Tail</td><td data-fountain-path="0.4.1" colspan="2">Done</td></tr>
      </tbody></table>
    `;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      return rectangle(0, Number(this.dataset.height ?? 0));
    });

    const measurement = measureDOMPageFlow(root, document, { lineFragmentNodeTypes: [] });
    expect(measurement.items[0]?.continuationHeight).toBe(40);
    expect(measurement.fragmentSources).toMatchObject([
      { kind: 'table-row-group', partPaths: [[0, 0], [0, 1]], height: 40 },
      { kind: 'table-row-group', partPaths: [[0, 2], [0, 3]], height: 40 },
      { kind: 'table-row-group', partPaths: [[0, 4]], height: 20 },
    ]);

    const leaking = root.querySelector<HTMLTableCellElement>('[data-fountain-path="0.0.1"]');
    if (!leaking) throw new Error('Expected the complex header cell.');
    leaking.rowSpan = 3;
    const unsafe = measureDOMPageFlow(root, document, { lineFragmentNodeTypes: [] });
    expect(unsafe.items[0]?.continuationHeight).toBeUndefined();
    expect(unsafe.fragmentSources[0]?.partPaths).toEqual([[0, 0], [0, 1], [0, 2], [0, 3]]);
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

  it('remeasures only changed top-level content during mutation cycles', () => {
    const pageSchema = schema();
    let document = pageSchema.nodeFromJSON({
      type: 'doc',
      content: Array.from({ length: 100 }, (_, index) => ({
        type: 'paragraph', content: [{ type: 'text', text: `Block ${index}` }],
      })),
    });
    const root = window.document.createElement('div');
    root.innerHTML = document.content.map((_node, index) => (
      `<p data-fountain-path="${index}" data-height="20">Block ${index}</p>`
    )).join('');
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      return rectangle(0, Number(this.dataset.height ?? 0));
    });
    const controller = createDOMPageLayoutController(
      root,
      () => document,
      createPageGeometry({ size: { width: 100, height: 100 }, margins: 10 }),
      { observe: false, measurement: { lineFragmentNodeTypes: [] } },
    );

    const initial = controller.refreshNow('initial').snapshot.measurement.measurementCount;
    const unchanged = controller.refreshNow('mutation').snapshot.measurement.measurementCount;
    const replacement = pageSchema.nodeFromJSON({
      type: 'paragraph', content: [{ type: 'text', text: 'Changed block' }],
    });
    document = document.copy(document.content.map((node, index) => index === 50 ? replacement : node));
    (root.children[50] as HTMLElement).dataset.height = '30';
    const changed = controller.refreshNow('mutation').snapshot;
    const fullResize = controller.refreshNow('resize').snapshot.measurement.measurementCount;

    expect(initial).toBe(101);
    expect(unchanged).toBe(1);
    expect(changed.measurement.measurementCount).toBe(2);
    expect(changed.measurement.items[50]?.height).toBe(30);
    expect(fullResize).toBe(initial);
    controller.destroy();

    const uncached = createDOMPageLayoutController(
      root,
      () => document,
      createPageGeometry({ size: { width: 100, height: 100 }, margins: 10 }),
      { observe: false, incremental: false, measurement: { lineFragmentNodeTypes: [] } },
    );
    uncached.refreshNow('initial');
    expect(uncached.refreshNow('mutation').snapshot.measurement.measurementCount).toBe(101);
    uncached.destroy();
  });

  it('reuses and rebases cached geometry when unchanged rendered blocks shift paths', () => {
    const pageSchema = schema();
    let document = pageSchema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'page_header', attrs: { variant: 'default' }, content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Header' }] },
        ] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
        { type: 'bullet_list', content: [
          { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }] },
          { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }] },
        ] },
        { type: 'page_break' },
      ],
    });
    const root = window.document.createElement('div');
    root.innerHTML = `
      <header data-fountain-path="0" data-height="10">Header</header>
      <p data-fountain-path="1" data-height="20">Body</p>
      <ul data-fountain-path="2" data-height="30">
        <li data-fountain-path="2.0" data-height="15">One</li>
        <li data-fountain-path="2.1" data-height="15">Two</li>
      </ul>
      <hr data-fountain-path="3" data-height="0">
    `;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      return rectangle(0, Number(this.dataset.height ?? 0));
    });
    const controller = createDOMPageLayoutController(
      root,
      () => document,
      createPageGeometry({ size: { width: 100, height: 100 }, margins: 10 }),
      { observe: false, measurement: { lineFragmentNodeTypes: [] } },
    );
    controller.refreshNow('initial');

    const rebaseRenderedPaths = () => [...root.children].forEach((child, index) => {
      const element = child as HTMLElement;
      element.querySelectorAll<HTMLElement>('[data-fountain-path]').forEach((descendant) => {
        const path = descendant.dataset.fountainPath?.split('.') ?? [];
        descendant.dataset.fountainPath = [index, ...path.slice(1)].join('.');
      });
      element.dataset.fountainPath = String(index);
    });
    const leading = pageSchema.nodeFromJSON({
      type: 'paragraph', content: [{ type: 'text', text: 'Before' }],
    });
    const leadingElement = window.document.createElement('p');
    leadingElement.dataset.fountainPath = '0';
    leadingElement.dataset.height = '16';
    leadingElement.textContent = 'Before';
    root.prepend(leadingElement);
    rebaseRenderedPaths();
    document = document.copy([leading, ...document.content]);

    const inserted = controller.refreshNow('mutation').snapshot.measurement;
    expect(inserted.measurementCount).toBe(2);
    expect(inserted.templates[0]?.path).toEqual([1]);
    expect(inserted.items.map((item) => item.id)).toEqual([
      'block:0:paragraph', 'block:2:paragraph', 'block:3:bullet_list', 'block:4:page_break',
    ]);
    expect(inserted.fragmentSources.filter((source) => source.itemId === 'block:3:bullet_list'))
      .toMatchObject([
        { sourcePath: [3], partPaths: [[3, 0]] },
        { sourcePath: [3], partPaths: [[3, 1]] },
      ]);

    leadingElement.remove();
    rebaseRenderedPaths();
    document = document.copy(document.content.slice(1));
    const removed = controller.refreshNow('mutation').snapshot.measurement;
    expect(removed.measurementCount).toBe(1);
    expect(removed.templates[0]?.path).toEqual([0]);
    expect(removed.items.map((item) => item.id)).toEqual([
      'block:1:paragraph', 'block:2:bullet_list', 'block:3:page_break',
    ]);
    expect(removed.fragmentSources.filter((source) => source.itemId === 'block:2:bullet_list'))
      .toMatchObject([
        { sourcePath: [2], partPaths: [[2, 0]] },
        { sourcePath: [2], partPaths: [[2, 1]] },
      ]);
    controller.destroy();
  });

  it('invalidates the owning top-level cache entry for observed DOM mutations', async () => {
    const document = schema().nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
      ],
    });
    const root = window.document.createElement('div');
    root.innerHTML = '<p data-fountain-path="0" data-height="20">First</p><p data-fountain-path="1" data-height="20">Second</p>';
    const reads: string[] = [];
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      reads.push(this.dataset.fountainPath ?? 'root');
      return rectangle(0, Number(this.dataset.height ?? 0));
    });
    const cycles: DOMPageLayoutCycle[] = [];
    const controller = createDOMPageLayoutController(
      root,
      () => document,
      createPageGeometry({ size: { width: 100, height: 100 }, margins: 10 }),
      {
        measurement: { lineFragmentNodeTypes: [] },
        onLayout: (cycle) => cycles.push(cycle),
      },
    );
    controller.refreshNow('initial');
    cycles.length = 0;
    reads.length = 0;

    const first = root.children[0] as HTMLElement;
    first.dataset.height = '30';
    first.textContent = 'Browser-normalized text';
    await vi.waitFor(() => expect(cycles).toHaveLength(1));

    expect(cycles[0]?.reason).toBe('mutation');
    expect(cycles[0]?.snapshot.measurement.items[0]?.height).toBe(30);
    expect(reads).toEqual(['root', '0']);
    controller.destroy();
  });

  it('remeasures cached references when a footnote definition height changes', () => {
    const pageSchema = schema();
    let document = pageSchema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'Claim' },
          { type: 'footnote_reference', attrs: { id: 'proof' } },
        ] },
        { type: 'footnote_definition', attrs: { id: 'proof' }, content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Evidence' }] },
        ] },
      ],
    });
    const root = window.document.createElement('div');
    root.innerHTML = `
      <p data-fountain-path="0" data-height="20">Claim<sup data-fountain-path="0.1" data-fountain-footnote-reference="proof" data-height="5"></sup></p>
      <section data-fountain-path="1" data-height="14">Evidence</section>
    `;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      return rectangle(0, Number(this.dataset.height ?? 0));
    });
    const controller = createDOMPageLayoutController(
      root,
      () => document,
      createPageGeometry({ size: { width: 100, height: 100 }, margins: 10 }),
      { observe: false, measurement: { lineFragmentNodeTypes: [] } },
    );
    const initial = controller.refreshNow('initial').snapshot;
    expect(initial.measurement.items[0]?.fragments?.[0]?.footnotes).toEqual([{ id: 'proof', height: 14 }]);
    expect(controller.refreshNow('mutation').snapshot.measurement.measurementCount).toBe(1);

    const definition = document.child(1).copy([
      pageSchema.nodeFromJSON({ type: 'paragraph', content: [{ type: 'text', text: 'Longer evidence' }] }),
    ]);
    document = document.copy([document.child(0), definition]);
    (root.children[1] as HTMLElement).dataset.height = '22';
    const changed = controller.refreshNow('mutation').snapshot;
    expect(changed.measurement.items[0]?.fragments?.[0]?.footnotes).toEqual([{ id: 'proof', height: 22 }]);
    expect(changed.measurement.measurementCount).toBeGreaterThan(1);
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
      footnoteSources: Object.freeze([]), warnings: Object.freeze([]), contentWidth: 100, measurementCount: 0,
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

  it('places whole editable blocks over page shells without changing the editor tree', () => {
    const pageSchema = schema();
    const document = pageSchema.nodeFromJSON({
      type: 'doc',
      content: Array.from({ length: 3 }, (_, index) => ({
        type: 'paragraph', content: [{ type: 'text', text: `Editable block ${index + 1}` }],
      })),
    });
    const host = window.document.createElement('div');
    const root = window.document.createElement('div');
    root.className = 'fountain-editor';
    root.contentEditable = 'true';
    document.content.forEach((node, index) => {
      const paragraph = window.document.createElement('p');
      paragraph.dataset.fountainNode = node.type.name;
      paragraph.dataset.fountainPath = String(index);
      paragraph.style.margin = '0';
      paragraph.textContent = node.textContent;
      root.appendChild(paragraph);
    });
    host.appendChild(root);
    window.document.body.appendChild(host);
    const originalChildren = [...root.children];
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      if (this === host) return { ...rectangle(0, 40), width: 200, right: 200 } as DOMRect;
      if (this === root) return { ...rectangle(0, 120), width: 100, right: 100 } as DOMRect;
      const index = Number(this.dataset.fountainPath ?? 0);
      return rectangle(index * 40, 40);
    });
    const geometry = createPageGeometry({ size: { width: 120, height: 100 }, margins: 10 });
    const snapshot = layoutDOMPages(root, document, geometry, { lineFragmentNodeTypes: [] });
    expect(snapshot.layout.pages).toHaveLength(2);

    const surface = new DOMEditablePageSurface(root, geometry, { gap: 20, className: 'host-pages' });
    const result = surface.update(geometry, snapshot);

    expect(result.mode).toBe('paged');
    expect(result.issues).toEqual([]);
    expect(result.pages).toHaveLength(2);
    expect(host.firstElementChild).toBe(surface.shells);
    expect([...root.children]).toEqual(originalChildren);
    expect(root.querySelectorAll(':scope > [data-fountain-editable-page="1"]')).toHaveLength(2);
    expect(root.querySelectorAll(':scope > [data-fountain-editable-page="2"]')).toHaveLength(1);
    expect((root.children[2] as HTMLElement).style.getPropertyValue('--fountain-editable-page-shift')).toBe('50px');
    expect(surface.shells.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);

    surface.destroy();
    expect(host.firstElementChild).toBe(root);
    expect(host.classList.contains('fountain-editable-pages')).toBe(false);
    expect(host.classList.contains('host-pages')).toBe(false);
    expect(root.querySelectorAll('[data-fountain-editable-page]')).toHaveLength(0);
    expect([...root.children]).toEqual(originalChildren);
    host.remove();
  });

  it('keeps canonical page intent editable in rails and projects read-only furniture', () => {
    const pageSchema = schema();
    const document = pageSchema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'page_header', attrs: { variant: 'default' }, content: [{
          type: 'paragraph', content: [
            { type: 'text', text: 'Header ' },
            { type: 'page_field', attrs: { kind: 'page-number' } },
          ],
        }] },
        { type: 'paragraph', content: [
          { type: 'text', text: 'Claim' },
          { type: 'footnote_reference', attrs: { id: 'note' } },
        ] },
        { type: 'page_break' },
        { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
        { type: 'page_footer', attrs: { variant: 'default' }, content: [{
          type: 'paragraph', content: [{ type: 'text', text: 'Footer' }],
        }] },
        { type: 'footnote_definition', attrs: { id: 'note' }, content: [{
          type: 'paragraph', content: [{ type: 'text', text: 'Evidence' }],
        }] },
      ],
    });
    const host = window.document.createElement('div');
    const root = window.document.createElement('div');
    root.innerHTML = `
      <header data-fountain-node="page_header" data-fountain-path="0" data-fountain-page-header="default"><p data-fountain-path="0.0">Header <span data-fountain-path="0.0.1" data-fountain-page-field="page-number">{page}</span></p></header>
      <p data-fountain-node="paragraph" data-fountain-path="1">Claim<sup data-fountain-path="1.1" data-fountain-footnote-reference="note">note</sup></p>
      <hr data-fountain-node="page_break" data-fountain-path="2">
      <p data-fountain-node="paragraph" data-fountain-path="3">After</p>
      <footer data-fountain-node="page_footer" data-fountain-path="4" data-fountain-page-footer="default"><p data-fountain-path="4.0">Footer</p></footer>
      <section data-fountain-node="footnote_definition" data-fountain-path="5" data-fountain-footnote-definition="note"><p data-fountain-path="5.0">Evidence</p></section>
    `;
    host.appendChild(root);
    window.document.body.appendChild(host);
    const children = [...root.children];
    const geometryByPath = new Map<string, readonly [number, number]>([
      ['0', [0, 10]], ['1', [15, 30]], ['2', [45, 0]],
      ['3', [50, 20]], ['4', [75, 10]], ['5', [90, 14]],
    ] as const);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      if (this === host) return { ...rectangle(0, 120), width: 200, right: 200 } as DOMRect;
      if (this === root) return { ...rectangle(0, 104), width: 100, right: 100 } as DOMRect;
      const [top, height] = geometryByPath.get(this.dataset.fountainPath ?? '') ?? [0, 0];
      return rectangle(top, height);
    });
    const geometry = createPageGeometry({
      size: { width: 120, height: 100 }, margins: 10, headerHeight: 10, footerHeight: 10,
    });
    const snapshot = layoutDOMPages(root, document, geometry, { lineFragmentNodeTypes: [] });
    expect(snapshot.layout.pages).toHaveLength(2);
    const surface = new DOMEditablePageSurface(root, geometry, { gap: 20 });

    expect(surface.update(geometry, snapshot)).toMatchObject({ mode: 'paged', issues: [] });
    expect([...root.children]).toEqual(children);
    expect((children[0] as HTMLElement).dataset.fountainEditablePageIntent).toBe('header');
    expect((children[4] as HTMLElement).dataset.fountainEditablePageIntent).toBe('footer');
    expect((children[5] as HTMLElement).dataset.fountainEditablePageIntent).toBe('footnote');
    expect((children[4] as HTMLElement).style.getPropertyValue('--fountain-editable-page-intent-shift')).toBe('195px');
    expect(surface.shells.querySelectorAll('[data-fountain-editable-page-template^="header:default"]')).toHaveLength(2);
    expect(surface.shells.querySelectorAll('[data-fountain-editable-page-template^="footer:default"]')).toHaveLength(2);
    expect(surface.shells.querySelectorAll('[data-fountain-editable-page-footnote="note"]')).toHaveLength(1);
    expect([...surface.shells.querySelectorAll<HTMLElement>('[data-fountain-editable-page-template^="header"]')]
      .map((element) => element.textContent?.trim())).toEqual(['Header 1', 'Header 2']);
    expect(surface.shells.querySelectorAll('[data-fountain-path], [data-fountain-text-path], [id]')).toHaveLength(0);

    surface.prepare(geometry, 2);
    expect(surface.shells.childElementCount).toBe(0);
    expect(root.querySelectorAll('[data-fountain-editable-page-intent]')).toHaveLength(0);
    expect((children[4] as HTMLElement).style.getPropertyValue('--fountain-editable-page-intent-shift')).toBe('');

    root.insertBefore(children[0]!, children[4]!);
    expect(surface.update(geometry, snapshot)).toMatchObject({
      mode: 'continuous',
      issues: [{
        code: 'unplaced-page-intent',
        path: [0],
        detail: 'Canonical page headers must precede document body content in editable page mode.',
      }],
    });
    expect(surface.shells.childElementCount).toBe(0);
    expect(root.querySelectorAll('[data-fountain-editable-page-intent]')).toHaveLength(0);
    root.insertBefore(children[0]!, root.firstChild);

    surface.destroy();
    expect([...root.children]).toEqual(children);
    host.remove();
  });

  it('decorates canonical list items at page boundaries and restores their original styles', () => {
    const pageSchema = schema();
    const document = pageSchema.nodeFromJSON({
      type: 'doc',
      content: [{
        type: 'ordered_list',
        attrs: { start: 4 },
        content: Array.from({ length: 4 }, (_, index) => ({
          type: 'list_item',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: `Item ${index + 4}` }] }],
        })),
      }],
    });
    const host = window.document.createElement('div');
    const root = window.document.createElement('div');
    const list = window.document.createElement('ol');
    list.dataset.fountainNode = 'ordered_list';
    list.dataset.fountainPath = '0';
    list.start = 4;
    const items = document.content[0]!.content.map((node, index) => {
      const item = window.document.createElement('li');
      item.dataset.fountainNode = node.type.name;
      item.dataset.fountainPath = `0.${index}`;
      const paragraph = window.document.createElement('p');
      paragraph.dataset.fountainNode = 'paragraph';
      paragraph.dataset.fountainPath = `0.${index}.0`;
      paragraph.textContent = node.textContent;
      item.appendChild(paragraph);
      list.appendChild(item);
      return item;
    });
    root.appendChild(list);
    host.appendChild(root);
    window.document.body.appendChild(host);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      if (this === host) return { ...rectangle(0, 40), width: 200, right: 200 } as DOMRect;
      if (this === root || this === list) return { ...rectangle(0, 160), width: 100, right: 100 } as DOMRect;
      if (this.tagName === 'LI') {
        const index = Number(this.dataset.fountainPath?.split('.')[1] ?? 0);
        const precedingSpacing = items.slice(0, index + 1).reduce((sum, item) => (
          sum + Number.parseFloat(item.style.marginBlockStart || '0')
        ), 0);
        return rectangle(index * 40 + precedingSpacing, 40);
      }
      return rectangle(0, 40);
    });
    const geometry = createPageGeometry({ size: { width: 120, height: 100 }, margins: 10 });
    const snapshot = layoutDOMPages(root, document, geometry);
    expect(snapshot.layout.pages).toHaveLength(2);
    const surface = new DOMEditablePageSurface(root, geometry, { gap: 20 });

    expect(surface.update(geometry, snapshot)).toMatchObject({ mode: 'paged', issues: [] });
    expect(items[2]!.dataset.fountainEditableListBreak).toBe('2');
    expect(items[2]!.style.marginBlockStart).toBe('40px');
    expect(list.start).toBe(4);
    expect([...list.children]).toEqual(items);

    surface.prepare(geometry, 2);
    expect(items[2]!.hasAttribute('data-fountain-editable-list-break')).toBe(false);
    expect(items[2]!.style.marginBlockStart).toBe('');
    expect(surface.update(geometry, snapshot).mode).toBe('paged');
    surface.destroy();
    expect(items[2]!.hasAttribute('data-fountain-editable-list-break')).toBe(false);
    expect(items[2]!.style.marginBlockStart).toBe('');
    expect([...list.children]).toEqual(items);
    host.remove();
  });

  it('inserts reversible table spacers at row-safe boundaries and repeats read-only headers', () => {
    const pageSchema = schema();
    const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const document = pageSchema.nodeFromJSON({
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          { type: 'table_row', content: [{ type: 'table_header', content: [paragraph('Heading')] }] },
          ...Array.from({ length: 3 }, (_, index) => ({
            type: 'table_row',
            content: [{ type: 'table_cell', content: [paragraph(`Value ${index + 1}`)] }],
          })),
        ],
      }],
    });
    const host = window.document.createElement('div');
    const root = window.document.createElement('div');
    const table = window.document.createElement('table');
    table.dataset.fountainNode = 'table';
    table.dataset.fountainPath = '0';
    const body = window.document.createElement('tbody');
    const rows = document.content[0]!.content.map((node, rowIndex) => {
      const row = window.document.createElement('tr');
      row.dataset.fountainNode = 'table_row';
      row.dataset.fountainPath = `0.${rowIndex}`;
      const cell = window.document.createElement(rowIndex === 0 ? 'th' : 'td');
      cell.dataset.fountainNode = rowIndex === 0 ? 'table_header' : 'table_cell';
      cell.dataset.fountainPath = `0.${rowIndex}.0`;
      const content = window.document.createElement('div');
      content.className = 'fountain-table-cell__content';
      content.textContent = node.textContent;
      cell.appendChild(content);
      row.appendChild(cell);
      body.appendChild(row);
      return row;
    });
    table.appendChild(body);
    root.appendChild(table);
    host.appendChild(root);
    window.document.body.appendChild(host);
    const spacerHeightBefore = (row: HTMLTableRowElement) => [...body.children]
      .slice(0, [...body.children].indexOf(row))
      .filter((candidate) => (candidate as HTMLElement).dataset.fountainWidget === 'editable-table-break')
      .reduce((sum, candidate) => sum + Number.parseFloat(
        (candidate.firstElementChild as HTMLElement | null)?.style.getPropertyValue('--fountain-editable-table-break-size') || '0',
      ), 0);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      if (this === host) return { ...rectangle(0, 40), width: 200, right: 200 } as DOMRect;
      if (this === root) return { ...rectangle(0, 160), width: 100, right: 100 } as DOMRect;
      if (this === table) {
        const spacers = [...table.querySelectorAll<HTMLElement>('[data-fountain-editable-table-break]')]
          .reduce((sum, spacer) => sum + Number.parseFloat(
            (spacer.firstElementChild as HTMLElement | null)?.style.getPropertyValue('--fountain-editable-table-break-size') || '0',
          ), 0);
        return rectangle(0, 160 + spacers);
      }
      if (this.tagName === 'TR' && this.dataset.fountainWidget === 'editable-table-break') {
        return rectangle(0, Number.parseFloat(
          (this.firstElementChild as HTMLElement | null)?.style.getPropertyValue('--fountain-editable-table-break-size') || '0',
        ));
      }
      if (this.tagName === 'TR') {
        const index = Number(this.dataset.fountainPath?.split('.')[1] ?? 0);
        return rectangle(index * 40 + spacerHeightBefore(this as HTMLTableRowElement), 40);
      }
      return rectangle(0, 40);
    });
    const geometry = createPageGeometry({ size: { width: 120, height: 100 }, margins: 10 });
    const snapshot = layoutDOMPages(root, document, geometry);
    expect(snapshot.layout.pages).toHaveLength(3);
    const surface = new DOMEditablePageSurface(root, geometry, { gap: 20 });

    expect(surface.update(geometry, snapshot)).toMatchObject({ mode: 'paged', issues: [] });
    const breaks = [...table.querySelectorAll<HTMLTableRowElement>('[data-fountain-editable-table-break]')];
    expect(table.dataset.fountainEditableTableSplit).toBe('true');
    expect(breaks.map((row) => row.dataset.fountainEditableTableBreak)).toEqual(['2', '3']);
    expect(breaks.map((row) => row.dataset.fountainWidget)).toEqual(['editable-table-break', 'editable-table-break']);
    expect(breaks.every((row) => row.getAttribute('aria-hidden') === 'true' && row.contentEditable === 'false')).toBe(true);
    expect(rows.every((row) => body.contains(row))).toBe(true);
    expect([...body.querySelectorAll('tr[data-fountain-path]')]).toEqual(rows);
    const headers = [...surface.shells.querySelectorAll<HTMLTableElement>('[data-fountain-editable-table-header]')];
    expect(headers.map((header) => header.dataset.fountainEditableTableHeader)).toEqual(['2', '3']);
    expect(headers.every((header) => header.textContent === 'Heading' && !header.querySelector('[data-fountain-path]'))).toBe(true);

    surface.prepare(geometry, 3);
    expect(table.querySelectorAll('[data-fountain-editable-table-break]')).toHaveLength(0);
    expect(table.hasAttribute('data-fountain-editable-table-split')).toBe(false);
    expect(surface.shells.querySelectorAll('[data-fountain-editable-table-header]')).toHaveLength(0);
    expect([...body.querySelectorAll('tr[data-fountain-path]')]).toEqual(rows);
    expect(surface.update(geometry, snapshot).mode).toBe('paged');
    surface.destroy();
    expect(table.querySelectorAll('[data-fountain-editable-table-break]')).toHaveLength(0);
    expect(table.hasAttribute('data-fountain-editable-table-split')).toBe(false);
    expect([...body.querySelectorAll('tr[data-fountain-path]')]).toEqual(rows);
    host.remove();
  });

  it('falls back to one continuous editable tree when a source would span pages', () => {
    const pageSchema = schema();
    const document = pageSchema.nodeFromJSON({
      type: 'doc',
      content: Array.from({ length: 3 }, (_, index) => ({
        type: 'paragraph', content: [{ type: 'text', text: `Block ${index + 1}` }],
      })),
    });
    const host = window.document.createElement('div');
    const root = window.document.createElement('div');
    document.content.forEach((node, index) => {
      const paragraph = window.document.createElement('p');
      paragraph.dataset.fountainNode = node.type.name;
      paragraph.dataset.fountainPath = String(index);
      paragraph.style.margin = '0';
      root.appendChild(paragraph);
    });
    host.appendChild(root);
    window.document.body.appendChild(host);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      if (this === host) return { ...rectangle(0, 40), width: 200, right: 200 } as DOMRect;
      if (this === root) return { ...rectangle(0, 120), width: 100, right: 100 } as DOMRect;
      return rectangle(Number(this.dataset.fountainPath ?? 0) * 40, 40);
    });
    const geometry = createPageGeometry({ size: { width: 120, height: 100 }, margins: 10 });
    const measured = layoutDOMPages(root, document, geometry, { lineFragmentNodeTypes: [] });
    const first = measured.content.pages[0]!.placements[0]!;
    const secondPage = measured.content.pages[1]!;
    const fragmented = {
      ...measured,
      content: {
        pages: [
          measured.content.pages[0],
          {
            ...secondPage,
            placements: [{ ...first, fragmentFrom: 1, fragmentTo: 2 }],
          },
        ],
      },
    } as typeof measured;
    const surface = new DOMEditablePageSurface(root, geometry);
    const result = surface.update(geometry, fragmented);

    expect(result.mode).toBe('continuous');
    expect(result.pages).toEqual([]);
    expect(result.issues).toMatchObject([{
      code: 'fragmented-editable-source', path: [0],
    }]);
    expect(root.querySelectorAll('[data-fountain-editable-page]')).toHaveLength(0);
    expect([...root.children]).toHaveLength(3);
    surface.destroy();
    host.remove();
  });

  it('uses continuous editing when the host cannot fit a complete page sheet', () => {
    const pageSchema = schema();
    const document = pageSchema.nodeFromJSON({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Narrow container' }] }],
    });
    const host = window.document.createElement('div');
    const root = window.document.createElement('div');
    const paragraph = window.document.createElement('p');
    paragraph.dataset.fountainNode = 'paragraph';
    paragraph.dataset.fountainPath = '0';
    root.appendChild(paragraph);
    host.appendChild(root);
    window.document.body.appendChild(host);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      if (this === host) return { ...rectangle(0, 40), width: 110, right: 110 } as DOMRect;
      if (this === root) return { ...rectangle(0, 40), width: 100, right: 100 } as DOMRect;
      return rectangle(0, 40);
    });
    const geometry = createPageGeometry({ size: { width: 120, height: 100 }, margins: 10 });
    const snapshot = layoutDOMPages(root, document, geometry, { lineFragmentNodeTypes: [] });
    const surface = new DOMEditablePageSurface(root, geometry, { gap: 20 });
    const result = surface.update(geometry, snapshot);

    expect(result.mode).toBe('continuous');
    expect(result.pages).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(host.dataset.fountainEditablePagesMode).toBe('continuous');
    expect(root.querySelectorAll('[data-fountain-editable-page]')).toHaveLength(0);
    surface.destroy();
    host.remove();
  });
});
