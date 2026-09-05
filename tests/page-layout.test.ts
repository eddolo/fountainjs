import { describe, expect, it } from 'vitest';
import { createPageGeometry, layoutPages } from '../src/pages';

describe('DOM-independent page layout', () => {
  it('resolves A4, Letter, custom sizes, margins, and reserved furniture', () => {
    expect(createPageGeometry({ size: 'a4', margins: 20 })).toMatchObject({
      size: { width: 210, height: 297 },
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      bodyHeight: 257,
    });
    const letter = createPageGeometry({
      size: 'letter', margins: { top: 10, bottom: 15, left: 12, right: 12 },
      headerHeight: 5, footerHeight: 7, unitsPerMillimetre: 2,
    });
    expect(letter.size).toEqual({ width: 431.8, height: 558.8 });
    expect(letter.bodyHeight).toBeCloseTo(496.8);
    expect(createPageGeometry({ size: { width: 100, height: 120 }, margins: 10 }).bodyHeight).toBe(100);
    expect(() => createPageGeometry({ size: { width: 0, height: 100 } })).toThrow(/positive/);
    expect(() => createPageGeometry({ size: 'a4', margins: 200 })).toThrow(/positive body/);
  });

  it('flows whole blocks deterministically and honors manual breaks and keep-with-next', () => {
    const geometry = createPageGeometry({ size: { width: 100, height: 100 }, margins: 10 });
    const result = layoutPages([
      { id: 'intro', height: 35 },
      { id: 'heading', height: 10, keepWithNext: true },
      { id: 'paragraph', height: 40 },
      { id: 'manual', height: 0, breakAfter: true },
      { id: 'ending', height: 20 },
    ], geometry);

    expect(result.pages.map((page) => page.placements.map((item) => item.itemId))).toEqual([
      ['intro'], ['heading', 'paragraph', 'manual'], ['ending'],
    ]);
    expect(result.warnings).toEqual([]);
    expect(Object.isFrozen(result.pages)).toBe(true);
  });

  it('splits legal fragments while preserving widow/orphan minima', () => {
    const geometry = createPageGeometry({ size: { width: 100, height: 80 }, margins: 10 });
    const result = layoutPages([{
      id: 'paragraph',
      fragments: Array.from({ length: 7 }, (_, index) => ({ id: `line-${index + 1}`, height: 10 })),
      minimumStart: 2,
      minimumEnd: 2,
    }], geometry);

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].placements[0]).toMatchObject({ fragmentFrom: 0, fragmentTo: 5, continuedBefore: false, continuedAfter: true });
    expect(result.pages[1].placements[0]).toMatchObject({ fragmentFrom: 5, fragmentTo: 7, continuedBefore: true, continuedAfter: false });
  });

  it('accounts for repeated table headers and page-local footnotes', () => {
    const geometry = createPageGeometry({ size: { width: 100, height: 100 }, margins: 10 });
    const result = layoutPages([{
      id: 'table',
      fragments: [
        { id: 'row-1', height: 30, footnotes: [{ id: 'note-a', height: 12 }] },
        { id: 'row-2', height: 30, footnotes: [{ id: 'note-a', height: 12 }] },
        { id: 'row-3', height: 30, footnotes: [{ id: 'note-b', height: 12 }] },
      ],
      continuationHeight: 8,
    }], geometry);

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]).toMatchObject({ usedHeight: 72, footnotes: [{ id: 'note-a', height: 12 }] });
    expect(result.pages[0].placements[0]).toMatchObject({ fragmentFrom: 0, fragmentTo: 2, height: 60 });
    expect(result.pages[1]).toMatchObject({ usedHeight: 50, footnotes: [{ id: 'note-b', height: 12 }] });
    expect(result.pages[1].placements[0]).toMatchObject({ fragmentFrom: 2, fragmentTo: 3, height: 38 });
  });

  it('keeps a heading with the required opening lines of a splittable paragraph', () => {
    const geometry = createPageGeometry({ size: { width: 100, height: 120 }, margins: 10 });
    const result = layoutPages([
      { id: 'lead', height: 70 },
      { id: 'heading', height: 20, keepWithNext: true },
      {
        id: 'paragraph',
        fragments: [1, 2, 3, 4].map((number) => ({ id: `line-${number}`, height: 10 })),
        minimumStart: 2,
        minimumEnd: 2,
      },
    ], geometry);

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.placements.map((placement) => placement.itemId)).toEqual(['lead']);
    expect(result.pages[1]?.placements.map((placement) => placement.itemId)).toEqual(['heading', 'paragraph']);
    expect(result.warnings).toEqual([]);
  });

  it('reports when keep-with-next cannot fit on an empty page', () => {
    const geometry = createPageGeometry({ size: { width: 100, height: 120 }, margins: 10 });
    const result = layoutPages([
      { id: 'heading', height: 60, keepWithNext: true },
      {
        id: 'paragraph',
        fragments: [{ id: 'line-1', height: 30 }, { id: 'line-2', height: 30 }],
        minimumStart: 2,
      },
    ], geometry);

    expect(result.warnings).toMatchObject([{ code: 'constraint-relaxed', itemId: 'heading' }]);
  });

  it('reserves a repeated footnote only on the page containing its first reference', () => {
    const geometry = createPageGeometry({ size: { width: 100, height: 60 }, margins: 10 });
    const result = layoutPages([{
      id: 'paragraphs',
      fragments: [
        { id: 'first', height: 25, footnotes: [{ id: 'shared', height: 10 }] },
        { id: 'second', height: 25, footnotes: [{ id: 'shared', height: 10 }] },
      ],
    }], geometry);

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].footnotes).toEqual([{ id: 'shared', height: 10 }]);
    expect(result.pages[1].footnotes).toEqual([]);
    expect(result.pages[1].usedHeight).toBe(25);
  });

  it('retains oversized content with explicit warnings and rejects hostile measurements', () => {
    const geometry = createPageGeometry({ size: { width: 100, height: 100 }, margins: 10 });
    const result = layoutPages([{ id: 'media', height: 120 }], geometry);
    expect(result.pages[0].placements[0]).toMatchObject({ itemId: 'media', height: 120 });
    expect(result.warnings).toMatchObject([{ code: 'oversized-item', itemId: 'media' }]);
    expect(() => layoutPages([{ id: 'bad', height: Number.NaN }], geometry)).toThrow(/finite/);
    expect(() => layoutPages([{ id: 'bad', fragments: [] }], geometry)).toThrow(/at least one/);
    expect(() => layoutPages([{ id: 'bad', height: 1, minimumStart: 0 }], geometry)).toThrow(/positive safe integer/);
    expect(() => layoutPages([{ id: 'same', height: 1 }, { id: 'same', height: 2 }], geometry)).toThrow(/duplicated/);
    expect(() => layoutPages([{
      id: 'notes',
      fragments: [
        { id: 'first', height: 1, footnotes: [{ id: 'note', height: 2 }] },
        { id: 'second', height: 1, footnotes: [{ id: 'note', height: 3 }] },
      ],
    }], geometry)).toThrow(/conflicting/);
    expect(() => layoutPages([{ id: 'bad', height: 1 }], geometry, { maximumPages: 0 })).toThrow(/positive safe integer/);
    expect(() => layoutPages([{ id: 'bad', height: 1 }], geometry, { maximumPages: 100_001 })).toThrow(/100,000/);
  });

  it('reports when fragment minima cannot fit even on an empty page', () => {
    const geometry = createPageGeometry({ size: { width: 100, height: 50 }, margins: 10 });
    const result = layoutPages([{
      id: 'tight-paragraph',
      fragments: [
        { id: 'one', height: 20 },
        { id: 'two', height: 20 },
        { id: 'three', height: 20 },
      ],
      minimumStart: 2,
      minimumEnd: 2,
    }], geometry);

    expect(result.pages.flatMap((page) => page.placements).map((placement) => [
      placement.fragmentFrom, placement.fragmentTo,
    ])).toEqual([[0, 1], [1, 2], [2, 3]]);
    expect(result.warnings.some((warning) => warning.code === 'constraint-relaxed')).toBe(true);
  });
});
