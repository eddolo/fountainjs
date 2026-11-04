import type { Node } from './schema';
import type { MarkdownSourceBlockSnapshot } from './importers/markdown-importer';

export interface MarkdownSourceEdit { readonly from: number; readonly to: number; readonly text: string }
export interface MarkdownSourceLineView {
  readonly start: number;
  readonly end: number;
  readonly outer: number;
  readonly continuation: string;
}
export interface MarkdownNestedCapture {
  build?: () => MarkdownNestedRecord | null;
  record?: MarkdownNestedRecord | null;
}
export type MarkdownNestedRecord = {
  readonly node: Node;
  readonly source: string;
} & ({
  readonly kind: 'sequence';
  readonly parse?: (source: string) => readonly Node[];
  readonly children: readonly {
    readonly from: number; readonly to: number; readonly node: Node;
    readonly capture?: MarkdownNestedCapture;
    readonly canonical: boolean;
  }[];
} | {
  readonly kind: 'view';
  readonly body: MarkdownNestedCapture;
  readonly lines: readonly MarkdownSourceLineView[];
  readonly checkbox?: number;
});

type Canonical = (node: Node, path: readonly number[]) => string;
const captures = new WeakMap<MarkdownSourceBlockSnapshot, {
  readonly capture: MarkdownNestedCapture;
  readonly parse: (source: string) => readonly Node[];
}>();

export function registerMarkdownNestedSource(block: MarkdownSourceBlockSnapshot, capture: MarkdownNestedCapture,
  parse: (source: string) => readonly Node[]): void {
  captures.set(block, { capture, parse });
}

export function hasMarkdownNestedSource(block: MarkdownSourceBlockSnapshot): boolean {
  return captures.has(block);
}

function resolve(capture: MarkdownNestedCapture): MarkdownNestedRecord | null {
  if (capture.build) {
    const build = capture.build;
    capture.build = undefined;
    capture.record = build();
  }
  return capture.record ?? null;
}

function sameMetadata(original: Node, current: Node, checkbox: boolean): boolean {
  const candidate = checkbox ? current.withAttrs({ ...current.attrs, checked: original.attrs.checked }) : current;
  return original.copy([]).eq(candidate.copy([]));
}

function lineAt(lines: readonly MarkdownSourceLineView[], offset: number): MarkdownSourceLineView | undefined {
  let low = 0, high = lines.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (lines[middle].start <= offset) low = middle + 1;
    else high = middle;
  }
  const line = lines[low - 1];
  return line && offset <= line.end ? line : undefined;
}

function edits(capture: MarkdownNestedCapture, current: Node, canonical: Canonical,
  path: readonly number[], checkbox = false, validate = true): MarkdownSourceEdit[] | null {
  const record = resolve(capture);
  if (!record) return null;
  const ownsCheckbox = record.kind === 'view' && record.checkbox !== undefined;
  if (!sameMetadata(record.node, current, checkbox || ownsCheckbox)) return null;
  if (record.node.eq(current)) return [];
  if (record.kind === 'sequence') {
    if (current.childCount !== record.children.length) return null;
    const result: MarkdownSourceEdit[] = [];
    let checkBoundary = validate;
    for (const [index, child] of record.children.entries()) {
      const value = current.child(index);
      if (child.node.eq(value)) continue;
      const nested = child.capture ? edits(child.capture, value, canonical, [...path, index], false, validate) : null;
      if (nested !== null) result.push(...nested.map(edit => ({ ...edit, from: child.from + edit.from, to: child.from + edit.to })));
      else if (child.canonical) {
        // A different block kind can remove a delimiter separating neighbours.
        // Repair only this affected sequence before proposing a complete draft.
        checkBoundary ||= child.node.type.name !== value.type.name;
        result.push({ from: child.from, to: child.to, text: canonical(value, [...path, index]) });
      }
      else return null;
    }
    if (checkBoundary && record.parse) {
      const matches = (changes: readonly MarkdownSourceEdit[]): boolean => {
        const candidate = apply(record.source, changes);
        if (candidate === null) return false;
        const parsed = record.parse!(candidate);
        return parsed.length === current.childCount && parsed.every((child, index) => child.eq(current.child(index)));
      };
      if (!matches(result)) {
        for (let index = 0; index < record.children.length - 1; index++) {
          const left = record.children[index], right = record.children[index + 1];
          if (left.node.eq(current.child(index)) && right.node.eq(current.child(index + 1))) continue;
          const separator = record.source.slice(left.to, right.from);
          if ((separator.match(/\r\n|\r|\n/gu)?.length ?? 0) < 2) {
            result.push({ from: left.to, to: left.to, text: /\r\n|\r|\n/u.exec(separator)?.[0] ?? '\n' });
          }
        }
        if (!matches(result)) return null;
      }
    }
    return result;
  }
  const inner = edits(record.body, current, canonical, path, checkbox || ownsCheckbox, validate);
  if (!inner) return null;
  const result: MarkdownSourceEdit[] = [];
  for (const edit of inner) {
    const first = lineAt(record.lines, edit.from), last = lineAt(record.lines, edit.to);
    if (!first || !last) return null;
    result.push({ from: first.outer + edit.from - first.start, to: last.outer + edit.to - last.start,
      text: edit.text.replace(/\r\n|\r|\n/gu, ending => ending + first.continuation) });
  }
  if (ownsCheckbox && record.node.attrs.checked !== current.attrs.checked) {
    result.push({ from: record.checkbox!, to: record.checkbox! + 1, text: current.attrs.checked ? 'x' : ' ' });
  }
  return result;
}

function apply(source: string, changes: readonly MarkdownSourceEdit[]): string | null {
  let end = 0;
  const result: string[] = [];
  for (const edit of [...changes].sort((a, b) => a.from - b.from)) {
    if (edit.from < end || edit.to < edit.from || edit.to > source.length) return null;
    result.push(source.slice(end, edit.from), edit.text);
    end = edit.to;
  }
  result.push(source.slice(end));
  return result.join('');
}

function renderNestedSource(block: MarkdownSourceBlockSnapshot, current: Node, canonical: Canonical, validate: boolean): string | null {
  const captured = captures.get(block);
  if (!captured) return null;
  try {
    const changes = edits(captured.capture, current, canonical, [], false, validate);
    if (!changes?.length) return null;
    const source = apply(block.source, changes);
    if (source === null) return null;
    if (!validate) return source;
    const parsed = captured.parse(source);
    return parsed.length === 1 && parsed[0].eq(current) ? source : null;
  } catch { return null; }
}

export function renderMarkdownNestedSource(block: MarkdownSourceBlockSnapshot, current: Node, canonical: Canonical): string | null {
  return renderNestedSource(block, current, canonical, true);
}

/** Unproven source for a complete-document parser check. This must never be
 * accepted through the local-boundary path without that complete proof. */
export function draftMarkdownNestedSource(block: MarkdownSourceBlockSnapshot, current: Node, canonical: Canonical): string | null {
  return renderNestedSource(block, current, canonical, false);
}
