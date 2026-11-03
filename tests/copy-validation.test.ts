import { afterEach, describe, expect, it, vi } from 'vitest';
import { Node, Schema, type SchemaSpec } from '../src/headless';

function fixture(count = 160, expression = 'block+') {
  const spec: SchemaSpec = { nodes: {
    doc: { content: expression },
    paragraph: { group: 'block', content: 'inline*', attrs: {
      rank: { default: 0, validate: value => Number.isInteger(value) && Number(value) >= 0 },
    } },
    heading: { group: 'block', content: 'inline*' },
    media: { group: 'block', atom: true },
    text: { group: 'inline', inline: true },
  }, marks: { strong: {} } };
  const schema = new Schema(spec);
  const paragraph = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
  const doc = schema.node('doc', { metadata: { author: 'retained' } },
    Array.from({ length: count }, (_, index) => paragraph(`paragraph ${index}`)));
  schema.validate(doc);
  return { schema, spec, paragraph, doc };
}

function replace(doc: Node, index: number, child: Node): Node {
  const content = [...doc.content];
  content[index] = child;
  return doc.copy(content);
}

afterEach(() => vi.restoreAllMocks());

describe('validation of immutable wide document copies', () => {
  it.each([1000, 10000])('bounds validation probes for one edit among %i blocks', count => {
    const { doc, schema, paragraph } = fixture(count);
    const next = replace(doc, count - 1, paragraph('changed'));
    const probes = vi.spyOn(WeakSet.prototype, 'has');
    schema.validate(next);
    const calls = probes.mock.calls.length;
    probes.mockRestore();
    expect(calls).toBeLessThan(20);
    expect(next.child(count - 1).textContent).toBe('changed');
    expect(doc.child(count - 1).textContent).toBe(`paragraph ${count - 1}`);
    expect(next.attrs).toEqual(doc.attrs);
  });

  it.each([0, 63, 64, 80, 159])('validates replacement attributes at child %i', index => {
    const { doc, schema } = fixture();
    const invalid = doc.child(index).withAttrs({ rank: -1 });
    expect(() => schema.validate(replace(doc, index, invalid))).toThrow('Invalid value for attribute: rank');
    expect(() => schema.validate(doc)).not.toThrow();
  });

  it('validates descendants even when the replacement has the same node type', () => {
    const { doc, schema } = fixture();
    const invalid = doc.child(100).copy([schema.node('media')]);
    expect(() => schema.validate(replace(doc, 100, invalid))).toThrow('Content of paragraph');
  });

  it('rejects foreign children and foreign marks inside newly changed subtrees', () => {
    const { doc, schema } = fixture();
    const foreign = fixture();
    expect(() => schema.validate(replace(doc, 100, foreign.doc.child(0)))).toThrow('Foreign node');
    const marked = schema.node('paragraph', {}, [schema.text('foreign', [foreign.schema.mark('strong')])]);
    expect(() => schema.validate(replace(doc, 100, marked))).toThrow('Foreign mark');
  });

  it('rechecks grammar when a replacement changes type', () => {
    const strict = fixture(160, 'paragraph+');
    expect(() => strict.schema.validate(replace(strict.doc, 100, strict.schema.node('heading'))))
      .toThrow('Content of doc');
    const flexible = fixture();
    expect(() => flexible.schema.validate(replace(flexible.doc, 100, flexible.schema.node('heading'))))
      .not.toThrow();
  });

  it('checks ordered grammar, cardinality and newly inserted nodes', () => {
    const { doc, schema, paragraph, spec } = fixture();
    spec.nodes.doc.content = 'paragraph+ heading';
    const base = doc.copy([...doc.content, schema.node('heading')]);
    schema.validate(base);
    const inserted = base.copy([paragraph('inserted'), ...base.content]);
    expect(() => schema.validate(inserted)).not.toThrow();
    const deleted = inserted.copy(inserted.content.slice(1));
    expect(() => schema.validate(deleted)).not.toThrow();
    expect(() => schema.validate(base.copy(base.content.slice(0, -1)))).toThrow('Content of doc');
    expect(() => schema.validate(base.copy([base.child(base.childCount - 1), ...base.content.slice(0, -1)])))
      .toThrow('Content of doc');
    const bad = paragraph('bad').withAttrs({ rank: -2 });
    expect(() => schema.validate(base.copy([bad, ...base.content]))).toThrow('Invalid value for attribute');
  });

  it('does not trust an unvalidated intermediate copy', () => {
    const { doc, schema, paragraph } = fixture();
    const invalid = replace(doc, 159, doc.child(159).withAttrs({ rank: -1 }));
    const final = replace(invalid, 0, paragraph('another edit'));
    expect(() => schema.validate(final)).toThrow('Invalid value for attribute');
  });

  it('does not certify a document with mutable host-owned child attributes', () => {
    class HostValue { valid = true; }
    const { doc, schema, paragraph, spec } = fixture();
    spec.nodes.paragraph.attrs!.host = { default: null, validate: value => value === null || (value as HostValue).valid };
    const value = new HostValue();
    const host = replace(doc, 50, doc.child(50).withAttrs({ rank: 0, host: value }));
    schema.validate(host);
    value.valid = false;
    expect(() => schema.validate(replace(host, 159, paragraph('elsewhere')))).toThrow('Invalid value for attribute: host');
  });

  it('does not certify mutable mark attributes in unchanged siblings', () => {
    class HostValue { valid = true; }
    const { doc, schema, paragraph, spec } = fixture();
    spec.marks!.strong.attrs = { host: { validate: value => (value as HostValue).valid } };
    const value = new HostValue();
    const marked = schema.node('paragraph', {}, [schema.text('marked', [schema.mark('strong', { host: value })])]);
    const host = replace(doc, 50, marked);
    schema.validate(host);
    value.valid = false;
    expect(() => schema.validate(replace(host, 159, paragraph('elsewhere')))).toThrow('Invalid value for attribute: host');
  });

  it('checks current root content declarations', () => {
    const { doc, schema, paragraph, spec } = fixture();
    const base = replace(doc, 0, schema.node('heading'));
    schema.validate(base);
    spec.nodes.doc.content = 'paragraph+';
    expect(() => schema.validate(replace(base, 159, paragraph('changed')))).toThrow('Content of doc');
  });

  it('checks current group declarations even when all child types are unchanged', () => {
    const { doc, schema, paragraph, spec } = fixture();
    spec.nodes.paragraph.group = 'different';
    expect(() => schema.validate(replace(doc, 159, paragraph('changed')))).toThrow('Content of doc');
  });

  it('checks current literal type names', () => {
    const { doc, schema, paragraph } = fixture(160, 'paragraph+');
    Object.defineProperty(schema.nodes.paragraph, 'name', { value: 'renamed' });
    expect(() => schema.validate(replace(doc, 159, paragraph('changed')))).toThrow('Content of doc');
  });

  it('does not certify accessor-based group membership', () => {
    const { doc, schema, paragraph, spec } = fixture();
    let group = 'block';
    let reads = 0;
    Object.defineProperty(spec.nodes.paragraph, 'group', { get: () => { reads++; return group; } });
    const base = doc.copy();
    schema.validate(base);
    group = 'different';
    reads = 0;
    expect(() => schema.validate(replace(base, 159, paragraph('changed')))).toThrow('Content of doc');
    expect(reads).toBeGreaterThan(0);
  });

  it('captures grammar before a descendant validator can change a declaration', () => {
    const { doc, schema, paragraph, spec } = fixture();
    let enabled = false;
    spec.nodes.paragraph.validate = () => { if (enabled) spec.nodes.paragraph.group = 'different'; return true; };
    const edited = paragraph('side effect');
    enabled = true;
    const base = replace(doc, 159, edited);
    schema.validate(base);
    expect(spec.nodes.paragraph.group).toBe('different');
    expect(() => schema.validate(replace(base, 0, paragraph('next')))).toThrow('Content of doc');
  });

  it('always runs root-owned invariants on a new snapshot', () => {
    const { doc, schema, paragraph, spec } = fixture();
    spec.nodes.doc.validate = node => !node.textContent.includes('DENY');
    expect(() => schema.validate(replace(doc, 100, paragraph('DENY')))).toThrow('Invalid node invariant: doc');
  });

  it('keeps validated historical branches independent', () => {
    const { doc, schema, paragraph } = fixture();
    const left = replace(doc, 70, paragraph('left'));
    const right = replace(doc, 140, paragraph('right'));
    for (const node of [right, left, doc]) schema.validate(node);
    const badLeft = replace(left, 159, left.child(159).withAttrs({ rank: -1 }));
    expect(() => schema.validate(badLeft)).toThrow('Invalid value for attribute');
    for (const node of [right, left, doc]) expect(() => schema.validate(node)).not.toThrow();
    expect(left.child(140)).toBe(doc.child(140));
    expect(right.child(70)).toBe(doc.child(70));
  });

  it('validates changed paths inside a wide nested container', () => {
    const { doc, schema, paragraph, spec } = fixture();
    spec.nodes.quote = { group: 'block', content: 'paragraph+' };
    // Build a fresh schema so the extension participates in its actual types.
    const nestedSchema = new Schema(spec);
    const quote = nestedSchema.node('quote', {}, Array.from({ length: 160 }, (_, index) =>
      nestedSchema.node('paragraph', {}, [nestedSchema.text(`nested ${index}`)])));
    const root = nestedSchema.node('doc', {}, [quote]);
    nestedSchema.validate(root);
    const invalid = replace(quote, 150, quote.child(150).withAttrs({ rank: -1 }));
    expect(() => nestedSchema.validate(root.copy([invalid]))).toThrow('Invalid value for attribute');
    const valid = replace(quote, 150, nestedSchema.node('paragraph', {}, [nestedSchema.text('changed')]));
    expect(() => nestedSchema.validate(root.copy([valid]))).not.toThrow();
    expect(quote.child(150).textContent).toBe('nested 150');
    // A valid node belonging to another schema remains invalid here.
    expect(() => nestedSchema.validate(root.copy([replace(quote, 150, paragraph('foreign'))])))
      .toThrow('Foreign node');
    expect(() => schema.validate(doc)).not.toThrow();
  });

  it('validates copied documents that cross the wide-container threshold', () => {
    const { doc, schema, paragraph } = fixture();
    const small = doc.copy(doc.content.slice(0, 32));
    schema.validate(small);
    const grown = small.copy([...small.content, ...doc.content]);
    schema.validate(grown);
    const invalid = replace(grown, 100, paragraph('bad').withAttrs({ rank: -1 }));
    expect(() => schema.validate(invalid)).toThrow('Invalid value for attribute');
  });

  it('does not trust wide nodes constructed from unvalidated external content', () => {
    const { schema, paragraph } = fixture();
    const content = Array.from({ length: 160 }, () => paragraph('external'));
    content[80] = content[80].withAttrs({ rank: -1 });
    const external = schema.node('doc', {}, content);
    expect(() => schema.validate(replace(external, 159, paragraph('changed')))).toThrow('Invalid value for attribute');
    expect(() => schema.nodeFromJSON(external.toJSON())).toThrow('Invalid value for attribute');
  });

  it('agrees with uncached full traversal across deterministic structural edits', () => {
    let seed = 971;
    const random = (limit: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % limit; };
    const fresh = (node: Node): Node => new Node(node.type, node.attrs, node.content.map(fresh), node.text, node.marks);
    const accepted = (schema: Schema, doc: Node) => {
      try { schema.validate(doc); return true; } catch { return false; }
    };
    for (const expression of ['(paragraph|heading)+', 'paragraph+ heading?', '(paragraph paragraph? heading?)*']) {
      const { doc, schema, paragraph } = fixture(96, expression);
      let source = doc;
      for (let attempt = 0; attempt < 80; attempt++) {
        const content = [...source.content], index = random(content.length);
        switch (attempt % 6) {
          case 0: content[index] = paragraph(`edit ${attempt}`); break;
          case 1: content.splice(index, 0, schema.node('heading')); break;
          case 2: content.splice(index, 1); break;
          case 3: [content[0], content[index]] = [content[index], content[0]]; break;
          case 4: content[index] = paragraph('invalid').withAttrs({ rank: -1 }); break;
          case 5: content.splice(index, 0, paragraph('inserted')); break;
        }
        const candidate = source.copy(content);
        const expected = accepted(schema, fresh(candidate));
        expect(accepted(schema, candidate), `${expression}, edit ${attempt}`).toBe(expected);
        if (expected) source = candidate;
      }
    }
  });
});
