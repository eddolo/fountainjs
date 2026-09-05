import { describe, expect, it } from 'vitest';

import { CoreSchemaSpec, Schema } from '../src';
import { VirtualBlockLayout } from '../src/view/virtual-layout';

const schema = new Schema(CoreSchemaSpec);
const paragraph = (value: string) => schema.node('paragraph', {}, [schema.text(value)]);
const documentWith = (count: number) => schema.node(
  'doc', {}, Array.from({ length: count }, (_value, index) => paragraph(`Block ${index}`)),
);

describe('virtual block layout', () => {
  it('plans a small visible window plus distant selection islands', () => {
    const document = documentWith(100_000);
    const layout = new VirtualBlockLayout({
      estimatedBlockHeight: 40,
      overscanPx: 400,
      pinnedOverscanBlocks: 2,
    });
    layout.sync(document);

    const plan = layout.plan(2_000_000, 800, [1, 99_998]);

    expect(plan.totalHeight).toBe(4_000_000);
    expect(plan.ranges).toEqual([
      { from: 0, to: 4 },
      { from: 49_990, to: 50_031 },
      { from: 99_996, to: 100_000 },
    ]);
    expect(plan.mountedCount).toBe(49);
    expect(layout.positionAt(100_000)).toBe(document.content.reduce((size, node) => size + node.nodeSize, 0));
  });

  it('reuses immutable-node measurements after insertion, movement, and removal', () => {
    const original = documentWith(5);
    const layout = new VirtualBlockLayout({ estimatedBlockHeight: 50, overscanPx: 0 });
    layout.sync(original);
    expect(layout.measure([
      { index: 1, height: 80 },
      { index: 3, height: 120 },
    ])).toBe(true);
    expect(layout.totalHeight).toBe(350);

    const inserted = paragraph('Inserted');
    const changed = original.copy([inserted, original.child(3), original.child(0), original.child(1), original.child(4)]);
    layout.sync(changed);

    expect(layout.heightBetween(0, 1)).toBe(50);
    expect(layout.heightBetween(1, 2)).toBe(120);
    expect(layout.heightBetween(3, 4)).toBe(80);
    expect(layout.totalHeight).toBe(350);
  });

  it('batches measurements, ignores unsafe samples, and resolves boundaries', () => {
    const layout = new VirtualBlockLayout({ estimatedBlockHeight: 30, overscanPx: 0 });
    layout.sync(documentWith(4));
    expect(layout.measure([
      { index: 0, height: 10 },
      { index: 1, height: 20 },
      { index: 2, height: Number.NaN },
      { index: 10, height: 50 },
    ])).toBe(true);
    expect(layout.totalHeight).toBe(90);
    expect(layout.indexAt(0)).toBe(0);
    expect(layout.indexAt(9.9)).toBe(0);
    expect(layout.indexAt(10)).toBe(1);
    expect(layout.indexAt(30)).toBe(2);
    expect(layout.indexAt(10_000)).toBe(3);
    expect(layout.measure([{ index: 0, height: 10.2 }])).toBe(false);
  });

  it('validates configuration and empty documents without producing invalid ranges', () => {
    expect(() => new VirtualBlockLayout({ estimatedBlockHeight: 0 })).toThrow(RangeError);
    expect(() => new VirtualBlockLayout({ overscanPx: -1 })).toThrow(RangeError);
    expect(() => new VirtualBlockLayout({ pinnedOverscanBlocks: 1.5 })).toThrow(RangeError);

    const layout = new VirtualBlockLayout();
    const empty = schema.topNodeType.create({}, []);
    layout.sync(empty);
    expect(layout.plan(0, 800)).toEqual({ ranges: [], totalHeight: 0, mountedCount: 0 });
  });
});
