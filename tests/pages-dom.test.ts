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
      warnings: Object.freeze([]), contentWidth: 100, measurementCount: 0,
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
