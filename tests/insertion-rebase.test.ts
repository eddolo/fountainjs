import { expect, it } from 'vitest';
import { StepMap } from '../src/core';
import { rebaseInsertion } from '../src/core/transaction/rebase-insertion';

function check(size: number, map: StepMap, position: number, length: number) {
  const original = Array.from({ length: size }, (_, index) => `original-${index}`);
  const output = [...original];
  let delta = 0;
  for (let index = 0; index < map.ranges.length; index += 3) {
    const [start, removed, inserted] = map.ranges.slice(index, index + 3) as [number, number, number];
    output.splice(start + delta, removed, ...Array.from({ length: inserted }, (_, at) => `new-${index}-${at}`));
    delta += inserted - removed;
  }
  const inserted = Array.from({ length }, (_, index) => `independent-${index}`);
  const input = [...original]; input.splice(position, 0, ...inserted);
  const targetPosition = map.map(position, 1); output.splice(targetPosition, 0, ...inserted);
  const rebased = rebaseInsertion(map, size, position, length);
  expect(rebased.targetPosition).toBe(targetPosition); expect(rebased.targetSize).toBe(output.length - length);
  const actual = [...input]; delta = 0;
  for (let index = 0; index < rebased.map.ranges.length; index += 3) {
    const [start, removed, added] = rebased.map.ranges.slice(index, index + 3) as [number, number, number];
    const replacement = output.slice(start + delta, start + delta + added);
    expect(replacement.every(token => token.startsWith('new-'))).toBe(true);
    actual.splice(start + delta, removed, ...replacement); delta += added - removed;
  }
  expect(actual).toEqual(output);
  for (let index = 0; index < input.length; index++) {
    const target = output.indexOf(input[index]!);
    if (target < 0) continue;
    // A correct-looking string is insufficient: retained source units cannot
    // be deleted and recreated by a replacement gap.
    for (let range = 0; range < rebased.map.ranges.length; range += 3) {
      const start = rebased.map.ranges[range]!, end = start + rebased.map.ranges[range + 1]!;
      expect(index >= start && index < end).toBe(false);
    }
    expect(rebased.map.map(index, 1)).toBe(target);
  }
  expect(rebased.map.map(position + length, -1)).toBe(targetPosition + length);
}

it('preserves labelled units across every small single-change insertion/deletion/replacement boundary', () => {
  for (let size = 0; size <= 6; size++) for (let start = 0; start <= size; start++) {
    for (let removed = 0; removed <= size - start; removed++) for (let added = 0; added <= 3; added++) {
      const map = new StepMap([start, removed, added]);
      for (let position = 0; position <= size; position++) for (const length of [1, 2]) check(size, map, position, length);
    }
  }
});

it('retains independent units through multiple disjoint structural changes', () => {
  for (let position = 0; position <= 8; position++) check(8, new StepMap([1, 2, 3, 5, 1, 0]), position, 2);
});

it('handles large documents with compact positional ranges', () => {
  const result = rebaseInsertion(new StepMap([200, 100, 17]), 10_000_000, 250, 2);
  expect(result.targetPosition).toBe(217); expect(result.targetSize).toBe(9_999_917);
  expect(result.map.ranges.length).toBeLessThanOrEqual(12);
  expect(result.map.mapResult(251)).toMatchObject({ position: 218, deleted: false });
});

it('rejects invalid source boundaries without guessing an insertion destination', () => {
  expect(() => rebaseInsertion(StepMap.empty, 3, -1, 1)).toThrow(RangeError);
  expect(() => rebaseInsertion(StepMap.empty, 3, 4, 1)).toThrow(RangeError);
  expect(() => rebaseInsertion(new StepMap([2, 3, 0]), 3, 1, 1)).toThrow(RangeError);
});
