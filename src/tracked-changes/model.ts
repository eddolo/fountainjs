import {
  AllSelection,
  CellSelection,
  GapSelection,
  Node,
  NodeSelection,
  Selection,
  type Attributes,
  type AnySelection,
  type Mark,
  type MarkJSON,
  type NodeJSON,
} from '../core';
import { nodeRangeAtPath, textPointToPosition } from '../core/transaction/mapping';

export const TRACKED_CHANGE_MARK = 'tracked_change';
export const TRACKED_NODE_ATTRIBUTE = 'fountainTrackedChanges';
const MAX_CHANGES_PER_TARGET = 100;
const MAX_SUGGESTIONS = 10_000;
const MAX_ID_LENGTH = 200;
const MAX_NAME_LENGTH = 200;
const MAX_REASON_LENGTH = 4_000;
const MAX_METADATA_LENGTH = 100_000;
const MAX_INLINE_DIFF = 200_000;

export type TrackedSuggestionType =
  | 'insert'
  | 'delete'
  | 'replace'
  | 'markChange'
  | 'attributeChange'
  | 'structure';

export type TrackedChangeComponent =
  | 'insert'
  | 'delete'
  | 'replacementInsertion'
  | 'replacementDeletion'
  | 'markChange'
  | 'attributeChange'
  | 'nodeInsertion'
  | 'nodeDeletion';

export interface TrackedChangesUser {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface TrackedMarkChange {
  readonly before: readonly MarkJSON[];
  readonly after: readonly MarkJSON[];
}

export interface TrackedAttributeChange {
  readonly before: Readonly<Attributes>;
  readonly after: Readonly<Attributes>;
}

export interface TrackedChangeRecord {
  readonly id: string;
  readonly component: TrackedChangeComponent;
  readonly user: TrackedChangesUser;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reason?: string;
  readonly markChange?: TrackedMarkChange;
  readonly attributeChange?: TrackedAttributeChange;
  readonly commentThreadId?: string;
}

export interface TrackedSuggestion {
  readonly id: string;
  readonly type: TrackedSuggestionType;
  readonly user: TrackedChangesUser;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reason?: string;
  readonly from: number;
  readonly to: number;
  readonly text: string;
  readonly fullText: string;
  readonly replacedText?: string;
  readonly insertedNodes?: readonly NodeJSON[];
  readonly deletedNodes?: readonly NodeJSON[];
  readonly markChanges?: readonly TrackedMarkChange[];
  readonly attributeChanges?: readonly TrackedAttributeChange[];
  readonly commentThreadId?: string;
}

export interface SuggestionFilter {
  readonly id?: string;
  readonly type?: TrackedSuggestionType;
  readonly userId?: string;
  readonly from?: number;
  readonly to?: number;
}

export interface TrackedChangeBase {
  readonly id: string;
  readonly user: TrackedChangesUser;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reason?: string;
  readonly commentThreadId?: string;
}

/** Optional exact edit intent, used to avoid shrinking an explicit replacement around coincident text. */
export interface TrackedTextDiffHint {
  readonly path: readonly number[];
  readonly from: number;
  readonly to: number;
  readonly text: string;
}

function validId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_ID_LENGTH
    && /^[\w.:@/-]+$/.test(value);
}

function cloneJSON<T>(value: T, label: string, maximum = MAX_METADATA_LENGTH): T {
  let encoded: string | undefined;
  try { encoded = JSON.stringify(value); }
  catch { throw new TypeError(`${label} must be JSON serializable.`); }
  if (encoded === undefined || encoded.length > maximum) throw new RangeError(`${label} exceeds the safety limit.`);
  return JSON.parse(encoded) as T;
}

function normalizeTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > 50 || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`Invalid tracked-change ${label} timestamp.`);
  }
  return new Date(value).toISOString();
}

export function normalizeTrackedChangesUser(value: TrackedChangesUser): TrackedChangesUser {
  if (!value || !validId(value.id) || typeof value.name !== 'string' || !value.name.trim()
    || value.name.length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(value.name)) {
    throw new TypeError('Tracked changes require a valid user identity.');
  }
  if (value.color !== undefined && (typeof value.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.color))) {
    throw new TypeError('Tracked-change user colors must be six-digit CSS hex values.');
  }
  if (value.metadata !== undefined && (!value.metadata || typeof value.metadata !== 'object' || Array.isArray(value.metadata))) {
    throw new TypeError('Tracked-change user metadata must be an object.');
  }
  return Object.freeze({
    id: value.id,
    name: value.name.trim(),
    ...(value.color ? { color: value.color.toLowerCase() } : {}),
    ...(value.metadata ? { metadata: Object.freeze(cloneJSON(value.metadata, 'Tracked-change user metadata')) } : {}),
  });
}

function normalizeMarks(values: readonly MarkJSON[] | undefined, label: string): readonly MarkJSON[] {
  if (!Array.isArray(values) || values.length > 100) throw new TypeError(`${label} must be a bounded mark array.`);
  const normalized = cloneJSON(values, label);
  normalized.forEach((mark) => {
    if (!mark || typeof mark.type !== 'string' || !mark.type || mark.type === TRACKED_CHANGE_MARK) {
      throw new TypeError(`${label} contains an invalid mark.`);
    }
  });
  return Object.freeze(normalized);
}

function normalizeAttributes(value: unknown, label: string): Readonly<Attributes> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const result = cloneJSON(value as Attributes, label);
  delete result[TRACKED_NODE_ATTRIBUTE];
  return Object.freeze(result);
}

export function normalizeTrackedChange(value: TrackedChangeRecord): TrackedChangeRecord {
  if (!value || !validId(value.id) || ![
    'insert', 'delete', 'replacementInsertion', 'replacementDeletion',
    'markChange', 'attributeChange', 'nodeInsertion', 'nodeDeletion',
  ].includes(value.component)) throw new TypeError('Invalid tracked-change record.');
  if (value.reason !== undefined && (typeof value.reason !== 'string' || value.reason.length > MAX_REASON_LENGTH)) {
    throw new TypeError('Tracked-change reasons must be bounded text.');
  }
  if (value.commentThreadId !== undefined && !validId(value.commentThreadId)) {
    throw new TypeError('Tracked-change comment thread ids must be valid ids.');
  }
  if (value.component === 'markChange' && !value.markChange) throw new TypeError('Mark changes require before and after marks.');
  if (value.component === 'attributeChange' && !value.attributeChange) throw new TypeError('Attribute changes require before and after attributes.');
  return Object.freeze({
    id: value.id,
    component: value.component,
    user: normalizeTrackedChangesUser(value.user),
    createdAt: normalizeTimestamp(value.createdAt, 'creation'),
    updatedAt: normalizeTimestamp(value.updatedAt, 'update'),
    ...(value.reason ? { reason: value.reason } : {}),
    ...(value.markChange ? { markChange: Object.freeze({
      before: normalizeMarks(value.markChange.before, 'Tracked before-marks'),
      after: normalizeMarks(value.markChange.after, 'Tracked after-marks'),
    }) } : {}),
    ...(value.attributeChange ? { attributeChange: Object.freeze({
      before: normalizeAttributes(value.attributeChange.before, 'Tracked before-attributes'),
      after: normalizeAttributes(value.attributeChange.after, 'Tracked after-attributes'),
    }) } : {}),
    ...(value.commentThreadId ? { commentThreadId: value.commentThreadId } : {}),
  });
}

export function normalizeTrackedChangeList(value: unknown): readonly TrackedChangeRecord[] {
  if (!Array.isArray(value) || value.length > MAX_CHANGES_PER_TARGET) throw new TypeError('Invalid tracked-change stack.');
  const result = value.map((change) => normalizeTrackedChange(change as TrackedChangeRecord));
  const ids = new Set<string>();
  result.forEach((change) => {
    const key = `${change.id}:${change.component}`;
    if (ids.has(key)) throw new Error(`Duplicate tracked-change component: ${key}.`);
    ids.add(key);
  });
  return Object.freeze(result);
}

function safeTrackedChangeList(value: unknown): readonly TrackedChangeRecord[] {
  try { return normalizeTrackedChangeList(value); }
  catch { return Object.freeze([]); }
}

function regularMarks(node: Node): readonly Mark[] {
  return node.marks.filter((mark) => mark.type.name !== TRACKED_CHANGE_MARK);
}

function trackedChangesOnText(node: Node): readonly TrackedChangeRecord[] {
  const mark = node.marks.find((candidate) => candidate.type.name === TRACKED_CHANGE_MARK);
  return mark ? safeTrackedChangeList(mark.attrs.changes) : Object.freeze([]);
}

function trackedChangesOnNode(node: Node): readonly TrackedChangeRecord[] {
  return safeTrackedChangeList(node.attrs[TRACKED_NODE_ATTRIBUTE]);
}

function markJSON(marks: readonly Mark[]): readonly MarkJSON[] {
  return Object.freeze(marks.filter((mark) => mark.type.name !== TRACKED_CHANGE_MARK).map((mark) => mark.toJSON()));
}

function sameJSON(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function withoutTrackedNodeAttribute(attrs: Readonly<Attributes>): Attributes {
  const result = { ...attrs };
  delete result[TRACKED_NODE_ATTRIBUTE];
  return result;
}

function record(base: TrackedChangeBase, component: TrackedChangeComponent, values: Partial<TrackedChangeRecord> = {}): TrackedChangeRecord {
  return normalizeTrackedChange({ ...base, ...values, component });
}

function withTextChanges(node: Node, changes: readonly TrackedChangeRecord[], marks: readonly Mark[] = regularMarks(node)): Node {
  const without = marks.filter((mark) => mark.type.name !== TRACKED_CHANGE_MARK);
  if (!changes.length) return node.withMarks(without);
  const tracked = node.type.schema.mark(TRACKED_CHANGE_MARK, { changes });
  return node.withMarks([...without, tracked]);
}

function withNodeChanges(node: Node, changes: readonly TrackedChangeRecord[], attrs: Attributes = withoutTrackedNodeAttribute(node.attrs)): Node {
  return node.withAttrs({
    ...attrs,
    ...(changes.length ? { [TRACKED_NODE_ATTRIBUTE]: changes } : {}),
  });
}

function hasInsertion(changes: readonly TrackedChangeRecord[]): boolean {
  return changes.some((change) => ['insert', 'replacementInsertion', 'nodeInsertion'].includes(change.component));
}

function addTextRecord(node: Node, change: TrackedChangeRecord): Node {
  const changes = trackedChangesOnText(node);
  const ownInsertion = changes.find((candidate) => (
    ['insert', 'replacementInsertion'].includes(candidate.component)
    && candidate.user.id === change.user.id
  ));
  if (ownInsertion && ['insert', 'replacementInsertion'].includes(change.component)) {
    return withTextChanges(node, changes.map((candidate) => candidate === ownInsertion
      ? normalizeTrackedChange({ ...candidate, updatedAt: change.updatedAt })
      : candidate));
  }
  return withTextChanges(node, [...changes, change]);
}

function addNodeRecord(node: Node, change: TrackedChangeRecord): Node {
  const changes = trackedChangesOnNode(node);
  const ownInsertion = changes.find((candidate) => candidate.component === 'nodeInsertion' && candidate.user.id === change.user.id);
  if (ownInsertion && change.component === 'nodeInsertion') {
    return withNodeChanges(node, changes.map((candidate) => candidate === ownInsertion
      ? normalizeTrackedChange({ ...candidate, updatedAt: change.updatedAt })
      : candidate));
  }
  return withNodeChanges(node, [...changes, change]);
}

interface CharacterCell {
  readonly value: string;
  readonly node: Node;
}

function characters(nodes: readonly Node[]): readonly CharacterCell[] {
  // Fountain positions use JavaScript string offsets (UTF-16 code units). Using
  // Array.from would collapse surrogate pairs and make selections drift around
  // emoji or other astral characters.
  return nodes.flatMap((node) => (node.text ?? '').split('').map((value) => ({ value, node })));
}

function sameRegularMarks(left: Node, right: Node): boolean {
  return sameJSON(markJSON(regularMarks(left)), markJSON(regularMarks(right)));
}

function textFromCells(cells: readonly CharacterCell[], transform: (node: Node) => Node): readonly Node[] {
  const result: Node[] = [];
  cells.forEach((cell) => {
    const next = transform(cell.node).withText(cell.value);
    const previous = result.at(-1);
    if (previous && sameJSON(previous.attrs, next.attrs) && sameJSON(previous.marks.map((mark) => mark.toJSON()), next.marks.map((mark) => mark.toJSON()))) {
      result[result.length - 1] = previous.withText((previous.text ?? '') + cell.value);
    } else result.push(next);
  });
  return result;
}

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function diffTextChildren(
  before: readonly Node[],
  after: readonly Node[],
  base: TrackedChangeBase,
  parentPath: readonly number[] = [],
  hint?: TrackedTextDiffHint,
): readonly Node[] {
  const oldCells = characters(before);
  const newCells = characters(after);
  if (oldCells.length + newCells.length > MAX_INLINE_DIFF) {
    return [
      ...before.filter((node) => !hasInsertion(trackedChangesOnText(node))).map((node) => addTextRecord(node, record(base, 'delete'))),
      ...after.map((node) => addTextRecord(node, record(base, 'insert'))),
    ];
  }
  const hintedChild = hint && samePath(parentPath, hint.path.slice(0, -1)) ? hint.path.at(-1) : undefined;
  const exactHint = hintedChild !== undefined && hintedChild >= 0 && hintedChild < before.length
    && hint!.from >= 0 && hint!.to >= hint!.from && hint!.to <= (before[hintedChild]?.text?.length ?? 0);
  let prefix = exactHint
    ? before.slice(0, hintedChild).reduce((length, node) => length + (node.text?.length ?? 0), 0) + hint!.from
    : 0;
  if (!exactHint) {
    while (prefix < oldCells.length && prefix < newCells.length && oldCells[prefix]?.value === newCells[prefix]?.value) prefix += 1;
  }
  let suffix = exactHint ? oldCells.length - (prefix + hint!.to - hint!.from) : 0;
  if (!exactHint) {
    while (suffix < oldCells.length - prefix && suffix < newCells.length - prefix
      && oldCells[oldCells.length - suffix - 1]?.value === newCells[newCells.length - suffix - 1]?.value) suffix += 1;
  }

  const output: Node[] = [];
  // Preserve mark changes in unchanged text at either side of the edit.
  for (let index = 0; index < prefix; index += 1) {
    const oldCell = oldCells[index] as CharacterCell;
    const newCell = newCells[index] as CharacterCell;
    const node = sameRegularMarks(oldCell.node, newCell.node)
      ? newCell.node
      : addTextRecord(newCell.node, record(base, 'markChange', {
        markChange: { before: markJSON(regularMarks(oldCell.node)), after: markJSON(regularMarks(newCell.node)) },
      }));
    output.push(...textFromCells([{ value: newCell.value, node }], (value) => value));
  }

  const removed = oldCells.slice(prefix, oldCells.length - suffix);
  const inserted = newCells.slice(prefix, newCells.length - suffix);
  const replacement = removed.length > 0 && inserted.length > 0;
  output.push(...textFromCells(
    removed.filter((cell) => !hasInsertion(trackedChangesOnText(cell.node))),
    (node) => addTextRecord(node, record(base, replacement ? 'replacementDeletion' : 'delete')),
  ));
  output.push(...textFromCells(inserted, (node) => addTextRecord(
    node,
    record(base, replacement ? 'replacementInsertion' : 'insert'),
  )));

  for (let index = 0; index < suffix; index += 1) {
    const oldCell = oldCells[oldCells.length - suffix + index] as CharacterCell;
    const newCell = newCells[newCells.length - suffix + index] as CharacterCell;
    const node = sameRegularMarks(oldCell.node, newCell.node)
      ? newCell.node
      : addTextRecord(newCell.node, record(base, 'markChange', {
        markChange: { before: markJSON(regularMarks(oldCell.node)), after: markJSON(regularMarks(newCell.node)) },
      }));
    output.push(...textFromCells([{ value: newCell.value, node }], (value) => value));
  }

  // Coalesce character runs generated above.
  return textFromCells(characters(output), (node) => node);
}

function annotateDeletedNode(node: Node, base: TrackedChangeBase): readonly Node[] {
  if (node.isText) {
    if (hasInsertion(trackedChangesOnText(node))) return [];
    return [addTextRecord(node, record(base, 'delete'))];
  }
  if (hasInsertion(trackedChangesOnNode(node))) return [];
  return [addNodeRecord(node, record(base, 'nodeDeletion'))];
}

function annotateInsertedNode(node: Node, base: TrackedChangeBase): Node {
  return node.isText
    ? addTextRecord(node, record(base, 'insert'))
    : addNodeRecord(node, record(base, 'nodeInsertion'));
}

function diffChildren(
  before: readonly Node[],
  after: readonly Node[],
  base: TrackedChangeBase,
  path: readonly number[],
  hint?: TrackedTextDiffHint,
): readonly Node[] {
  if (before.every((node) => node.isText) && after.every((node) => node.isText)) {
    return diffTextChildren(before, after, base, path, hint);
  }
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix]?.eq(after[prefix] as Node)) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix
    && before[before.length - suffix - 1]?.eq(after[after.length - suffix - 1] as Node)) suffix += 1;
  const result: Node[] = [...after.slice(0, prefix)];
  const oldMiddle = before.slice(prefix, before.length - suffix);
  const newMiddle = after.slice(prefix, after.length - suffix);
  const pairs = Math.min(oldMiddle.length, newMiddle.length);
  for (let index = 0; index < pairs; index += 1) {
    const oldNode = oldMiddle[index] as Node;
    const newNode = newMiddle[index] as Node;
    if (oldNode.isText && newNode.isText) result.push(...diffTextChildren([oldNode], [newNode], base, [...path, prefix + index], hint));
    else if (oldNode.type === newNode.type) result.push(diffNode(oldNode, newNode, base, [...path, prefix + index], hint));
    else result.push(...annotateDeletedNode(oldNode, base), annotateInsertedNode(newNode, base));
  }
  oldMiddle.slice(pairs).forEach((node) => result.push(...annotateDeletedNode(node, base)));
  newMiddle.slice(pairs).forEach((node) => result.push(annotateInsertedNode(node, base)));
  result.push(...after.slice(after.length - suffix));
  return result;
}

function ensureEditableContent(node: Node, content: readonly Node[]): readonly Node[] {
  if (content.length || !node.type.spec.content || !/(?:inline|text)\*/.test(node.type.spec.content)) return content;
  return [node.type.schema.text('')];
}

function diffNode(before: Node, after: Node, base: TrackedChangeBase, path: readonly number[], hint?: TrackedTextDiffHint): Node {
  if (before.eq(after)) return after;
  if (before.isText && after.isText) {
    return diffTextChildren([before], [after], base, path.slice(0, -1), hint)[0] ?? after.type.schema.text('');
  }
  const beforeAttrs = withoutTrackedNodeAttribute(before.attrs);
  const afterAttrs = withoutTrackedNodeAttribute(after.attrs);
  let result = after.copy(ensureEditableContent(after, diffChildren(before.content, after.content, base, path, hint)));
  if (!sameJSON(beforeAttrs, afterAttrs)) {
    result = addNodeRecord(result, record(base, 'attributeChange', {
      attributeChange: { before: beforeAttrs, after: afterAttrs },
    }));
  }
  return result;
}

export function createTrackedDocument(
  before: Node,
  after: Node,
  baseValue: TrackedChangeBase,
  hint?: TrackedTextDiffHint,
): Node {
  const base: TrackedChangeBase = Object.freeze({
    id: baseValue.id,
    user: normalizeTrackedChangesUser(baseValue.user),
    createdAt: normalizeTimestamp(baseValue.createdAt, 'creation'),
    updatedAt: normalizeTimestamp(baseValue.updatedAt, 'update'),
    ...(baseValue.reason ? { reason: baseValue.reason } : {}),
    ...(baseValue.commentThreadId ? { commentThreadId: baseValue.commentThreadId } : {}),
  });
  if (before.type !== after.type) throw new Error('Tracked documents must use the same top node type.');
  const result = diffNode(before, after, base, [], hint);
  result.type.schema.validate(result);
  validateTrackedDocument(result);
  return result;
}

function marksFromJSON(node: Node, values: readonly MarkJSON[]): readonly Mark[] {
  return values.map((mark) => node.type.schema.markFromJSON(mark));
}

export type SuggestionDecision = 'accept' | 'reject';

function resolveNode(node: Node, suggestionId: string, decision: SuggestionDecision): readonly Node[] {
  if (node.isText) {
    const changes = trackedChangesOnText(node);
    const targets = changes.filter((change) => change.id === suggestionId);
    if (!targets.length) return [node];
    if (decision === 'reject' && targets.some((change) => ['insert', 'replacementInsertion'].includes(change.component))) return [];
    if (decision === 'accept' && targets.some((change) => ['delete', 'replacementDeletion'].includes(change.component))) return [];
    const remaining = changes.filter((change) => change.id !== suggestionId);
    const markChange = [...targets].reverse().find((change) => change.component === 'markChange')?.markChange;
    const marks = decision === 'reject' && markChange
      ? marksFromJSON(node, markChange.before)
      : regularMarks(node);
    return [withTextChanges(node, remaining, marks)];
  }

  const changes = trackedChangesOnNode(node);
  const targets = changes.filter((change) => change.id === suggestionId);
  if (decision === 'reject' && targets.some((change) => change.component === 'nodeInsertion')) return [];
  if (decision === 'accept' && targets.some((change) => change.component === 'nodeDeletion')) return [];
  const remaining = changes.filter((change) => change.id !== suggestionId);
  const attribute = [...targets].reverse().find((change) => change.component === 'attributeChange')?.attributeChange;
  const attrs = decision === 'reject' && attribute ? { ...attribute.before } : withoutTrackedNodeAttribute(node.attrs);
  const content = node.content.flatMap((child) => resolveNode(child, suggestionId, decision));
  return [withNodeChanges(node.copy(ensureEditableContent(node, content)), remaining, attrs)];
}

export function resolveTrackedSuggestion(document: Node, suggestionId: string, decision: SuggestionDecision): Node {
  if (!validId(suggestionId)) throw new TypeError('A valid suggestion id is required.');
  const result = resolveNode(document, suggestionId, decision)[0];
  if (!result) throw new Error('The document root cannot be removed by a suggestion.');
  result.type.schema.validate(result);
  return result;
}

export function resolveAllTrackedSuggestions(document: Node, decision: SuggestionDecision): Node {
  return findTrackedSuggestions(document).reduce(
    (current, suggestion) => resolveTrackedSuggestion(current, suggestion.id, decision),
    document,
  );
}

interface MutableSuggestion {
  id: string;
  components: Set<TrackedChangeComponent>;
  user: TrackedChangesUser;
  createdAt: string;
  updatedAt: string;
  reason?: string;
  from: number;
  to: number;
  text: string;
  replacedText: string;
  insertedNodes: NodeJSON[];
  deletedNodes: NodeJSON[];
  markChanges: TrackedMarkChange[];
  attributeChanges: TrackedAttributeChange[];
  commentThreadId?: string;
}

function suggestionType(components: ReadonlySet<TrackedChangeComponent>): TrackedSuggestionType {
  if (components.has('markChange')) return 'markChange';
  if (components.has('attributeChange')) return 'attributeChange';
  if (components.has('nodeInsertion') || components.has('nodeDeletion')) return 'structure';
  if (components.has('replacementInsertion') || components.has('replacementDeletion')) return 'replace';
  if (components.has('insert')) return 'insert';
  return 'delete';
}

export function findTrackedSuggestions(document: Node, filter: SuggestionFilter = {}): readonly TrackedSuggestion[] {
  const groups = new Map<string, MutableSuggestion>();
  const include = (change: TrackedChangeRecord, from: number, to: number, node: Node) => {
    const existing = groups.get(change.id);
    if (existing && (existing.user.id !== change.user.id || existing.createdAt !== change.createdAt)) {
      throw new Error(`Tracked suggestion ${change.id} has inconsistent authorship metadata.`);
    }
    const value = existing ?? {
      id: change.id,
      components: new Set<TrackedChangeComponent>(),
      user: change.user,
      createdAt: change.createdAt,
      updatedAt: change.updatedAt,
      ...(change.reason ? { reason: change.reason } : {}),
      from,
      to,
      text: '',
      replacedText: '',
      insertedNodes: [],
      deletedNodes: [],
      markChanges: [],
      attributeChanges: [],
      ...(change.commentThreadId ? { commentThreadId: change.commentThreadId } : {}),
    };
    value.components.add(change.component);
    value.from = Math.min(value.from, from);
    value.to = Math.max(value.to, to);
    if (change.updatedAt > value.updatedAt) value.updatedAt = change.updatedAt;
    const text = node.textContent;
    if (['insert', 'replacementInsertion', 'markChange'].includes(change.component)) value.text += text;
    if (['delete', 'replacementDeletion'].includes(change.component)) value.replacedText += text;
    if (change.component === 'nodeInsertion') value.insertedNodes.push(node.toJSON());
    if (change.component === 'nodeDeletion') value.deletedNodes.push(node.toJSON());
    if (change.markChange) value.markChanges.push(change.markChange);
    if (change.attributeChange) value.attributeChanges.push(change.attributeChange);
    groups.set(change.id, value);
  };

  document.descendants((node, path) => {
    if (node.isText) {
      const from = textPointToPosition(document, path, 0);
      const to = from + (node.text?.length ?? 0);
      trackedChangesOnText(node).forEach((change) => include(change, from, to, node));
    } else {
      const range = nodeRangeAtPath(document, path);
      trackedChangesOnNode(node).forEach((change) => include(change, range.from, range.to, node));
    }
  });
  if (groups.size > MAX_SUGGESTIONS) throw new RangeError('The document contains too many tracked suggestions.');

  const suggestions = [...groups.values()].map((value): TrackedSuggestion => Object.freeze({
    id: value.id,
    type: suggestionType(value.components),
    user: value.user,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(value.reason ? { reason: value.reason } : {}),
    from: value.from,
    to: value.to,
    text: value.text,
    fullText: value.text,
    ...(value.replacedText ? { replacedText: value.replacedText } : {}),
    ...(value.insertedNodes.length ? { insertedNodes: Object.freeze(value.insertedNodes) } : {}),
    ...(value.deletedNodes.length ? { deletedNodes: Object.freeze(value.deletedNodes) } : {}),
    ...(value.markChanges.length ? { markChanges: Object.freeze(value.markChanges) } : {}),
    ...(value.attributeChanges.length ? { attributeChanges: Object.freeze(value.attributeChanges) } : {}),
    ...(value.commentThreadId ? { commentThreadId: value.commentThreadId } : {}),
  }));
  return Object.freeze(suggestions
    .filter((suggestion) => (!filter.id || suggestion.id === filter.id)
      && (!filter.type || suggestion.type === filter.type)
      && (!filter.userId || suggestion.user.id === filter.userId)
      && (filter.from === undefined || suggestion.to >= filter.from)
      && (filter.to === undefined || suggestion.from <= filter.to))
    .sort((left, right) => left.from - right.from || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)));
}

export function findTrackedSuggestionById(document: Node, id: string): TrackedSuggestion | undefined {
  return findTrackedSuggestions(document, { id })[0];
}

export function validateTrackedDocument(document: Node): void {
  const seen = new Map<string, { userId: string; createdAt: string }>();
  let count = 0;
  document.descendants((node) => {
    const changes = node.isText
      ? node.marks.filter((mark) => mark.type.name === TRACKED_CHANGE_MARK).flatMap((mark) => normalizeTrackedChangeList(mark.attrs.changes))
      : node.attrs[TRACKED_NODE_ATTRIBUTE] === undefined ? [] : normalizeTrackedChangeList(node.attrs[TRACKED_NODE_ATTRIBUTE]);
    changes.forEach((change) => {
      count += 1;
      const previous = seen.get(change.id);
      if (previous && (previous.userId !== change.user.id || previous.createdAt !== change.createdAt)) {
        throw new Error(`Tracked suggestion ${change.id} has inconsistent authorship metadata.`);
      }
      seen.set(change.id, { userId: change.user.id, createdAt: change.createdAt });
    });
  });
  if (seen.size > MAX_SUGGESTIONS || count > MAX_SUGGESTIONS * MAX_CHANGES_PER_TARGET) {
    throw new RangeError('The document contains too many tracked changes.');
  }
}

export function setSuggestionCommentThread(document: Node, suggestionId: string, commentThreadId?: string): Node {
  if (!validId(suggestionId) || (commentThreadId !== undefined && !validId(commentThreadId))) {
    throw new TypeError('Suggestion and comment thread ids must be valid.');
  }
  const rewrite = (node: Node): Node => {
    if (node.isText) {
      const changes = trackedChangesOnText(node).map((change) => change.id === suggestionId
        ? normalizeTrackedChange({ ...change, commentThreadId })
        : change);
      return withTextChanges(node, changes);
    }
    const content = node.content.map(rewrite);
    const changes = trackedChangesOnNode(node).map((change) => change.id === suggestionId
      ? normalizeTrackedChange({ ...change, commentThreadId })
      : change);
    return withNodeChanges(node.copy(content), changes);
  };
  const result = rewrite(document);
  if (!findTrackedSuggestionById(result, suggestionId)) throw new Error(`Unknown tracked suggestion: ${suggestionId}`);
  return result;
}

function textPointOffset(document: Node, path: readonly number[], offset: number): number {
  let total = 0;
  let found = false;
  document.descendants((node, candidatePath) => {
    if (!node.isText || found) return;
    if (sameJSON(candidatePath, path)) {
      total += Math.max(0, Math.min(offset, node.text?.length ?? 0));
      found = true;
      return;
    }
    total += node.text?.length ?? 0;
  });
  return total;
}

function isDeletion(node: Node): boolean {
  const changes = node.isText ? trackedChangesOnText(node) : trackedChangesOnNode(node);
  return changes.some((change) => ['delete', 'replacementDeletion', 'nodeDeletion'].includes(change.component));
}

function visibleTextPoint(document: Node, target: number): { path: readonly number[]; offset: number } | undefined {
  let total = 0;
  let result: { path: readonly number[]; offset: number } | undefined;
  const visit = (node: Node, path: readonly number[], hidden: boolean): void => {
    if (result) return;
    const nextHidden = hidden || isDeletion(node);
    if (node.isText) {
      if (nextHidden) return;
      const length = node.text?.length ?? 0;
      if (target <= total + length) result = { path: Object.freeze([...path]), offset: Math.max(0, target - total) };
      else total += length;
      return;
    }
    node.content.forEach((child, index) => visit(child, [...path, index], nextHidden));
  };
  visit(document, [], false);
  if (result) return result;
  let last: { path: readonly number[]; offset: number } | undefined;
  document.descendants((node, path) => {
    if (node.isText && !isDeletion(node)) last = { path: Object.freeze([...path]), offset: node.text?.length ?? 0 };
  });
  return last;
}

/** Maps a selection from the user's proposed document into its review-mode form. */
export function mapSelectionToTrackedDocument(
  proposed: Node,
  tracked: Node,
  selection: AnySelection,
): AnySelection {
  if (selection instanceof AllSelection) return new AllSelection(tracked);
  if (selection instanceof NodeSelection) {
    try { return new NodeSelection(tracked, selection.nodePath); } catch { /* use text projection */ }
  }
  if (selection instanceof CellSelection) {
    try { return new CellSelection(tracked, selection.anchorCellPath, selection.headCellPath); } catch { /* use text projection */ }
  }
  if (selection instanceof GapSelection) {
    try { return new GapSelection(tracked, selection.position, selection.association); } catch { /* use text projection */ }
  }
  const start = visibleTextPoint(tracked, textPointOffset(proposed, selection.path, selection.from));
  const end = visibleTextPoint(tracked, textPointOffset(proposed, selection.endPath, selection.to));
  if (!start || !end) return new AllSelection(tracked);
  return Selection.range(start.path, start.offset, end.path, end.offset);
}
