import { expect, it } from 'vitest';
import { StepMap } from '../src/core';
import { rebaseDeletion, type DeletedRange } from '../src/core/transaction/rebase-deletion';

function check(size: number, map: StepMap, ranges: readonly DeletedRange[]) {
  const source = Array.from({ length: size }, (_, index) => `original-${index}`);
  const originalTarget = [...source];
  let delta = 0;
  for (let index = 0; index < map.ranges.length; index += 3) {
    const [start, removed, inserted] = map.ranges.slice(index, index + 3) as [number, number, number];
    originalTarget.splice(start + delta, removed, ...Array.from({ length: inserted }, (_, at) => `new-${index}-${at}`));
    delta += inserted - removed;
  }
  const erased = new Set(ranges.flatMap(range => source.slice(range.from, range.to)));
  const input = source.filter(token => !erased.has(token)), output = originalTarget.filter(token => !erased.has(token));
  const rebased = rebaseDeletion(map, size, ranges);
  expect(rebased.targetSize).toBe(originalTarget.length);
  const target = [...originalTarget];
  for (const range of [...rebased.targetRanges].reverse()) target.splice(range.from, range.to - range.from);
  expect(target).toEqual(output);
  const actual = [...input]; delta = 0;
  for (let index = 0; index < rebased.map.ranges.length; index += 3) {
    const [start, removed, inserted] = rebased.map.ranges.slice(index, index + 3) as [number, number, number];
    const replacement = output.slice(start + delta, start + delta + inserted);
    expect(replacement.every(token => token.startsWith('new-'))).toBe(true);
    actual.splice(start + delta, removed, ...replacement); delta += inserted - removed;
  }
  expect(actual).toEqual(output);
  for (let index = 0; index < input.length; index++) {
    const at = output.indexOf(input[index]!); if (at < 0) continue;
    for (let range = 0; range < rebased.map.ranges.length; range += 3) {
      expect(index >= rebased.map.ranges[range]! && index < rebased.map.ranges[range]! + rebased.map.ranges[range + 1]!).toBe(false);
    }
    expect(rebased.map.map(index, 1)).toBe(at);
  }
}

it('retains labelled source units for every small independent deletion across replacement boundaries', () => {
  for (let size = 0; size <= 5; size++) for (let start = 0; start <= size; start++) {
    for (let removed = 0; removed <= size - start; removed++) for (let added = 0; added <= 2; added++) {
      const map = new StepMap([start, removed, added]);
      check(size, map, []);
      for (let from = 0; from < size; from++) for (let to = from + 1; to <= size; to++) check(size, map, [{ from, to }]);
    }
  }
});

it('keeps inserted target units between disjoint mapped deletions', () => {
  check(10, new StepMap([2, 0, 3, 5, 2, 1]), [{ from: 1, to: 4 }, { from: 6, to: 9 }]);
  check(10, new StepMap([2, 2, 0, 7, 0, 2]), [{ from: 1, to: 5 }, { from: 6, to: 9 }]);
});

it('uses compact ranges for large documents', () => {
  const result = rebaseDeletion(new StepMap([200, 100, 17]), 10_000_000, [{ from: 150, to: 350 }]);
  expect(result.targetRanges).toEqual([{ from: 150, to: 200 }, { from: 217, to: 267 }]);
  expect(result.targetSize).toBe(9_999_917);
  expect(result.map.ranges).toEqual([150, 0, 17]);
});

it('rejects invalid, overlapping and out-of-source deletion boundaries', () => {
  for (const ranges of [[{ from: -1, to: 1 }], [{ from: 1, to: 1 }], [{ from: 2, to: 4 }], [{ from: 0, to: 2 }, { from: 1, to: 3 }]]) {
    expect(() => rebaseDeletion(StepMap.empty, 3, ranges)).toThrow(RangeError);
  }
  expect(() => rebaseDeletion(new StepMap([2, 3, 0]), 3, [])).toThrow(RangeError);
});
