// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { Node, Schema } from '../src/core/schema';
import { CoreSchemaSpec } from '../src/extensions';
import { containedTextDirection, sharedTextDirections } from '../src/core/first-strong-direction';
import { sharedDirectionDOMAttributes, sharedDirectionGroup } from '../src/core/shared-direction';
import { createSharedDirectionIndex } from '../src/core/shared-direction-index';

const schema = new Schema(CoreSchemaSpec);
const p = (text: string, attrs = {}) => schema.node('paragraph', attrs, [schema.text(text)]);
const member = (group: string, children: Node[]) => schema.node('blockquote', { dir: 'auto', directionGroup: group }, children);
const document = (children: Node[]) => schema.node('doc', {}, children);

describe('immutable shared-direction indexing', () => {
  it('reuses free-flow summaries for local automatic owners without changing nested boundaries', () => {
    const index = createSharedDirectionIndex(sharedDirectionGroup);
    const roots = [schema.text('שלום'), member('a', [p('123 😀'), p('שלום')]),
      member('a', [member('b', [p('שלום')]), p('English')]),
      member('a', [member('a', [p('שלום')]), p('English')]),
      schema.node('blockquote', { dir: 'auto' }, [p('שלום', { dir: 'auto' }), p('123 😀')]),
      schema.node('blockquote', { dir: 'auto' }, [p('שלום', { dir: 'rtl' }), p('English')]),
      schema.node('blockquote', { dir: 'auto' }, []),
    ];
    for (const root of roots) expect(index.contained(root)).toBe(containedTextDirection(root));
    const root = roots[1]!;
    const calls = vi.spyOn(Node.prototype, 'child');
    try { expect(index.contained(root)).toBe('rtl'); expect(calls).not.toHaveBeenCalled(); }
    finally { calls.mockRestore(); }
  });
  it('does not traverse unchanged unrelated subtrees again after a text edit', () => {
    const unrelated = Array.from({ length: 1000 }, (_, index) => p(`Unrelated ${index}`));
    const anchor = member('shared', [p('שלום')]), tail = member('shared', [p('English')]);
    const original = document([anchor, ...unrelated, tail]);
    expect(sharedDirectionDOMAttributes(tail, original).dir).toBe('rtl');
    const changed = document([member('shared', [p('Latin שלום')]), ...unrelated, tail]);
    const untouched = new Set(unrelated);
    const calls = vi.spyOn(Node.prototype, 'child');
    try {
      expect(sharedDirectionDOMAttributes(tail, changed).dir).toBe('ltr');
      expect(calls.mock.instances.filter(node => node instanceof Node && untouched.has(node)).length).toBe(0);
    } finally { calls.mockRestore(); }
    expect(sharedDirectionDOMAttributes(tail, original).dir).toBe('rtl');
  });

  it('matches the independent full fold across nested same/different groups and exclusions', () => {
    const sources = [
      [member('a', [member('a', [p('שלום')]), p('Latin')]), member('a', [p('tail')])],
      [member('a', [p('שלום'), member('a', [p('Latin')])]), member('a', [p('tail')])],
      [member('a', [member('b', [p('Latin')]), p('שלום')]), member('b', [p('tail')])],
      [member('a', [p('Latin', { dir: 'ltr' }), p('123😀')]), member('a', [p('שלום')])],
      [member('a', [p('שלום', { dir: 'auto' }), p('123😀')]), member('a', [p('Latin')])],
      [member('a', [p('123😀')]), member('a', [p('٠١٢')]), member('b', [p('Latin')])],
    ];
    for (const children of sources) {
      const doc = document(children), expected = sharedTextDirections(doc, sharedDirectionGroup);
      const pending = [doc];
      while (pending.length) {
        const node = pending.pop()!, group = sharedDirectionGroup(node);
        if (group) expect(sharedDirectionDOMAttributes(node, doc).dir).toBe(expected.get(group) ?? 'ltr');
        pending.push(...node.content);
      }
    }
  });

  it('does not traverse unchanged same-group members again after an anchor edit', () => {
    const members = Array.from({ length: 1000 }, (_, index) => member('shared', [p(`Member ${index}`)]));
    const original = document([member('shared', [p('שלום')]), ...members]);
    expect(sharedDirectionDOMAttributes(members[0]!, original).dir).toBe('rtl');
    const changed = document([member('shared', [p('Latin שלום')]), ...members]);
    const untouched = new Set(members), calls = vi.spyOn(Node.prototype, 'child');
    try {
      expect(sharedDirectionDOMAttributes(members[0]!, changed).dir).toBe('ltr');
      expect(calls.mock.instances.filter(node => node instanceof Node && untouched.has(node)).length).toBe(0);
    } finally { calls.mockRestore(); }
  });

  it('recomputes after deletion, reordering and explicit direction barriers without stale snapshots', () => {
    const rtl = member('a', [p('שלום')]), ltr = member('a', [p('Latin')]);
    for (const children of [[rtl, ltr], [ltr, rtl], [ltr], [rtl], [member('a', [p('שלום', { dir: 'rtl' })]), ltr]]) {
      const doc = document(children), expected = sharedTextDirections(doc, sharedDirectionGroup);
      for (const node of children) expect(sharedDirectionDOMAttributes(node, doc).dir).toBe(expected.get('a') ?? 'ltr');
    }
  });

  it('matches the full fold on 500 deterministic mixed trees with reused subtrees', () => {
    let seed = 0x517ab1;
    const random = (limit: number) => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit; };
    const attrs = () => {
      const choice = random(7);
      return choice < 3 ? { dir: 'auto', directionGroup: ['a', 'b', 'c'][choice] }
        : choice < 6 ? { dir: ['ltr', 'rtl', 'auto'][choice - 3] } : {};
    };
    const texts = ['Latin', 'שלום', 'العربية', '123😀', '\u200f', '\u0301', '𞤀', ''];
    const pool = Array.from({ length: 30 }, () => p(texts[random(texts.length)]!, attrs()));
    const tree = (depth: number): Node => depth === 0 || random(3) === 0 ? pool[random(pool.length)]!
      : schema.node('blockquote', attrs(), Array.from({ length: 1 + random(4) }, () => tree(depth - 1)));
    const indexed = createSharedDirectionIndex(sharedDirectionGroup);
    for (let index = 0; index < 500; index += 1) {
      const doc = document(Array.from({ length: 1 + random(5) }, () => tree(4)));
      expect([...indexed(doc)]).toEqual([...sharedTextDirections(doc, sharedDirectionGroup)]);
    }
  });

  it('handles a 10,000-deep shared context iteratively', () => {
    let child = p('שלום');
    for (let depth = 0; depth < 10_000; depth += 1) child = schema.nodes.blockquote.create({}, [child]);
    const root = document([member('deep', [child])]);
    expect([...createSharedDirectionIndex(sharedDirectionGroup)(root)]).toEqual([['deep', 'rtl']]);
  });

  it('excludes captured raw bodies, isolated inert descendants and attribute-only labels', () => {
    const isolatedSchema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      html_inert_raw_text: { inline: true, group: 'inline', content: 'text*' },
      html_inert_inline: { inline: true, group: 'inline', content: 'inline*' },
      custom_label: { group: 'block', atom: true, attrs: { label: { default: '' } } },
    } });
    const text = isolatedSchema.text.bind(isolatedSchema);
    const paragraph = isolatedSchema.node('paragraph', {}, [
      isolatedSchema.node('html_inert_raw_text', {}, [text('Latin script source')]),
      isolatedSchema.node('html_inert_inline', { attributes: { dir: 'RTL' } }, [text('Latin isolated')]),
      text('שלום eligible'),
    ]);
    const root = isolatedSchema.node('doc', {}, [isolatedSchema.node('blockquote', { dir: 'auto', directionGroup: 'a' }, [
      isolatedSchema.node('custom_label', { label: 'Latin attribute is not text' }), paragraph,
    ])]);
    expect([...createSharedDirectionIndex(sharedDirectionGroup)(root)]).toEqual([['a', 'rtl']]);
    expect([...sharedTextDirections(root, sharedDirectionGroup)]).toEqual([['a', 'rtl']]);
  });

  it('keeps a 100,000-block changing document indexed without revisiting unchanged block contents', () => {
    const members = Array.from({ length: 99_999 }, (_, index) => p(`Member ${index}`, { dir: 'auto', directionGroup: 'wide' }));
    const indexed = createSharedDirectionIndex(sharedDirectionGroup);
    const original = document([p('שלום', { dir: 'auto', directionGroup: 'wide' }), ...members]);
    expect(indexed(original).get('wide')).toBe('rtl');
    const untouched = new Set(members), calls = vi.spyOn(Node.prototype, 'child');
    try {
      for (const text of ['Latin שלום', 'العربية', '123', '𞤀', 'Latin restored']) {
        const changed = document([p(text, { dir: 'auto', directionGroup: 'wide' }), ...members]);
        expect(indexed(changed).get('wide')).toBe(['العربية', '𞤀'].includes(text) ? 'rtl' : 'ltr');
      }
      expect(calls.mock.instances.filter(node => node instanceof Node && untouched.has(node)).length).toBe(0);
    } finally { calls.mockRestore(); }
    expect(indexed(original).get('wide')).toBe('rtl');
  });
});
