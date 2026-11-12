import type { Mark } from '../schema';

/** Attribute updates retain the authored nesting of existing marks. */
export function replaceOrAppendMark(marks: readonly Mark[], mark: Mark): readonly Mark[] {
  return marks.some(existing => existing.type === mark.type)
    ? marks.map(existing => existing.type === mark.type ? mark : existing)
    : [...marks, mark];
}
