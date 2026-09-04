import type { Attributes, MarkJSON, Node, NodeJSON } from '../core';

const MAX_COMPARISON_CHANGES = 20_000;
const MAX_ALIGNMENT_CELLS = 1_000_000;

export type VersionChangeKind =
  | 'node-inserted'
  | 'node-deleted'
  | 'node-replaced'
  | 'text-inserted'
  | 'text-deleted'
  | 'text-replaced'
  | 'marks-changed'
  | 'attributes-changed';

export interface VersionComparisonEndpoint {
  readonly id: string;
  readonly label: string;
  readonly contentFingerprint: string;
}

export interface VersionChange {
  readonly id: string;
  readonly kind: VersionChangeKind;
  readonly nodeType: string;
  readonly beforePath?: readonly number[];
  readonly afterPath?: readonly number[];
  readonly beforeNode?: NodeJSON;
  readonly afterNode?: NodeJSON;
  readonly beforeText?: string;
  readonly afterText?: string;
  readonly beforeFrom?: number;
  readonly beforeTo?: number;
  readonly afterFrom?: number;
  readonly afterTo?: number;
  readonly beforeMarks?: readonly MarkJSON[];
  readonly afterMarks?: readonly MarkJSON[];
  readonly beforeAttributes?: Readonly<Attributes>;
  readonly afterAttributes?: Readonly<Attributes>;
}

export interface VersionComparisonCounts {
  readonly inserted: number;
  readonly deleted: number;
  readonly replaced: number;
  readonly formatting: number;
  readonly attributes: number;
}

export interface VersionComparison {
  readonly from: VersionComparisonEndpoint;
  readonly to: VersionComparisonEndpoint;
  readonly changes: readonly VersionChange[];
  readonly counts: VersionComparisonCounts;
  readonly identical: boolean;
}

function immutablePath(path: readonly number[]): readonly number[] {
  return Object.freeze([...path]);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => same(value, right[index]));
  }
  const leftObject = left as Record<string, unknown>;
  const rightObject = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftObject).sort();
  const rightKeys = Object.keys(rightObject).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && same(leftObject[key], rightObject[key]));
}

function marks(node: Node): readonly MarkJSON[] {
  return node.marks.map((mark) => mark.toJSON());
}

function push(changes: VersionChange[], value: Omit<VersionChange, 'id'>): void {
  if (changes.length >= MAX_COMPARISON_CHANGES) throw new RangeError('The document comparison contains too many changes.');
  changes.push(deepFreeze({ id: `change-${changes.length + 1}`, ...value }));
}

function textChange(before: Node, after: Node, beforePath: readonly number[], afterPath: readonly number[], changes: VersionChange[]): void {
  const oldText = before.text ?? '';
  const newText = after.text ?? '';
  if (oldText !== newText) {
    let prefix = 0;
    while (prefix < oldText.length && prefix < newText.length && oldText[prefix] === newText[prefix]) prefix += 1;
    let suffix = 0;
    while (suffix < oldText.length - prefix && suffix < newText.length - prefix
      && oldText[oldText.length - suffix - 1] === newText[newText.length - suffix - 1]) suffix += 1;
    const removed = oldText.slice(prefix, oldText.length - suffix);
    const inserted = newText.slice(prefix, newText.length - suffix);
    push(changes, {
      kind: !removed ? 'text-inserted' : !inserted ? 'text-deleted' : 'text-replaced',
      nodeType: 'text',
      beforePath: immutablePath(beforePath),
      afterPath: immutablePath(afterPath),
      beforeText: removed,
      afterText: inserted,
      beforeFrom: prefix,
      beforeTo: oldText.length - suffix,
      afterFrom: prefix,
      afterTo: newText.length - suffix,
    });
  }
  const beforeMarks = marks(before);
  const afterMarks = marks(after);
  if (!same(beforeMarks, afterMarks)) {
    push(changes, {
      kind: 'marks-changed',
      nodeType: 'text',
      beforePath: immutablePath(beforePath),
      afterPath: immutablePath(afterPath),
      beforeText: oldText,
      afterText: newText,
      beforeMarks: deepFreeze(beforeMarks),
      afterMarks: deepFreeze(afterMarks),
    });
  }
}

function alignedChildren(before: Node, after: Node): readonly (readonly [number, number])[] {
  const rows = before.childCount + 1;
  const columns = after.childCount + 1;
  if (rows * columns > MAX_ALIGNMENT_CELLS) {
    const matches: [number, number][] = [];
    let prefix = 0;
    while (prefix < before.childCount && prefix < after.childCount && before.child(prefix).eq(after.child(prefix))) {
      matches.push([prefix, prefix]);
      prefix += 1;
    }
    let beforeSuffix = before.childCount - 1;
    let afterSuffix = after.childCount - 1;
    const suffix: [number, number][] = [];
    while (beforeSuffix >= prefix && afterSuffix >= prefix && before.child(beforeSuffix).eq(after.child(afterSuffix))) {
      suffix.unshift([beforeSuffix, afterSuffix]);
      beforeSuffix -= 1;
      afterSuffix -= 1;
    }
    return Object.freeze([...matches, ...suffix].map((match) => Object.freeze(match)));
  }

  const lengths = new Uint32Array(rows * columns);
  const cell = (beforeIndex: number, afterIndex: number) => beforeIndex * columns + afterIndex;
  for (let beforeIndex = before.childCount - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = after.childCount - 1; afterIndex >= 0; afterIndex -= 1) {
      lengths[cell(beforeIndex, afterIndex)] = before.child(beforeIndex).eq(after.child(afterIndex))
        ? (lengths[cell(beforeIndex + 1, afterIndex + 1)] as number) + 1
        : Math.max(
          lengths[cell(beforeIndex + 1, afterIndex)] as number,
          lengths[cell(beforeIndex, afterIndex + 1)] as number,
        );
    }
  }
  const matches: [number, number][] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < before.childCount && afterIndex < after.childCount) {
    if (before.child(beforeIndex).eq(after.child(afterIndex))) {
      matches.push([beforeIndex, afterIndex]);
      beforeIndex += 1;
      afterIndex += 1;
    } else if ((lengths[cell(beforeIndex + 1, afterIndex)] as number)
      >= (lengths[cell(beforeIndex, afterIndex + 1)] as number)) {
      beforeIndex += 1;
    } else {
      afterIndex += 1;
    }
  }
  return Object.freeze(matches.map((match) => Object.freeze(match)));
}

function compareChildGap(
  before: Node,
  after: Node,
  beforeStart: number,
  beforeEnd: number,
  afterStart: number,
  afterEnd: number,
  beforePath: readonly number[],
  afterPath: readonly number[],
  changes: VersionChange[],
): void {
  const pairs = Math.min(beforeEnd - beforeStart, afterEnd - afterStart);
  for (let index = 0; index < pairs; index += 1) {
    compareNode(
      before.child(beforeStart + index),
      after.child(afterStart + index),
      [...beforePath, beforeStart + index],
      [...afterPath, afterStart + index],
      changes,
    );
  }
  for (let index = beforeStart + pairs; index < beforeEnd; index += 1) {
    const node = before.child(index);
    push(changes, {
      kind: 'node-deleted',
      nodeType: node.type.name,
      beforePath: immutablePath([...beforePath, index]),
      beforeNode: deepFreeze(node.toJSON()),
    });
  }
  for (let index = afterStart + pairs; index < afterEnd; index += 1) {
    const node = after.child(index);
    push(changes, {
      kind: 'node-inserted',
      nodeType: node.type.name,
      afterPath: immutablePath([...afterPath, index]),
      afterNode: deepFreeze(node.toJSON()),
    });
  }
}

function compareChildren(before: Node, after: Node, beforePath: readonly number[], afterPath: readonly number[], changes: VersionChange[]): void {
  let beforeStart = 0;
  let afterStart = 0;
  for (const [beforeMatch, afterMatch] of [...alignedChildren(before, after), [before.childCount, after.childCount] as const]) {
    compareChildGap(before, after, beforeStart, beforeMatch, afterStart, afterMatch, beforePath, afterPath, changes);
    beforeStart = beforeMatch + 1;
    afterStart = afterMatch + 1;
  }
}

function compareNode(before: Node, after: Node, beforePath: readonly number[], afterPath: readonly number[], changes: VersionChange[]): void {
  if (before.eq(after)) return;
  if (before.type !== after.type) {
    push(changes, {
      kind: 'node-replaced',
      nodeType: `${before.type.name} → ${after.type.name}`,
      beforePath: immutablePath(beforePath),
      afterPath: immutablePath(afterPath),
      beforeNode: deepFreeze(before.toJSON()),
      afterNode: deepFreeze(after.toJSON()),
    });
    return;
  }
  if (before.isText && after.isText) {
    textChange(before, after, beforePath, afterPath, changes);
    return;
  }
  if (!same(before.attrs, after.attrs)) {
    push(changes, {
      kind: 'attributes-changed',
      nodeType: before.type.name,
      beforePath: immutablePath(beforePath),
      afterPath: immutablePath(afterPath),
      beforeAttributes: deepFreeze({ ...before.attrs }),
      afterAttributes: deepFreeze({ ...after.attrs }),
    });
  }
  compareChildren(before, after, beforePath, afterPath, changes);
}

export function compareVersionDocuments(
  before: Node,
  after: Node,
  from: VersionComparisonEndpoint,
  to: VersionComparisonEndpoint,
): VersionComparison {
  if (before.type !== after.type) throw new Error('Version comparison requires one compatible top-level schema.');
  before.type.schema.validate(before);
  after.type.schema.validate(after);
  const changes: VersionChange[] = [];
  compareNode(before, after, [], [], changes);
  const counts: VersionComparisonCounts = Object.freeze({
    inserted: changes.filter((change) => change.kind === 'node-inserted' || change.kind === 'text-inserted').length,
    deleted: changes.filter((change) => change.kind === 'node-deleted' || change.kind === 'text-deleted').length,
    replaced: changes.filter((change) => change.kind === 'node-replaced' || change.kind === 'text-replaced').length,
    formatting: changes.filter((change) => change.kind === 'marks-changed').length,
    attributes: changes.filter((change) => change.kind === 'attributes-changed').length,
  });
  return Object.freeze({
    from: Object.freeze({ ...from }),
    to: Object.freeze({ ...to }),
    changes: Object.freeze(changes),
    counts,
    identical: changes.length === 0,
  });
}
