import {
  Decoration,
  DecorationSet,
  Plugin,
  PluginKey,
  Selection,
  nodeRangeAtPath,
  textPointToPosition,
  type Editor,
  type EditorState,
  type Node,
  type Transaction,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';
import type { LeanCheckResult, LeanDiagnostic, LeanPosition, LeanRequest } from './types';

export const LEAN_DIAGNOSTICS_META = 'fountain$leanDiagnostics';

interface LeanDiagnosticsUpdate {
  readonly request: LeanRequest;
  readonly result: LeanCheckResult;
}

export interface LeanDiagnosticsState {
  readonly blockPath?: readonly number[];
  readonly blockFrom?: number;
  readonly source?: string;
  readonly result?: LeanCheckResult;
  readonly decorations: DecorationSet;
}

function isLeanBlock(node: Node): boolean {
  return node.type.name === 'code_block' && String(node.attrs.language).toLowerCase() === 'lean';
}

function offsetAt(source: string, position: LeanPosition): number {
  const lines = source.split('\n');
  let offset = 0;
  for (let line = 0; line < position.line; line += 1) offset += (lines[line]?.length ?? 0) + 1;
  return offset + position.character;
}

function textPointAtOffset(doc: Node, blockPath: readonly number[], offset: number): { path: readonly number[]; offset: number } {
  const block = getNodeAtPath(doc, blockPath);
  let cursor = 0;
  for (let childIndex = 0; childIndex < block.childCount; childIndex += 1) {
    const child = block.child(childIndex);
    if (!child.isText) continue;
    const length = child.text?.length ?? 0;
    if (offset <= cursor + length) return { path: [...blockPath, childIndex], offset: offset - cursor };
    cursor += length;
  }
  throw new RangeError('Lean diagnostic position exceeds the block source.');
}

function diagnosticAttributes(diagnostic: LeanDiagnostic): Readonly<Record<string, string>> {
  return {
    class: `fountain-lean-diagnostic fountain-lean-diagnostic--${diagnostic.severity}`,
    'data-fountain-lean-diagnostic': diagnostic.severity,
    'aria-description': `${diagnostic.severity}: ${diagnostic.message}`,
    ...(diagnostic.severity === 'error' ? { 'aria-invalid': 'true' } : {}),
    title: diagnostic.message,
  };
}

function textSegments(
  doc: Node,
  blockPath: readonly number[],
  sourceFrom: number,
  sourceTo: number,
  diagnostic: LeanDiagnostic,
): Decoration[] {
  const block = getNodeAtPath(doc, blockPath);
  const decorations: Decoration[] = [];
  let cursor = 0;
  block.content.forEach((child, childIndex) => {
    if (!child.isText) return;
    const length = child.text?.length ?? 0;
    const from = Math.max(sourceFrom, cursor);
    const to = Math.min(sourceTo, cursor + length);
    if (from < to) {
      decorations.push(Decoration.inline(
        textPointToPosition(doc, [...blockPath, childIndex], from - cursor),
        textPointToPosition(doc, [...blockPath, childIndex], to - cursor),
        diagnosticAttributes(diagnostic),
        { key: `lean-${diagnostic.severity}-${sourceFrom}-${sourceTo}-${childIndex}` },
      ));
    }
    cursor += length;
  });
  return decorations;
}

function widgetAt(
  doc: Node,
  blockPath: readonly number[],
  sourceOffset: number,
  diagnostic: LeanDiagnostic,
): Decoration | null {
  const block = getNodeAtPath(doc, blockPath);
  let cursor = 0;
  for (let childIndex = 0; childIndex < block.childCount; childIndex += 1) {
    const child = block.child(childIndex);
    if (!child.isText) continue;
    const length = child.text?.length ?? 0;
    if (sourceOffset <= cursor + length) {
      const position = textPointToPosition(doc, [...blockPath, childIndex], sourceOffset - cursor);
      return Decoration.widget(position, () => {
        const marker = document.createElement('span');
        Object.entries(diagnosticAttributes(diagnostic)).forEach(([name, value]) => {
          if (name === 'class') marker.className = value;
          else marker.setAttribute(name, value);
        });
        marker.setAttribute('aria-label', `${diagnostic.severity}: ${diagnostic.message}`);
        marker.dataset.fountainLeanDiagnosticMarker = 'true';
        marker.textContent = '●';
        return marker;
      }, { key: `lean-${diagnostic.severity}-${sourceOffset}-point`, side: 1 });
    }
    cursor += length;
  }
  return null;
}

function decorationsFor(doc: Node, request: LeanRequest, result: LeanCheckResult): DecorationSet {
  const decorations = result.diagnostics.flatMap((diagnostic) => {
    const from = offsetAt(request.source, diagnostic.range.start);
    const to = offsetAt(request.source, diagnostic.range.end);
    if (from === to) {
      const widget = widgetAt(doc, request.blockPath, from, diagnostic);
      return widget ? [widget] : [];
    }
    return textSegments(doc, request.blockPath, from, to, diagnostic);
  });
  return DecorationSet.create(doc, decorations);
}

function empty(): LeanDiagnosticsState {
  return Object.freeze({ decorations: DecorationSet.empty });
}

function findMappedBlock(doc: Node, position: number, source: string): readonly number[] | null {
  let found: readonly number[] | null = null;
  doc.descendants((node, path) => {
    if (found || !isLeanBlock(node)) return !found;
    if (nodeRangeAtPath(doc, path).from === position && node.textContent === source) {
      found = Object.freeze([...path]);
      return false;
    }
    return true;
  });
  return found;
}

function applyDiagnostics(
  transaction: Transaction,
  value: LeanDiagnosticsState,
  newState: EditorState,
): LeanDiagnosticsState {
  const update = transaction.getMeta<LeanDiagnosticsUpdate | null>(LEAN_DIAGNOSTICS_META);
  if (update === null) return empty();
  if (update) {
    const block = getNodeAtPath(newState.doc, update.request.blockPath);
    if (!isLeanBlock(block) || block.textContent !== update.request.source) return empty();
    return Object.freeze({
      blockPath: update.request.blockPath,
      blockFrom: nodeRangeAtPath(newState.doc, update.request.blockPath).from,
      source: update.request.source,
      result: update.result,
      decorations: decorationsFor(newState.doc, update.request, update.result),
    });
  }
  if (!transaction.docChanged || value.blockFrom === undefined || value.source === undefined) return value;
  const mappedFrom = transaction.mapping.map(value.blockFrom, 1);
  const blockPath = findMappedBlock(newState.doc, mappedFrom, value.source);
  if (!blockPath) return empty();
  return Object.freeze({
    ...value,
    blockPath,
    blockFrom: mappedFrom,
    decorations: value.decorations.map(transaction.mapping, newState.doc),
  });
}

export const leanDiagnosticsKey = new PluginKey<LeanDiagnosticsState>('lean-diagnostics');

export const leanDiagnosticsPlugin = new Plugin<LeanDiagnosticsState>({
  key: leanDiagnosticsKey,
  state: {
    init: empty,
    apply: (transaction, value, _oldState, newState) => applyDiagnostics(transaction, value, newState),
  },
  props: { decorations: (state) => leanDiagnosticsKey.get(state)?.decorations },
});

export function getLeanDiagnostics(state: EditorState): LeanDiagnosticsState | undefined {
  return leanDiagnosticsKey.get(state);
}

export function clearLeanDiagnostics(editor: Editor): void {
  if (leanDiagnosticsKey.get(editor.state) === undefined) return;
  editor.dispatch(editor.state.createTransaction()
    .setMeta(LEAN_DIAGNOSTICS_META, null)
    .setMeta('addToHistory', false)
    .setMeta('force', true));
}

export function publishLeanDiagnostics(editor: Editor, request: LeanRequest, result: LeanCheckResult): void {
  if (leanDiagnosticsKey.get(editor.state) === undefined) return;
  editor.dispatch(editor.state.createTransaction()
    .setMeta(LEAN_DIAGNOSTICS_META, Object.freeze({ request, result }))
    .setMeta('addToHistory', false)
    .setMeta('force', true));
}

/** Selects a diagnostic's exact source range when the provider result is current. */
export function selectLeanDiagnostic(editor: Editor, request: LeanRequest, diagnostic: LeanDiagnostic): boolean {
  try {
    const block = getNodeAtPath(editor.state.doc, request.blockPath);
    if (!isLeanBlock(block) || block.textContent !== request.source) return false;
    const start = textPointAtOffset(editor.state.doc, request.blockPath, offsetAt(request.source, diagnostic.range.start));
    const end = textPointAtOffset(editor.state.doc, request.blockPath, offsetAt(request.source, diagnostic.range.end));
    editor.dispatch(editor.state.createTransaction().setSelection(new Selection(
      start.path,
      start.offset,
      end.offset,
      end.path,
    )));
    return true;
  } catch { return false; }
}
