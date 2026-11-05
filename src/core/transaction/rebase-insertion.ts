import { StepMap } from './mapping';

interface Retained { readonly from: number; readonly to: number; readonly at: number }

/** Retain an independent insertion while rebasing an older positional change.
 * Sizes/positions in the result describe the original target, before that
 * insertion. Work is bounded by map ranges, never by document characters. */
export function rebaseInsertion(map: StepMap, size: number, position: number, length: number): {
  readonly map: StepMap; readonly targetPosition: number; readonly targetSize: number;
} {
  if (![size, position, length].every(value => Number.isSafeInteger(value) && value >= 0) || position > size) {
    throw new RangeError('Invalid insertion rebase boundary.');
  }
  const retained: Retained[] = [];
  let old = 0, next = 0;
  for (let index = 0; index < map.ranges.length; index += 3) {
    const start = map.ranges[index]!, removed = map.ranges[index + 1]!, inserted = map.ranges[index + 2]!;
    if (start + removed > size) throw new RangeError('Insertion rebase map exceeds its source.');
    if (start > old) retained.push({ from: old, to: start, at: next });
    next += start - old + inserted; old = start + removed;
  }
  if (old < size) retained.push({ from: old, to: size, at: next });
  const targetSize = next + size - old, targetPosition = map.map(position, 1);
  if (length === 0) return { map, targetPosition, targetSize };
  const pieces: Retained[] = [{ from: position, to: position + length, at: targetPosition }];
  for (const span of retained) {
    const outputCut = span.from + targetPosition - span.at;
    const cuts = [span.from, span.to, position, outputCut]
      .filter(value => value >= span.from && value <= span.to).sort((a, b) => a - b);
    for (let index = 1; index < cuts.length; index++) {
      const from = cuts[index - 1]!, to = cuts[index]!;
      if (from === to) continue;
      const at = span.at + from - span.from;
      const shift = from >= position ? length : 0;
      pieces.push({ from: from + shift, to: to + shift, at: at + (at >= targetPosition ? length : 0) });
    }
  }
  pieces.sort((a, b) => a.from - b.from);
  const ranges: number[] = [];
  old = 0; next = 0;
  for (const piece of pieces) {
    if (piece.from < old || piece.at < next) throw new Error('Insertion rebase must preserve source order.');
    if (piece.from !== old || piece.at !== next) ranges.push(old, piece.from - old, piece.at - next);
    old = piece.to; next = piece.at + piece.to - piece.from;
  }
  if (old !== size + length || next !== targetSize + length) ranges.push(old, size + length - old, targetSize + length - next);
  return { map: ranges.length ? new StepMap(ranges) : StepMap.empty, targetPosition, targetSize };
}
