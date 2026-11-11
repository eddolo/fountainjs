import { Editor, InsertTextStep, Mapping, Node, Plugin, PluginKey, ReplaceDocumentStep, ReplaceTextStep, StepMap,
  mapSelection, positionToTextPoint, textPointToPosition, type AnySelection, type Transaction } from '../../core';
import { rebaseInsertion } from '../../core/transaction/rebase-insertion';
import { rebaseDeletion, type DeletedRange } from '../../core/transaction/rebase-deletion';
import { getCollaborationAdapter } from '../collaboration-core';

export interface HistorySnapshot {
  doc: Node;
  selection: AnySelection;
}

export interface HistoryState {
  done: readonly HistorySnapshot[];
  undone: readonly HistorySnapshot[];
  lastAddedAt?: number;
  lastGroup?: string;
  lastSelection?: AnySelection;
}

export interface HistoryOptions {
  /** Maximum number of local undo groups retained. Defaults to 100. */
  depth?: number;
  /** Maximum pause between adjacent input events in one undo group. Defaults to 500ms. */
  newGroupDelay?: number;
}

const HISTORY_ACTION = 'fountain$historyAction';
const HISTORY_GROUP = 'fountain$historyGroup';
const HISTORY_TIME = 'fountain$historyTime';
const CLOSE_HISTORY = 'fountain$closeHistory';
const PRESERVE_HISTORY_GROUP = 'fountain$preserveHistoryGroup';
export const historyKey = new PluginKey<HistoryState>('history');

interface MapChain {
  readonly maps: readonly StepMap[];
  readonly next?: MapChain;
}

// Chains contain only immutable position maps, never snapshots or documents.
// Extending an input group is constant-time and cannot retain old model roots
// through discarded snapshot keys.
const snapshotMaps = new WeakMap<HistorySnapshot, MapChain>();
const inverseMaps = (transaction: Transaction): readonly StepMap[] =>
  Object.freeze([...transaction.mapping.maps].reverse().map(map => map.invert()));

function prependMaps(snapshot: HistorySnapshot, maps: readonly StepMap[]): HistorySnapshot {
  const previous = snapshotMaps.get(snapshot);
  if (!previous) return snapshot; // External/legacy snapshots retain replacement semantics.
  const updated = { ...snapshot };
  snapshotMaps.set(updated, { maps, next: previous });
  return updated;
}

function advanceTop(snapshots: readonly HistorySnapshot[], maps: readonly StepMap[]): readonly HistorySnapshot[] {
  const last = snapshots.at(-1);
  return last ? [...snapshots.slice(0, -1), prependMaps(last, maps)] : snapshots;
}

function rebaseInsertedText(snapshots: readonly HistorySnapshot[], sourceSize: number, position: number,
  text: string): readonly HistorySnapshot[] | undefined {
  const updated = [...snapshots];
  for (let index = snapshots.length - 1; index >= 0; index--) {
    const snapshot = snapshots[index]!, chain = snapshotMaps.get(snapshot);
    if (!chain) return undefined;
    const maps: StepMap[] = [];
    for (let current: MapChain | undefined = chain; current; current = current.next) for (const map of current.maps) {
      const rebased = rebaseInsertion(map, sourceSize, position, text.length);
      maps.push(rebased.map); sourceSize = rebased.targetSize; position = rebased.targetPosition;
    }
    if (sourceSize !== snapshot.doc.nodeSize - 2) return undefined;
    const point = positionToTextPoint(snapshot.doc, position, 1);
    if (textPointToPosition(snapshot.doc, point.path, point.offset) !== position) return undefined;
    const insertion = new InsertTextStep(point.path, point.offset, text), doc = insertion.apply(snapshot.doc);
    doc.type.schema.validate(doc);
    const rebasedSnapshot = { doc, selection: mapSelection(snapshot.selection, snapshot.doc, doc, insertion.getMap(snapshot.doc)) };
    snapshotMaps.set(rebasedSnapshot, { maps: Object.freeze(maps) });
    updated[index] = rebasedSnapshot;
  }
  return updated;
}

function deleteSnapshotText(snapshot: HistorySnapshot, ranges: readonly DeletedRange[]): HistorySnapshot {
  if (!ranges.length) return { ...snapshot };
  let covered = 0, rangeIndex = 0;
  const visit = (node: Node, position: number, root = false): Node => {
    while (rangeIndex < ranges.length && ranges[rangeIndex]!.to <= position) rangeIndex++;
    if (rangeIndex >= ranges.length || ranges[rangeIndex]!.from >= position + node.nodeSize) return node;
    if (node.isText) {
      const text = node.text!, parts: string[] = [];
      let cursor = 0;
      for (let index = rangeIndex; index < ranges.length && ranges[index]!.from < position + text.length; index++) {
        const range = ranges[index]!, from = Math.max(0, range.from - position), to = Math.min(text.length, range.to - position);
        if (to <= from) continue;
        parts.push(text.slice(cursor, from)); cursor = to; covered += to - from;
      }
      parts.push(text.slice(cursor));
      return cursor ? node.withText(parts.join('')) : node;
    }
    let offset = root ? position : position + 1, changed = false;
    const content = node.content.map(child => {
      const next = visit(child, offset); offset += child.nodeSize; changed ||= next !== child; return next;
    });
    return changed ? node.copy(content) : node;
  };
  const doc = visit(snapshot.doc, 0, true);
  if (covered !== ranges.reduce((sum, range) => sum + range.to - range.from, 0)) {
    throw new Error('Independent text deletion cannot remove structural units.');
  }
  doc.type.schema.validate(doc);
  const mapping = new Mapping([...ranges].reverse().map(range => new StepMap([range.from, range.to - range.from, 0])));
  return { doc, selection: mapSelection(snapshot.selection, snapshot.doc, doc, mapping) };
}

function rebaseDeletedText(snapshots: readonly HistorySnapshot[], sourceSize: number,
  ranges: readonly DeletedRange[]): readonly HistorySnapshot[] | undefined {
  const updated = [...snapshots];
  for (let index = snapshots.length - 1; index >= 0; index--) {
    const snapshot = snapshots[index]!, chain = snapshotMaps.get(snapshot);
    if (!chain) return undefined;
    const maps: StepMap[] = [];
    for (let current: MapChain | undefined = chain; current; current = current.next) for (const map of current.maps) {
      const rebased = rebaseDeletion(map, sourceSize, ranges);
      maps.push(rebased.map); sourceSize = rebased.targetSize; ranges = rebased.targetRanges;
    }
    if (sourceSize !== snapshot.doc.nodeSize - 2) return undefined;
    const rebasedSnapshot = deleteSnapshotText(snapshot, ranges);
    snapshotMaps.set(rebasedSnapshot, { maps: Object.freeze(maps) }); updated[index] = rebasedSnapshot;
  }
  return updated;
}

function rebaseIndependentText(value: HistoryState, transaction: Transaction): HistoryState | undefined {
  if (!transaction.steps.length) return undefined;
  let current = value, before = transaction.originalDoc;
  try {
    for (const step of transaction.steps) {
      if (!(step instanceof ReplaceTextStep)) return undefined;
      const position = textPointToPosition(before, step.path, step.from), removed = step.to - step.from;
      const size = before.nodeSize - 2;
      if (removed) {
        const ranges = [{ from: position, to: position + removed }];
        const done = rebaseDeletedText(current.done, size, ranges), undone = rebaseDeletedText(current.undone, size, ranges);
        if (!done || !undone) return undefined;
        current = { ...current, done, undone };
      }
      if (step.text.length) {
        const done = rebaseInsertedText(current.done, size - removed, position, step.text);
        const undone = rebaseInsertedText(current.undone, size - removed, position, step.text);
        if (!done || !undone) return undefined;
        current = { ...current, done, undone };
      }
      before = step.apply(before);
    }
  } catch { return undefined; } // Unrepresentable destinations keep the existing fallback pending broader rebasing.
  return current;
}

class RestoreHistoryStep extends ReplaceDocumentStep {
  constructor(document: Node, private readonly maps: readonly StepMap[]) { super(document); }
  override getMaps(): readonly StepMap[] { return this.maps; }
}

function withoutOpenGroup(value: HistoryState): HistoryState {
  if (value.lastGroup === undefined && value.lastAddedAt === undefined && value.lastSelection === undefined) return value;
  return { done: value.done, undone: value.undone };
}

export function createHistoryPlugin(options: HistoryOptions = {}): Plugin<HistoryState> {
  const depth = options.depth ?? 100;
  const newGroupDelay = options.newGroupDelay ?? 500;
  if (!Number.isInteger(depth) || depth < 1) throw new RangeError('History depth must be a positive integer.');
  if (!Number.isFinite(newGroupDelay) || newGroupDelay < 0) throw new RangeError('History newGroupDelay must be zero or greater.');

  return new Plugin<HistoryState>({
    key: historyKey,
    state: {
      init: () => ({ done: [], undone: [] }),
      apply: (transaction, value, oldState) => {
        if (transaction.getMeta('history$reset') === true) return { done: [], undone: [] };
        const action = transaction.getMeta<'undo' | 'redo'>(HISTORY_ACTION);
        const current = { doc: oldState.doc, selection: oldState.selection };
        const inverse = transaction.docChanged ? inverseMaps(transaction) : [];
        if (action === 'undo' || action === 'redo') {
          snapshotMaps.set(current, { maps: inverse });
          return action === 'undo'
            ? { done: value.done.slice(0, -1), undone: [...value.undone, current] }
            : { done: [...value.done, current].slice(-depth), undone: value.undone.slice(0, -1) };
        }
        const unrecorded = transaction.getMeta('addToHistory') === false
          || transaction.getMeta(CLOSE_HISTORY) === true || transaction.getMeta(PRESERVE_HISTORY_GROUP) === true;
        const independent = transaction.docChanged && transaction.getMeta('addToHistory') === false
          && transaction.getMeta(PRESERVE_HISTORY_GROUP) !== true && transaction.getMeta(CLOSE_HISTORY) !== true;
        const rebased = independent ? rebaseIndependentText(value, transaction) : undefined;
        const advanced = rebased ?? (transaction.docChanged && unrecorded ? { ...value,
          done: advanceTop(value.done, inverse), undone: advanceTop(value.undone, inverse) } : value);
        if (transaction.getMeta(CLOSE_HISTORY) === true) return withoutOpenGroup(advanced);
        if (transaction.getMeta(PRESERVE_HISTORY_GROUP) === true) return advanced;
        if (!transaction.docChanged || transaction.getMeta('addToHistory') === false) {
          return transaction.selectionSet || transaction.docChanged ? withoutOpenGroup(advanced) : advanced;
        }

        const group = transaction.getMeta<string>(HISTORY_GROUP);
        const addedAt = transaction.getMeta<number>(HISTORY_TIME) ?? Date.now();
        const joinsPrevious = group !== undefined
          && group === value.lastGroup
          && value.lastAddedAt !== undefined
          && addedAt - value.lastAddedAt <= newGroupDelay
          && value.lastSelection?.eq(oldState.selection) === true;
        const previous = joinsPrevious ? value.done.at(-1) : undefined;
        let done: readonly HistorySnapshot[];
        if (previous) {
          done = [...value.done.slice(0, -1), prependMaps(previous, inverse)];
        } else {
          snapshotMaps.set(current, { maps: inverse });
          done = [...value.done, current].slice(-depth);
        }
        return {
          done,
          undone: [],
          lastAddedAt: addedAt,
          lastGroup: group,
          lastSelection: transaction.selection,
        };
      },
    },
    props: {
      handleKeyDown: (editor, event) => {
        const modifier = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (!modifier || event.altKey || (key !== 'z' && key !== 'y')) return false;
        event.preventDefault();
        return key === 'y' || event.shiftKey ? redo(editor) : undo(editor);
      },
    },
  });
}

export const historyPlugin = createHistoryPlugin();

/** Starts a new undo group for the next document change. */
export function closeHistory(editor: Editor): boolean {
  editor.dispatch(editor.state.createTransaction().setMeta(CLOSE_HISTORY, true).setMeta('force', true));
  return true;
}

/** @internal Marks browser input transactions for adjacent-event grouping. */
export function setHistoryGroup(
  transaction: ReturnType<Editor['createTransaction']>,
  group: string,
  timestamp = Date.now(),
): void {
  transaction.setMeta(HISTORY_GROUP, group).setMeta(HISTORY_TIME, timestamp);
}

function restore(editor: Editor, snapshot: HistorySnapshot, action: 'undo' | 'redo'): boolean {
  const chain = snapshotMaps.get(snapshot);
  const transaction = editor.state.createTransaction();
  if (chain) {
    const maps: StepMap[] = [];
    for (let current: MapChain | undefined = chain; current; current = current.next) {
      current.maps.forEach(map => maps.push(map));
    }
    transaction.step(new RestoreHistoryStep(snapshot.doc, Object.freeze(maps)));
  } else transaction.replaceDocument(snapshot.doc);
  transaction
    .setSelection(snapshot.selection)
    .setMeta(HISTORY_ACTION, action)
    .setMeta('addToHistory', false);
  return editor.dispatch(transaction);
}

export function canUndo(editor: Editor): boolean {
  if (!editor.editable) return false;
  const adapter = getCollaborationAdapter(editor);
  if (adapter?.undo) return adapter.canUndo?.() ?? false;
  return (historyKey.get(editor.state)?.done.length ?? 0) > 0;
}
export function canRedo(editor: Editor): boolean {
  if (!editor.editable) return false;
  const adapter = getCollaborationAdapter(editor);
  if (adapter?.redo) return adapter.canRedo?.() ?? false;
  return (historyKey.get(editor.state)?.undone.length ?? 0) > 0;
}

export function undo(editor: Editor): boolean {
  if (!editor.editable) return false;
  const adapter = getCollaborationAdapter(editor);
  if (adapter?.undo) return adapter.undo();
  const snapshot = historyKey.get(editor.state)?.done.at(-1);
  return snapshot ? restore(editor, snapshot, 'undo') : false;
}

export function redo(editor: Editor): boolean {
  if (!editor.editable) return false;
  const adapter = getCollaborationAdapter(editor);
  if (adapter?.redo) return adapter.redo();
  const snapshot = historyKey.get(editor.state)?.undone.at(-1);
  return snapshot ? restore(editor, snapshot, 'redo') : false;
}
