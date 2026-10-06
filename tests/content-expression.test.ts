import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, Schema } from '../src';
import { matchesContentExpression } from '../src/core/schema/content-expression';

describe('schema content expression matching', () => {
  it('matches a 10,000-block simple repetition without allocating per-node position sets', () => {
    const schema = new Schema(CoreSchemaSpec);
    const content = Array.from({ length: 10000 }, () => schema.node('paragraph'));
    matchesContentExpression([], 'block+');
    const OriginalSet = globalThis.Set;
    let allocations = 0;
    globalThis.Set = new Proxy(OriginalSet, { construct(target, args) {
      allocations++; return Reflect.construct(target, args);
    } });
    let matches;
    try { matches = matchesContentExpression(content, 'block+'); }
    finally { globalThis.Set = OriginalSet; }
    expect(matches).toBe(true);
    expect(allocations).toBe(0);
  });

  it('matches literal names and groups with exact optional/star/plus cardinality', () => {
    const membership: Record<string, readonly string[]> = {
      paragraph: ['paragraph', 'block'], heading: ['heading', 'block', 'section'],
      widget: ['widget', 'block', 'special'], code: ['code', 'block', 'special'],
      text: ['text', 'inline'],
    };
    const schema = new Schema({ nodes: {
      doc: { content: 'block+' }, paragraph: { group: 'block', content: 'inline*' },
      heading: { group: 'block section', content: 'inline*' }, widget: { group: 'block special' },
      code: { group: 'block special', content: 'text*' }, text: { inline: true, group: 'inline' },
    } });
    const words: string[][] = [[]];
    for (let length = 1; length <= 4; length++) {
      for (const prefix of words.filter(word => word.length === length - 1)) {
        for (const type of Object.keys(membership)) words.push([...prefix, type]);
      }
    }
    for (const word of words) {
      const nodes = word.map(type => type === 'text' ? schema.text('Literal') : schema.node(type));
      for (const name of ['paragraph', 'block', 'section', 'special', 'inline', 'text', 'missing']) {
        for (const quantifier of ['', '?', '*', '+']) {
          const lengthMatches = quantifier === '' ? word.length === 1 : quantifier === '?' ? word.length <= 1
            : quantifier === '+' ? word.length >= 1 : true;
          // Independent expected membership/cardinality, not Fountain's matcher.
          const expected = lengthMatches && word.every(type => membership[type].includes(name));
          expect(matchesContentExpression(nodes, name + quantifier), `${name + quantifier}: ${word}`).toBe(expected);
        }
      }
    }
  });

  it('keeps complex choices, sequences, nullable repetitions and invalid-syntax checks', () => {
    const schema = new Schema(CoreSchemaSpec);
    const p = schema.node('paragraph'), h = schema.node('heading'), text = schema.text('Literal');
    for (const [source, content, expected] of [
      ['(paragraph|heading)*', [p, h, p], true], ['(paragraph|heading)*', [p, text], false],
      ['paragraph? heading+', [h, h], true], ['paragraph? heading+', [p, h], true],
      ['paragraph? heading+', [p], false], ['(paragraph? heading)*', [p, h, h], true],
      ['(paragraph?)*', [p, p], true], ['((paragraph|heading) paragraph?)+', [h, p, h], true],
      ['block* text', [p, h, text], true], ['block* text', [text, p], false],
      ['', [], true], ['', [p], false], ['|block', [], true], ['|block', [p], true],
    ] as const) expect(matchesContentExpression(content, source), source).toBe(expected);
    for (const source of ['block{2}', 'block+ trailing!', '(paragraph|heading', 'block)', '*block']) {
      expect(() => matchesContentExpression([], source), source).toThrow();
    }
  });

  it('still reads current group declarations instead of relying on stale cached membership', () => {
    const schema = new Schema(CoreSchemaSpec);
    const spec = { group: 'block   special', content: 'inline*' };
    const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, widget: spec } });
    const node = custom.node('widget');
    expect(matchesContentExpression([node], 'special+')).toBe(true);
    spec.group = 'block other';
    expect(matchesContentExpression([node], 'special+')).toBe(false);
    expect(matchesContentExpression([node], 'other+')).toBe(true);
    // Membership matching never substitutes for the schema ownership check.
    expect(() => schema.validate(schema.node('doc', {}, [node]))).toThrow('Foreign node');
  });
});
