import { StepMap } from './mapping';

export interface DeletedRange { readonly from: number; readonly to: number }
interface Retained { readonly from: number; readonly to: number; readonly at: number }

/** Rebase a positional change over independent deletions. Only retained source
 * units are deleted in the target: inserted target content is never inferred
 * from boundary positions. Work depends on ranges, not document characters. */
export function rebaseDeletion(map: StepMap, size: number, deleted: readonly DeletedRange[]): {
  readonly map: StepMap; readonly targetRanges: readonly DeletedRange[]; readonly targetSize: number;
} {
  if (!Number.isSafeInteger(size) || size < 0) throw new RangeError('Invalid deletion rebase size.');
  let end = 0;
  for (const range of deleted) {
    if (![range.from, range.to].every(Number.isSafeInteger) || range.from < end || range.to <= range.from || range.to > size) {
      throw new RangeError('Invalid deletion rebase ranges.');
    }
    end = range.to;
  }
  const retained: Retained[] = [];
  let old = 0, next = 0;
  for (let index = 0; index < map.ranges.length; index += 3) {
    const start = map.ranges[index]!, removed = map.ranges[index + 1]!, inserted = map.ranges[index + 2]!;
    if (start + removed > size) throw new RangeError('Deletion rebase map exceeds its source.');
    if (start > old) retained.push({ from: old, to: start, at: next });
    next += start - old + inserted; old = start + removed;
  }
  if (old < size) retained.push({ from: old, to: size, at: next });
  const targetSize = next + size - old;
  if (!deleted.length) return { map, targetRanges: [], targetSize };
  const pieces: Retained[] = [], targetRanges: DeletedRange[] = [];
  let deletionIndex = 0;
  for (const span of retained) {
    let cursor = span.from;
    while (deletionIndex < deleted.length && deleted[deletionIndex]!.to <= span.from) deletionIndex++;
    for (let index = deletionIndex; index < deleted.length && deleted[index]!.from < span.to; index++) {
      const range = deleted[index]!, from = Math.max(range.from, span.from), to = Math.min(range.to, span.to);
      if (from > cursor) pieces.push({ from: cursor, to: from, at: span.at + cursor - span.from });
      const targetFrom = span.at + from - span.from, targetTo = span.at + to - span.from;
      const previous = targetRanges.at(-1);
      if (previous?.to === targetFrom) targetRanges[targetRanges.length - 1] = { from: previous.from, to: targetTo };
      else targetRanges.push({ from: targetFrom, to: targetTo });
      cursor = to;
    }
    if (cursor < span.to) pieces.push({ from: cursor, to: span.to, at: span.at + cursor - span.from });
  }
  // Both coordinates are visited monotonically; compress them in one pass.
  const compressor = (ranges: readonly DeletedRange[]) => {
    let index = 0, removed = 0;
    return (position: number) => {
      while (index < ranges.length && ranges[index]!.to <= position) {
        removed += ranges[index]!.to - ranges[index]!.from; index++;
      }
      const active = ranges[index];
      return position - removed - (active && active.from < position ? position - active.from : 0);
    };
  };
  const compressSource = compressor(deleted), compressTarget = compressor(targetRanges);
  const ranges: number[] = [];
  old = 0; next = 0;
  for (const piece of pieces) {
    const from = compressSource(piece.from), to = compressSource(piece.to), at = compressTarget(piece.at);
    if (from !== old || at !== next) ranges.push(old, from - old, at - next);
    old = to; next = at + to - from;
  }
  const remainingSource = compressSource(size), remainingTarget = compressTarget(targetSize);
  if (old !== remainingSource || next !== remainingTarget) ranges.push(old, remainingSource - old, remainingTarget - next);
  return { map: ranges.length ? new StepMap(ranges) : StepMap.empty, targetRanges, targetSize };
}
