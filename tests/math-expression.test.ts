import { describe, expect, it } from 'vitest';

import { isMathExpression, parseMathExpressionJSON } from '../src';

describe('platform-neutral semantic math', () => {
  const expression = { type: 'fraction', numerator: { type: 'text', value: 'x' }, denominator: { type: 'text', value: 'y' } } as const;

  it('accepts bounded JSON semantics without a browser', () => {
    expect(typeof document).toBe('undefined');
    expect(isMathExpression(expression)).toBe(true);
    expect(parseMathExpressionJSON(JSON.stringify(expression))).toEqual(expression);
  });

  it.each([
    { type: 'function', name: { type: 'text', value: 'sin' }, argument: { type: 'text', value: 'x' } },
    { type: 'limit', base: { type: 'text', value: 'lim' }, limit: { type: 'text', value: 'n→∞' }, position: 'lower' },
    { type: 'limit', base: { type: 'text', value: 'x' }, limit: { type: 'text', value: '2' }, position: 'upper' },
    { type: 'equation_array', rows: [{ type: 'text', value: 'x=1' }, { type: 'text', value: 'y=2' }] },
  ])('accepts an extended bounded expression %#', value => {
    expect(isMathExpression(value)).toBe(true);
  });

  it.each([
    null,
    { type: 'text', value: 'x', executable: true },
    { type: 'script', base: { type: 'text', value: 'x' } },
    { type: 'matrix', rows: [[{ type: 'text', value: 'x' }], []] },
    { type: 'delimiter', open: '[[', close: ']', body: { type: 'text', value: 'x' } },
    { type: 'accent', character: 'x', body: { type: 'text', value: 'x' } },
    { type: 'function', name: { type: 'text', value: 'sin' } },
    { type: 'limit', base: { type: 'text', value: 'x' }, limit: { type: 'text', value: '0' }, position: 'side' },
    { type: 'equation_array', rows: [] },
    { type: 'equation_array', rows: Array.from({ length: 101 }, () => ({ type: 'text', value: 'x' })) },
  ])('rejects malformed or ambiguous semantics %#', value => {
    expect(isMathExpression(value)).toBe(false);
  });

  it('rejects cycles, excessive depth, and oversized interchange text', () => {
    const cycle: Record<string, unknown> = { type: 'row', content: [] };
    cycle.content = [cycle];
    expect(isMathExpression(cycle)).toBe(false);
    let deep: unknown = { type: 'text', value: 'x' };
    for (let index = 0; index < 70; index += 1) deep = { type: 'radical', body: deep };
    expect(isMathExpression(deep)).toBe(false);
    expect(parseMathExpressionJSON('x'.repeat(1_000_001))).toBeUndefined();
  });
});
