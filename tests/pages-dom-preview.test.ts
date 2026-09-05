// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoreExtension, Schema, composeExtensions } from '../src';
import { PagesExtension, createPageGeometry } from '../src/pages';
import { layoutDOMPages } from '../src/pages/dom';
import { renderDOMPagePreview } from '../src/pages/preview';

function schema() {
  return new Schema(composeExtensions([CoreExtension, PagesExtension]).schema);
}

function rectangle(top: number, height: number): DOMRect {
  return {
    x: 0, y: top, top, bottom: top + height, left: 0, right: 80,
    width: 80, height, toJSON: () => ({}),
  } as DOMRect;
}

afterEach(() => vi.restoreAllMocks());

describe('read-only DOM page preview', () => {
  it('renders repeated furniture, fields, body slices, and linked footnotes without touching the editor', () => {
    const document = schema().nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'page_header', attrs: { variant: 'default' }, content: [{
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Page ' },
            { type: 'page_field', attrs: { kind: 'page-number' } },
            { type: 'text', text: ' / ' },
            { type: 'page_field', attrs: { kind: 'page-count' } },
          ],
        }] },
        { type: 'paragraph', content: [
          { type: 'text', text: 'Claim' },
          { type: 'footnote_reference', attrs: { id: 'proof' } },
        ] },
        { type: 'page_break' },
        { type: 'paragraph', content: [{ type: 'text', text: 'After break' }] },
        { type: 'page_footer', attrs: { variant: 'default' }, content: [{
          type: 'paragraph', content: [{ type: 'text', text: 'Confidential' }],
        }] },
        { type: 'footnote_definition', attrs: { id: 'proof' }, content: [{
          type: 'paragraph', content: [{ type: 'text', text: 'Evidence' }],
        }] },
      ],
    });
    const source = window.document.createElement('div');
    source.contentEditable = 'true';
    source.innerHTML = `
      <header data-fountain-path="0" data-fountain-page-header="default" data-height="8"><p data-fountain-path="0.0">Page <span class="fountain-page-field" data-fountain-path="0.0.1" data-fountain-page-field="page-number" data-fountain-selected-node="true">{page}</span> / <span class="fountain-page-field" data-fountain-path="0.0.3" data-fountain-page-field="page-count">{pages}</span></p></header>
      <p data-fountain-path="1" data-height="20">Claim<sup data-fountain-path="1.1" data-fountain-footnote-reference="proof"><a href="#fountain-footnote-proof">proof</a></sup></p>
      <hr data-fountain-path="2" data-fountain-page-break="true" data-height="0">
      <p data-fountain-path="3" data-height="20">After break</p>
      <footer data-fountain-path="4" data-fountain-page-footer="default" data-height="8"><p data-fountain-path="4.0">Confidential</p></footer>
      <section id="fountain-footnote-proof" data-fountain-path="5" data-fountain-footnote-definition="proof" data-height="10"><p data-fountain-path="5.0">Evidence</p></section>
    `;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      return rectangle(Number(this.dataset.fountainPath?.split('.')[0] ?? 0) * 30, Number(this.dataset.height ?? 0));
    });
    const geometry = createPageGeometry({
      size: { width: 100, height: 70 }, margins: 10, headerHeight: 8, footerHeight: 8,
    });
    const snapshot = layoutDOMPages(source, document, geometry, { lineFragmentNodeTypes: [] });
    const before = source.outerHTML;
    const target = window.document.createElement('div');

    const result = renderDOMPagePreview(source, target, geometry, snapshot, {
      ariaLabel: 'Report preview',
      className: 'report compact',
    });

    expect(result.pages).toHaveLength(2);
    expect(result.printPageName).toBe('fountain-preview-w100-h70');
    expect(target.querySelector('style[data-fountain-page-print-style]')?.textContent)
      .toContain('@page { size: 100px 70px; margin: 0; }');
    expect(target.querySelector('style[data-fountain-page-print-style]')?.textContent)
      .toContain('@page fountain-preview-w100-h70 { size: 100px 70px; margin: 0; }');
    expect(result.pages.every((page) => page.style.getPropertyValue('page') === result.printPageName)).toBe(true);
    expect(target.getAttribute('aria-label')).toBe('Report preview');
    expect(target.classList.contains('report')).toBe(true);
    expect(target.classList.contains('compact')).toBe(true);
    expect(target.querySelectorAll('.fountain-page-preview__accessible')).toHaveLength(1);
    expect(target.querySelectorAll('[data-fountain-page]')).toHaveLength(2);
    expect(result.pages.every((page) => page.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(result.pages[0]?.querySelector('.fountain-page-preview__header')?.textContent).toContain('Page 1 / 2');
    expect(result.pages[1]?.querySelector('.fountain-page-preview__header')?.textContent).toContain('Page 2 / 2');
    expect(result.pages.flatMap((page) => [...page.querySelectorAll('.fountain-page-field')])).toHaveLength(0);
    expect(result.pages.flatMap((page) => [...page.querySelectorAll('[data-fountain-selected-node]')])).toHaveLength(0);
    expect(result.pages[0]?.querySelector('.fountain-page-preview__footer')?.textContent).toContain('Confidential');
    expect(result.pages[0]?.querySelector('[data-fountain-page-break]')).toBeNull();
    expect(result.pages[1]?.querySelector('.fountain-page-preview__content')?.textContent).toContain('After break');
    const reference = result.pages[0]?.querySelector<HTMLAnchorElement>('[data-fountain-footnote-reference] a');
    const definition = result.pages[0]?.querySelector<HTMLElement>('[data-fountain-footnote-definition]');
    expect(reference?.getAttribute('href')).toBe(`#${definition?.id}`);
    expect(reference?.getAttribute('tabindex')).toBe('-1');
    expect(target.querySelector('[contenteditable="true"]')).toBeNull();
    expect(source.outerHTML).toBe(before);
    expect(Object.isFrozen(result.pages)).toBe(true);
  });

  it('normalizes physical page CSS and names without floating-point artifacts', () => {
    const document = schema().nodeFromJSON({
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Physical page' }] }],
    });
    const source = window.document.createElement('div');
    source.innerHTML = '<p data-fountain-path="0" data-height="10">Physical page</p>';
    let measuredWidth = 0;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      const height = Number(this.dataset.height ?? 0);
      return {
        x: 0, y: 0, top: 0, bottom: height, left: 0, right: measuredWidth,
        width: measuredWidth, height, toJSON: () => ({}),
      } as DOMRect;
    });

    for (const format of [
      {
        size: 'a4', cssWidth: '793.700787', cssHeight: '1122.519685',
        pageName: 'fountain-preview-w793p700787-h1122p519685',
      },
      {
        size: 'letter', cssWidth: '816', cssHeight: '1056',
        pageName: 'fountain-preview-w816-h1056',
      },
    ] as const) {
      const geometry = createPageGeometry({
        size: format.size, margins: 12.7, unitsPerMillimetre: 96 / 25.4,
      });
      measuredWidth = geometry.size.width - geometry.margins.left - geometry.margins.right;
      const snapshot = layoutDOMPages(source, document, geometry, { lineFragmentNodeTypes: [] });
      const target = window.document.createElement('div');
      const result = renderDOMPagePreview(source, target, geometry, snapshot);

      expect(result.printPageName).toBe(format.pageName);
      expect(target.querySelector('style[data-fountain-page-print-style]')?.textContent)
        .toContain(`@page { size: ${format.cssWidth}px ${format.cssHeight}px; margin: 0; }`);
      expect(result.pages[0]?.style.getPropertyValue('page')).toBe(format.pageName);
    }
  });

  it('keeps only assigned ordered-list items and continues numbering on later pages', () => {
    const document = schema().nodeFromJSON({
      type: 'doc',
      content: [{
        type: 'ordered_list',
        content: [1, 2, 3].map((number) => ({
          type: 'list_item',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: `Item ${number}` }] }],
        })),
      }],
    });
    const source = window.document.createElement('div');
    source.innerHTML = `
      <ol data-fountain-path="0" data-height="60">
        <li data-fountain-path="0.0" data-height="20">Item 1</li>
        <li data-fountain-path="0.1" data-height="20">Item 2</li>
        <li data-fountain-path="0.2" data-height="20">Item 3</li>
      </ol>
    `;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      return rectangle(Number(this.dataset.fountainPath?.split('.').at(-1) ?? 0) * 20, Number(this.dataset.height ?? 0));
    });
    const geometry = createPageGeometry({ size: { width: 100, height: 60 }, margins: 10 });
    const snapshot = layoutDOMPages(source, document, geometry);
    const target = window.document.createElement('div');

    const result = renderDOMPagePreview(source, target, geometry, snapshot, {
      includeAccessibleDocument: false,
      includePrintStyles: false,
    });

    expect(result.pages).toHaveLength(2);
    expect(result.printPageName).toBeUndefined();
    expect(target.querySelector('[data-fountain-page-print-style]')).toBeNull();
    expect(result.pages[0]?.querySelectorAll('li')).toHaveLength(2);
    expect(result.pages[1]?.querySelectorAll('li')).toHaveLength(1);
    expect(result.pages[1]?.querySelector('ol')?.getAttribute('start')).toBe('3');
    expect(result.pages[1]?.textContent).toContain('Item 3');
    expect(result.pages[1]?.textContent).not.toContain('Item 1');
  });

  it('repeats table header rows while retaining only the assigned continuation rows', () => {
    const paragraph = (text: string) => ({
      type: 'paragraph', content: [{ type: 'text', text }],
    });
    const document = schema().nodeFromJSON({
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          { type: 'table_row', content: [{ type: 'table_header', content: [paragraph('Heading')] }] },
          { type: 'table_row', content: [{ type: 'table_cell', content: [paragraph('First')] }] },
          { type: 'table_row', content: [{ type: 'table_cell', content: [paragraph('Second')] }] },
        ],
      }],
    });
    const source = window.document.createElement('div');
    source.innerHTML = `
      <table data-fountain-path="0" data-height="40"><tbody>
        <tr data-fountain-path="0.0" data-height="10"><th>Heading</th></tr>
        <tr data-fountain-path="0.1" data-height="15"><td>First</td></tr>
        <tr data-fountain-path="0.2" data-height="15"><td>Second</td></tr>
      </tbody></table>
    `;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
      return rectangle(Number(this.dataset.fountainPath?.split('.').at(-1) ?? 0) * 15, Number(this.dataset.height ?? 0));
    });
    const geometry = createPageGeometry({
      size: { width: 100, height: 45 },
      margins: { top: 5, right: 10, bottom: 5, left: 10 },
    });
    const snapshot = layoutDOMPages(source, document, geometry);
    const target = window.document.createElement('div');

    const result = renderDOMPagePreview(source, target, geometry, snapshot, { includeAccessibleDocument: false });

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.querySelectorAll('tr')).toHaveLength(2);
    expect(result.pages[0]?.textContent).toContain('First');
    expect(result.pages[0]?.textContent).not.toContain('Second');
    expect(result.pages[1]?.querySelectorAll('tr')).toHaveLength(2);
    expect(result.pages[1]?.querySelector('tr:first-child th')?.textContent).toBe('Heading');
    expect(result.pages[1]?.textContent).toContain('Second');
    expect(result.pages[1]?.textContent).not.toContain('First');
  });

  it('rejects preview geometry that would reflow content at a different width', () => {
    const document = schema().nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph' }] });
    const source = window.document.createElement('div');
    source.innerHTML = '<p data-fountain-path="0" data-height="10"></p>';
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rectangle(0, 10));
    const measuredGeometry = createPageGeometry({ size: { width: 100, height: 100 }, margins: 10 });
    const snapshot = layoutDOMPages(source, document, measuredGeometry, { lineFragmentNodeTypes: [] });
    const mismatched = createPageGeometry({ size: { width: 120, height: 100 }, margins: 10 });
    expect(() => renderDOMPagePreview(
      source,
      window.document.createElement('div'),
      mismatched,
      snapshot,
    )).toThrow(/must match the measured editor width/);
  });

  it('rejects nested source and target elements before either tree can be replaced', () => {
    const parent = window.document.createElement('div');
    const child = window.document.createElement('div');
    parent.appendChild(child);
    const geometry = createPageGeometry({ size: { width: 100, height: 100 }, margins: 10 });
    expect(() => renderDOMPagePreview(
      parent,
      child,
      geometry,
      {} as never,
    )).toThrow(/separate source and target/);
    expect(parent.contains(child)).toBe(true);
    expect(() => renderDOMPagePreview(
      child,
      parent,
      geometry,
      {} as never,
    )).toThrow(/separate source and target/);
    expect(parent.contains(child)).toBe(true);
  });
});
