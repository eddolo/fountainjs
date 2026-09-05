import { FULL_CASE_FOLD_EXCEPTIONS } from './unicode-case-fold-data';

/** Locale-neutral full Unicode case folding for identifier-style matching. */
export function unicodeCaseFold(value: string): string {
  let result = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    result += FULL_CASE_FOLD_EXCEPTIONS[codePoint] ?? character.toLowerCase();
  }
  return result;
}
