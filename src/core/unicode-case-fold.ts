import { FULL_CASE_FOLD_EXCEPTIONS, FULL_CASE_FOLD_RANGES } from './unicode-case-fold-data';

function foldRange(codePoint: number): string | undefined {
  let low = 0;
  let high = FULL_CASE_FOLD_RANGES.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const [first, last, step, delta] = FULL_CASE_FOLD_RANGES[middle];
    if (codePoint < first) high = middle - 1;
    else if (codePoint > last) low = middle + 1;
    else return (codePoint - first) % step === 0 ? String.fromCodePoint(codePoint + delta) : undefined;
  }
  return undefined;
}

/** Full Unicode 17 case folding, independent of the host's Unicode version. */
export function unicodeCaseFold(value: string): string {
  if (/^[\x00-\x7F]*$/u.test(value)) return value.toLowerCase();
  let result = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    result += FULL_CASE_FOLD_EXCEPTIONS[codePoint] ?? foldRange(codePoint) ?? character;
  }
  return result;
}
