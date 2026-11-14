import { expect, it } from 'vitest';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import live from '../integrations/gitlab/fixtures/footnote-live-html.json';
import { GitLabFootnotePositions } from '../integrations/gitlab/services/footnote_positions';

type RawNode = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
const attr = (node: Element, name: string) => node.attrs.find(item => item.name === name)?.value;
function elements(node: RawNode): Element[] {
  return [...('tagName' in node ? [node] : []), ...('childNodes' in node ? node.childNodes.flatMap(elements) : [])];
}
function labels(source: string, body: string) {
  const positions = new GitLabFootnotePositions(source);
  const refs: string[] = [], definitions: string[] = [];
  for (const element of elements(parseFragment(body))) {
    const reference = element.tagName === 'sup' && element.childNodes.some(child =>
      'tagName' in child && child.tagName === 'a' && attr(child, 'data-footnote-ref') !== undefined);
    const parent = element.parentNode;
    const definition = element.tagName === 'li' && parent && 'tagName' in parent && parent.tagName === 'ol'
      && parent.parentNode && 'tagName' in parent.parentNode && attr(parent.parentNode, 'data-footnotes') !== undefined;
    if (!reference && !definition) continue;
    const span = positions.read(attr(element, 'data-sourcepos') ?? '');
    expect(span, `Unmapped ${element.tagName} position ${attr(element, 'data-sourcepos')}`).toBeDefined();
    const raw = source.slice(span!.from, span!.to);
    const label = /^\[\^([^\]\u0000-\u0020\u007f]+)\]/u.exec(raw)?.[1];
    expect(label, `Position must point at the source label: ${raw}`).toBeDefined();
    if (reference) expect(raw).toBe(`[^${label}]`);
    (reference ? refs : definitions).push(label!);
  }
  return { refs, definitions };
}

it.each(live.fixtures)('maps actual $name host positions without a DOM or generated-anchor identity', fixture => {
  expect(typeof globalThis.document).toBe('undefined');
  const mapped = labels(fixture.source, fixture.body);
  const literal = ['space', 'header-example', 'code', 'escaped', 'unreferenced', 'missing', 'raw-html'].includes(fixture.name);
  expect(mapped.refs.length > 0).toBe(!literal);
  expect(mapped.definitions.length > 0).toBe(!literal);
});
it.each([
  ['repeated', ['alpha', 'alpha'], ['alpha']],
  ['case', ['Alpha', 'alpha'], ['Alpha']],
  ['unicode', ['épreuve'], ['épreuve']],
  ['unicode-space', ['non\u00a0breaking'], ['non\u00a0breaking']],
  ['punctuation', ['a.b:c%41'], ['a.b:c%41']],
  ['nested-definition', ['q'], ['q']],
  ['duplicate', ['a'], ['a', 'a']],
] as const)('retains exact %s labels separately from safe internal IDs', (name, refs, definitions) => {
  const fixture = live.fixtures.find(item => item.name === name)!;
  expect(labels(fixture.source, fixture.body)).toEqual({ refs, definitions });
});
it('refuses columns inside UTF-8 characters and never splits a surrogate pair', () => {
  const source = 'é𝛼x', positions = new GitLabFootnotePositions(source);
  expect(positions.read('1:1-1:2')).toEqual({ from: 0, to: 1 });
  expect(positions.read('1:3-1:6')).toEqual({ from: 1, to: 3 });
  const symbol = positions.read('1:3-1:6')!;
  expect(source.slice(symbol.from, symbol.to)).toBe('𝛼');
  for (const value of ['1:2-1:2', '1:3-1:5', '1:4-1:6']) expect(positions.read(value)).toBeUndefined();
});
it.each(['\n', '\r\n', '\r'])('preserves exact multiline source offsets with %j newlines', newline => {
  const source = `é${newline}[^𝛼]: Body.`, positions = new GitLabFootnotePositions(source);
  const span = positions.read('1:1-2:14')!;
  expect(source.slice(span.from, span.to)).toBe(source);
  const note = positions.read('2:1-2:14')!;
  expect(source.slice(note.from, note.to)).toBe('[^𝛼]: Body.');
});
it.each(['', '0:1-1:1', '1:0-1:1', '1:1-1:0', '1:2-1:1', '2:1-1:1', '1:1-3:1',
  '1:999-1:999', '1:1-1:999', '9007199254740993:1-9007199254740993:1', ' 1:1-1:1', '1:1-1:1suffix'])('refuses invalid or out-of-bounds source position %j', value => {
  expect(new GitLabFootnotePositions('ab\ncd').read(value)).toBeUndefined();
});
it('bounds source bytes and refuses lossy Unicode before making source mappings', () => {
  expect(() => new GitLabFootnotePositions('é', 1)).toThrow('byte limit');
  expect(() => new GitLabFootnotePositions('\r\n', 1)).toThrow('byte limit');
  expect(() => new GitLabFootnotePositions('\ud800')).toThrow('Unicode scalar');
  expect(() => new GitLabFootnotePositions('\udc00')).toThrow('Unicode scalar');
  for (const limit of [-1, NaN, Infinity, 1.5]) expect(() => new GitLabFootnotePositions('', limit)).toThrow('byte limit');
});
