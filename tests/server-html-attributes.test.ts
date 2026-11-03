import { describe, expect, it, vi } from 'vitest';
import { parse, parseFragment } from 'parse5';
import { adapter, type Htmlparser2TreeAdapterMap } from 'parse5-htmlparser2-tree-adapter';
import { CoreExtension, Schema, composeExtensions, defineExtension, type HTMLParseElement } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const requests = ['data-probe', 'DATA-PROBE', 'missing', 'data-empty', 'constructor', '__proto__', 'toString',
  'style', 'viewBox', 'VIEWBOX', 'preserveAspectRatio', 'definitionURL', 'xlink:href', 'href', 'xml:lang', 'lang'];
const sources = [
  '<p data-empty="" constructor="own" __proto__="literal" toString="value">Text</p>',
  '<p ID="first" id="ignored" DATA-EMPTY="" data-empty="ignored" data-number="0">Duplicates</p>',
  '<svg viewBox="0 0 10 20" preserveAspectRatio="xMidYMid"><use xlink:href="#shape" xml:lang="en" /></svg>',
  '<math definitionURL="https://example.com/definition"><mi mathvariant="bold">x</mi></math>',
  '<p data-empty="&#0;&amp;&quot;&#13;\t" title="😀" STYLE="color:red">Entities</p>',
  '<p ' + Array.from({ length: 32 }, (_, index) => `data-item-${index}="value-${index}"`).join(' ') + '>Many attributes</p>',
];

function snapshot(element: HTMLParseElement) {
  const names = [...element.getAttributeNames!()];
  return { tag: element.tagName, names, reads: [...requests, ...names, ...names.map(name => name.toUpperCase())]
    .map(name => [name, element.getAttribute(name), element.hasAttribute(name)]) };
}

describe('read-only server HTML attributes', () => {
  for (const method of ['parseWithReport', 'parseFragmentWithReport'] as const) {
    it.each(sources)(`${method} matches the parser attribute-list oracle: %s`, body => {
      const source = `<div data-probe="root">${body}</div>`;
      const tree = (method === 'parseWithReport' ? parse : parseFragment)<Htmlparser2TreeAdapterMap>(source, { treeAdapter: adapter });
      const expected: ReturnType<typeof snapshot>[] = [];
      const visit = (node: Htmlparser2TreeAdapterMap['node'], active = false): void => {
        if (!adapter.isElementNode(node)) {
          if ('children' in node) node.children.forEach(child => visit(child, active));
          return;
        }
        const attributes = adapter.getAttrList(node);
        active ||= attributes.some(attribute => attribute.name === 'data-probe' && attribute.value === 'root');
        if (active) {
          const getAttribute = (name: string) => attributes.find(attribute => attribute.name.toLowerCase() === name.toLowerCase())?.value ?? null;
          expected.push(snapshot({ tagName: adapter.getTagName(node).toLowerCase(), textContent: '', style: {}, dataset: {},
            getAttribute, hasAttribute: name => getAttribute(name) !== null, getAttributeNames: () => attributes.map(attribute => attribute.name) }));
        }
        adapter.getChildNodes(node).forEach(child => visit(child, active));
      };
      visit(tree);
      let observed: ReturnType<typeof snapshot>[] = [];
      const target = new Schema(composeExtensions([CoreExtension, defineExtension({ name: 'attribute-oracle', marks: {
        probe: { parseHTML: [{ tag: '[data-probe="root"]', getAttrs(element) {
          observed = [element, ...Array.from(element.querySelectorAll!('*'))].map(snapshot);
          return false;
        } }] },
      } })]).schema);
      ServerHTMLImporter[method](source, target);
      expect(observed).toEqual(expected);
    });
  }

  it('does not allocate parser attribute-list objects for repeated read-only inspection', () => {
    let allocated = -1;
    const lists = vi.spyOn(adapter, 'getAttrList');
    const target = new Schema(composeExtensions([CoreExtension, defineExtension({ name: 'attribute-allocation', marks: {
      probe: { parseHTML: [{ tag: '[data-probe]', getAttrs(element) {
        const before = lists.mock.calls.length;
        for (let repeat = 0; repeat < 500; repeat++) {
          expect(element.getAttribute('DATA-PROBE')).toBe('value');
          expect(element.getAttribute('missing')).toBeNull();
          expect(element.hasAttribute('data-empty')).toBe(true);
          expect(Object.isFrozen(element.getAttributeNames!())).toBe(true);
        }
        allocated = lists.mock.calls.length - before;
        return false;
      } }] },
    } })]).schema);
    try { ServerHTMLImporter.parse('<p data-probe="value" data-empty="">Text</p>', target); }
    finally { lists.mockRestore(); }
    expect(allocated).toBe(0);
  });
});
