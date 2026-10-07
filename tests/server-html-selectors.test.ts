import { describe, expect, it, vi } from 'vitest';
import * as selectors from 'css-select';
import { parse, parseFragment } from 'parse5';
import { adapter, type Htmlparser2TreeAdapterMap } from 'parse5-htmlparser2-tree-adapter';
import { CoreExtension, Schema, composeExtensions, defineExtension } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

type RawNode = Htmlparser2TreeAdapterMap['node'];
type RawElement = Htmlparser2TreeAdapterMap['element'];

vi.mock('css-select', { spy: true });

describe('tree-owned server HTML selector compilation', () => {
  it('compiles repeated rules once per tree, not once per element or across imports', () => {
    const schema = new Schema(composeExtensions([CoreExtension]).schema);
    const importer = new ServerHTMLImporter();
    const source = '<p><strong>Bold</strong> and plain text.</p>'.repeat(1000);
    const compile = vi.spyOn(selectors, 'compile');
    let first: string[]; let second: string[];
    try {
      expect(importer.parse(source, schema).childCount).toBe(1000);
      first = compile.mock.calls.map(call => String(call[0]));
      compile.mockClear();
      expect(importer.parse('<p>Separate tree</p>', schema).textContent).toBe('Separate tree');
      second = compile.mock.calls.map(call => String(call[0]));
    } finally { compile.mockRestore(); }
    expect(first!.filter(tag => tag === '[style]')).toHaveLength(1);
    expect(second!.filter(tag => tag === '[style]')).toHaveLength(1);
    expect(first!.length).toBe(new Set(first!).size);
  });

  it('matches the uncached selector oracle across relatives, scopes and separate trees', () => {
    const queries = ['span[data-case]', ':has(> em)', ':has(+ span)', ':is(span, p)',
      ':not([hidden])', 'p > span:first-child', 'p > span:nth-child(2)', ':scope',
      '> em', 'p:has(> span[data-case="one"])', 'span:not(:has(em))'];
    const sources = [
      '<p data-case="parent"><span data-case="one"><em>Child</em></span><span data-case="two">Plain</span></p>',
      '<p data-case="parent" hidden><span data-case="two">Plain</span><span data-case="one"><em>Other</em></span></p>',
      '<section><p data-case="parent"><span data-case="one">No child</span></p><p><span data-case="two"><em>Different parent</em></span></p></section>',
    ];
    let observed = new Set<string>();
    const marks = Object.fromEntries(queries.map((tag, index) => [`probe_${index}`, {
      parseHTML: [{ tag, getAttrs(element: { getAttribute(name: string): string | null }) {
        const id = element.getAttribute('data-case');
        if (id) observed.add(`${index}:${id}`);
        return {};
      } }],
    }]));
    const schema = new Schema(composeExtensions([CoreExtension, defineExtension({ name: 'selector-oracle', marks })]).schema);
    const importer = new ServerHTMLImporter();
    for (let repeat = 0; repeat < 3; repeat++) for (const source of sources) {
      for (const method of ['parseWithReport', 'parseFragmentWithReport'] as const) {
        const tree = (method === 'parseWithReport' ? parse : parseFragment)<Htmlparser2TreeAdapterMap>(source, { treeAdapter: adapter });
        const elements = selectors.selectAll<RawNode, RawElement>('[data-case]', tree.children);
        const expected = new Set<string>();
        for (const [index, query] of queries.entries()) for (const element of elements) {
          if (selectors.is<RawNode, RawElement>(element, query, { cacheResults: false })) {
            const id = adapter.getAttrList(element).find(attribute => attribute.name === 'data-case')!.value;
            expected.add(`${index}:${id}`);
          }
        }
        observed = new Set();
        importer[method](source, schema);
        expect([...observed].sort()).toEqual([...expected].sort());
      }
    }
  });

  it('evicts bounded entries without changing later rule matches or invalid-selector reports', () => {
    const marks = Object.fromEntries(Array.from({ length: 270 }, (_, index) => [`probe_${index}`, {
      parseHTML: [{ tag: `[data-probe="${index}"]` }],
    }]));
    marks.invalid = { parseHTML: [{ tag: '[[bad' }] };
    const schema = new Schema(composeExtensions([CoreExtension, defineExtension({ name: 'selector-eviction', marks })]).schema);
    const source = '<p><span data-probe="0">First</span><span data-probe="269">Last</span><span data-probe="0">Again</span></p>';
    const importer = new ServerHTMLImporter();
    const originalSet = Map.prototype.set;
    let maximumEntries = 0;
    const set = vi.spyOn(Map.prototype, 'set').mockImplementation(function (this: Map<unknown, unknown>, key, value) {
      const result = originalSet.call(this, key, value);
      if (typeof key === 'string' && typeof value === 'function') maximumEntries = Math.max(maximumEntries, this.size);
      return result;
    });
    try {
      for (let repeat = 0; repeat < 2; repeat++) {
        const result = importer.parseWithReport(source, schema);
        expect(result.document.child(0).content.map(node => node.marks.map(mark => mark.type.name))).toEqual([
          ['probe_0'], ['probe_269'], ['probe_0'],
        ]);
        expect(result.issues.filter(issue => issue.code === 'invalid-selector')).toEqual([
          expect.objectContaining({ selector: '[[bad', contribution: 'mark:invalid' }),
        ]);
      }
    } finally { set.mockRestore(); }
    expect(maximumEntries).toBe(256);
  });
});
