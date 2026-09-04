// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  CoreExtension,
  EditorView,
  HistoryExtension,
  Selection,
  composeExtensions,
  createEditor,
  insertText,
  selectText,
  toggleMark,
  undo,
  type Editor,
  type NodeJSON,
} from '../src';
import {
  acceptAllTrackedSuggestions,
  acceptTrackedSuggestion,
  addTrackedDeletion,
  addTrackedInsertion,
  addTrackedNodeAttributeChange,
  addTrackedReplacement,
  createTrackedChangesExtension,
  disableTrackedChanges,
  findTrackedSuggestions,
  getTrackedChangesState,
  hoverTrackedSuggestions,
  linkTrackedSuggestionToComment,
  rejectAllTrackedSuggestions,
  rejectTrackedSuggestion,
  selectTrackedSuggestion,
  setTrackedChangesUser,
  subscribeTrackedChanges,
  dispatchTrackedTransaction,
  validateTrackedDocument,
} from '../src/tracked-changes';
import { createYjsCollaborationExtension } from '../src/yjs';

const paragraph = (text: string, attrs: Record<string, unknown> = {}): NodeJSON => ({
  type: 'paragraph',
  ...(Object.keys(attrs).length ? { attrs } : {}),
  content: [{ type: 'text', text }],
});

function trackedEditor(content: readonly NodeJSON[] = [paragraph('Alpha')], idPrefix = 'change'): Editor {
  let id = 0;
  const tracked = createTrackedChangesExtension({
    user: { id: 'ada', name: 'Ada Lovelace', color: '#7c3aed' },
    idFactory: () => `${idPrefix}-${++id}`,
    now: () => new Date('2026-09-04T12:00:00.000Z'),
  });
  const kit = composeExtensions([CoreExtension, HistoryExtension, tracked]);
  return createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content } });
}

describe('provider-independent tracked changes', () => {
  it('tracks insertions and retains portable authorship metadata until review', () => {
    const editor = trackedEditor();
    selectText(editor, [0, 0], 5);
    expect(insertText(editor, '!')).toBe(true);

    const [suggestion] = getTrackedChangesState(editor)!.suggestions;
    expect(suggestion).toMatchObject({ type: 'insert', text: '!', user: { id: 'ada', name: 'Ada Lovelace' } });
    expect(editor.getText()).toBe('Alpha!');
    expect(JSON.stringify(editor.getJSON())).toContain('tracked_change');
    validateTrackedDocument(editor.state.doc);

    expect(acceptTrackedSuggestion(editor, suggestion!.id)).toBe(true);
    expect(editor.getText()).toBe('Alpha!');
    expect(findTrackedSuggestions(editor.state.doc)).toHaveLength(0);
  });

  it('retains suggested deletions and makes accept/reject exact inverses', () => {
    const accepted = trackedEditor();
    expect(addTrackedDeletion(accepted, [0, 0], 1, 4, 'Remove middle letters')).toBe(true);
    const suggestion = getTrackedChangesState(accepted)!.suggestions[0]!;
    expect(suggestion).toMatchObject({ type: 'delete', replacedText: 'lph', reason: 'Remove middle letters' });
    expect(accepted.getText()).toBe('Alpha');
    expect(acceptTrackedSuggestion(accepted, suggestion.id)).toBe(true);
    expect(accepted.getText()).toBe('Aa');

    const rejected = trackedEditor();
    addTrackedDeletion(rejected, [0, 0], 1, 4);
    expect(rejectTrackedSuggestion(rejected, getTrackedChangesState(rejected)!.suggestions[0]!.id)).toBe(true);
    expect(rejected.getText()).toBe('Alpha');
  });

  it('tracks replacement components under one suggestion id', () => {
    const editor = trackedEditor();
    expect(addTrackedReplacement(editor, [0, 0], 0, 5, 'Beta', 'Use the clearer term')).toBe(true);
    const suggestion = getTrackedChangesState(editor)!.suggestions[0]!;
    expect(suggestion).toMatchObject({ type: 'replace', text: 'Beta', replacedText: 'Alpha', reason: 'Use the clearer term' });
    expect(editor.getText()).toBe('AlphaBeta');
    expect(rejectTrackedSuggestion(editor, suggestion.id)).toBe(true);
    expect(editor.getText()).toBe('Alpha');
  });

  it('groups adjacent typing by the same author and cancels edits to their pending insertion', () => {
    const editor = trackedEditor();
    selectText(editor, [0, 0], 5);
    insertText(editor, '!');
    insertText(editor, '?');
    const suggestions = getTrackedChangesState(editor)!.suggestions;
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ type: 'insert', text: '!?' });

    const insertedPath = editor.state.selection.path;
    expect(dispatchTrackedTransaction(editor, (transaction) => transaction
      .replaceText(insertedPath, 1, 2, '')
      .setSelection(Selection.cursor(insertedPath, 1)))).toBe(true);
    expect(getTrackedChangesState(editor)!.suggestions[0]?.text).toBe('!');
  });

  it('tracks mark changes with before/after formatting and restores either state', () => {
    const accepted = trackedEditor();
    selectText(accepted, [0, 0], 0, 5);
    expect(toggleMark(accepted, 'strong')).toBe(true);
    const suggestion = getTrackedChangesState(accepted)!.suggestions[0]!;
    expect(suggestion.type).toBe('markChange');
    expect(suggestion.markChanges?.[0]).toEqual({ before: [], after: [{ type: 'strong' }] });
    acceptTrackedSuggestion(accepted, suggestion.id);
    expect(accepted.state.doc.child(0).child(0).marks.map((mark) => mark.type.name)).toEqual(['strong']);

    const rejected = trackedEditor();
    selectText(rejected, [0, 0], 0, 5);
    toggleMark(rejected, 'strong');
    rejectTrackedSuggestion(rejected, getTrackedChangesState(rejected)!.suggestions[0]!.id);
    expect(rejected.state.doc.child(0).child(0).marks).toHaveLength(0);

    const removal = trackedEditor([{ type: 'paragraph', content: [{ type: 'text', text: 'Bold', marks: [{ type: 'strong' }] }] }]);
    selectText(removal, [0, 0], 0, 4);
    toggleMark(removal, 'strong');
    const removedMark = getTrackedChangesState(removal)!.suggestions[0]!;
    expect(removedMark.markChanges?.[0]).toEqual({ before: [{ type: 'strong' }], after: [] });
    rejectTrackedSuggestion(removal, removedMark.id);
    expect(removal.state.doc.child(0).child(0).marks.map((mark) => mark.type.name)).toEqual(['strong']);
  });

  it('tracks node attributes and structural insertion/deletion', () => {
    const attributes = trackedEditor();
    expect(addTrackedNodeAttributeChange(attributes, [0], { align: 'center' })).toBe(true);
    const attributeSuggestion = getTrackedChangesState(attributes)!.suggestions[0]!;
    expect(attributeSuggestion.type).toBe('attributeChange');
    rejectTrackedSuggestion(attributes, attributeSuggestion.id);
    expect(attributes.state.doc.child(0).attrs.align).toBe('left');

    const structure = trackedEditor([paragraph('One'), paragraph('Two')], 'structure');
    const inserted = structure.state.schema.nodeFromJSON(paragraph('Middle'));
    expect(structure.dispatch(structure.state.createTransaction().replace(1, 1, [inserted]))).toBe(true);
    const insertion = getTrackedChangesState(structure)!.suggestions.find((item) => item.insertedNodes?.length)!;
    expect(insertion.type).toBe('structure');
    expect(rejectTrackedSuggestion(structure, insertion.id)).toBe(true);
    expect(structure.getText()).toBe('One\nTwo');

    expect(structure.dispatch(structure.state.createTransaction().replace(0, 1, []))).toBe(true);
    const deletion = getTrackedChangesState(structure)!.suggestions.find((item) => item.deletedNodes?.length)!;
    expect(structure.getText()).toBe('One\nTwo');
    expect(acceptTrackedSuggestion(structure, deletion.id)).toBe(true);
    expect(structure.getText()).toBe('Two');

    const split = trackedEditor([paragraph('Alpha Beta')], 'split');
    const first = split.state.schema.nodeFromJSON(paragraph('Alpha'));
    const second = split.state.schema.nodeFromJSON(paragraph(' Beta'));
    split.dispatch(split.state.createTransaction().replace(0, 1, [first, second]));
    const splitSuggestion = getTrackedChangesState(split)!.suggestions[0]!;
    expect(splitSuggestion.type).toBe('structure');
    rejectTrackedSuggestion(split, splitSuggestion.id);
    expect(split.getJSON().content).toHaveLength(1);
    expect(split.getText()).toBe('Alpha Beta');
  });

  it('keeps UTF-16 caret offsets stable around emoji', () => {
    const editor = trackedEditor([paragraph('A😀B')], 'emoji');
    expect(addTrackedInsertion(editor, [0, 0], 3, '!')).toBe(true);
    expect(editor.getText()).toBe('A😀!B');
    expect(editor.state.selection).toMatchObject({ path: [0, 1], from: 1, to: 1 });
    expect(getTrackedChangesState(editor)!.suggestions[0]?.text).toBe('!');
  });

  it('supports author, range, batch, selection, hover, comments, and enable controls', () => {
    const editor = trackedEditor();
    const events: string[] = [];
    subscribeTrackedChanges(editor, (event) => events.push(event.type));
    addTrackedInsertion(editor, [0, 0], 5, '!');
    const first = getTrackedChangesState(editor)!.suggestions[0]!;
    expect(linkTrackedSuggestionToComment(editor, first.id, 'thread-1')).toBe(true);
    expect(getTrackedChangesState(editor)!.suggestions[0]?.commentThreadId).toBe('thread-1');
    expect(selectTrackedSuggestion(editor, first.id)).toBe(true);
    expect(hoverTrackedSuggestions(editor, [first.id])).toBe(true);
    expect(getTrackedChangesState(editor)).toMatchObject({ selectedSuggestionId: first.id, hoveredSuggestionIds: [first.id] });

    setTrackedChangesUser(editor, { id: 'grace', name: 'Grace Hopper' });
    addTrackedInsertion(editor, [0, 0], 0, '>');
    expect(getTrackedChangesState(editor)!.suggestions.map((item) => item.user.id).sort()).toEqual(['ada', 'grace']);
    expect(acceptAllTrackedSuggestions(editor, { userId: 'ada' })).toBe(true);
    expect(getTrackedChangesState(editor)!.suggestions.map((item) => item.user.id)).toEqual(['grace']);
    expect(rejectAllTrackedSuggestions(editor)).toBe(true);
    expect(getTrackedChangesState(editor)!.suggestions).toHaveLength(0);

    expect(disableTrackedChanges(editor)).toBe(true);
    addTrackedInsertion(editor, [0, 0], 0, 'Plain ');
    expect(getTrackedChangesState(editor)!.suggestions).toHaveLength(0);
    expect(events).toContain('suggestion-created');
    expect(events).toContain('disabled');
  });

  it('renders accessible insertion/deletion and structural review states without executing metadata', () => {
    const editor = trackedEditor([paragraph('Alpha'), paragraph('Second')], 'render');
    addTrackedReplacement(editor, [0, 0], 0, 5, 'Beta');
    addTrackedNodeAttributeChange(editor, [1], { align: 'center' });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor, { ariaLabel: 'Tracked document' });

    expect(mount.querySelector('del.fountain-tracked-change--delete')?.getAttribute('title')).toContain('Ada Lovelace');
    expect(mount.querySelector('ins.fountain-tracked-change--insert')?.getAttribute('data-fountain-suggestion')).toBeTruthy();
    expect(mount.querySelector('.fountain-tracked-suggestion--attributeChange')?.getAttribute('aria-label')).toContain('Ada Lovelace');
    expect(mount.innerHTML).not.toContain('<script>');
    view.destroy();
  });

  it('keeps review edits undoable as one normal history action', () => {
    const editor = trackedEditor();
    selectText(editor, [0, 0], 5);
    insertText(editor, '!');
    expect(getTrackedChangesState(editor)!.suggestions).toHaveLength(1);
    expect(undo(editor)).toBe(true);
    expect(editor.getText()).toBe('Alpha');
    expect(getTrackedChangesState(editor)!.suggestions).toHaveLength(0);
  });

  it('rejects malformed portable tracking metadata at the schema boundary', () => {
    const editor = trackedEditor();
    expect(() => editor.state.schema.nodeFromJSON({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Unsafe', marks: [{ type: 'tracked_change', attrs: { changes: [{ id: '<script>' }] } }] }],
      }],
    })).toThrow('Invalid value for attribute: changes');
  });

  it('syncs portable suggestions through Yjs and does not re-track remote transactions', () => {
    const ydoc = new Y.Doc();
    let leftId = 0;
    let rightId = 0;
    const leftTracked = createTrackedChangesExtension({ user: { id: 'ada', name: 'Ada' }, idFactory: () => `left-${++leftId}` });
    const rightTracked = createTrackedChangesExtension({ user: { id: 'grace', name: 'Grace' }, idFactory: () => `right-${++rightId}` });
    const leftCollab = createYjsCollaborationExtension({ document: ydoc, user: { id: 'ada', name: 'Ada', color: '#7c3aed' } });
    const rightCollab = createYjsCollaborationExtension({ document: ydoc, user: { id: 'grace', name: 'Grace', color: '#10b981' } });
    const leftKit = composeExtensions([CoreExtension, leftTracked, leftCollab]);
    const rightKit = composeExtensions([CoreExtension, rightTracked, rightCollab]);
    const content = { type: 'doc', content: [paragraph('Alpha')] } as const;
    const left = createEditor({ schema: leftKit.schema, plugins: leftKit.plugins, content });
    const right = createEditor({ schema: rightKit.schema, plugins: rightKit.plugins, content });

    left.dispatch(left.state.createTransaction().setSelection(Selection.cursor([0, 0], 5)));
    insertText(left, '!');
    expect(right.getJSON()).toEqual(left.getJSON());
    expect(getTrackedChangesState(right)!.suggestions).toHaveLength(1);
    expect(getTrackedChangesState(right)!.suggestions[0]?.user.id).toBe('ada');
    expect(rightId).toBe(0);
  });
});
