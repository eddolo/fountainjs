import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, Selection, composeExtensions, createEditor, insertText, setNodeAttributes,
  undoCollaboration, redoCollaboration, getCollaborationState } from 'fountainjs-editor';
import { createYjsCollaborationExtension } from 'fountainjs-editor/yjs';
import { createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';

it.each([false, true])('retains peer text through not-applicable state and author undo (%s)', reverse => {
  const a = new Y.Doc(), b = new Y.Doc(); a.clientID = reverse ? 202 : 101; b.clientID = reverse ? 101 : 202;
  const content = { type: 'doc', content: [{ type: 'task_list', content: [{ type: 'task_item', attrs: { checked: false },
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }] }] }] };
  const make = (document: Y.Doc) => {
    const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, captureTimeout: 0, user: { id: String(document.clientID), name: String(document.clientID), color: '#a855f7' } })]);
    return createEditor({ schema: createGitLabSchemaSpec(kit.schema), plugins: kit.plugins, content });
  };
  const left = make(a); Y.applyUpdate(b, Y.encodeStateAsUpdate(a)); const right = make(b);
  const sync = () => {
    const updates = [Y.encodeStateAsUpdate(a), Y.encodeStateAsUpdate(b)]; if (reverse) updates.reverse();
    for (const document of [a, b]) for (const update of updates) Y.applyUpdate(document, update, 'peer');
    for (const editor of [left, right]) expect(getCollaborationState(editor)?.status, getCollaborationState(editor)?.error?.message).toBe('connected');
    expect(left.getJSON()).toEqual(right.getJSON());
    expect(left.state.doc.child(0).child(0).textContent).toBe('AlXpha');
  };
  try {
    expect(setNodeAttributes(left, [0, 0], { checked: 'inapplicable' })).toBe(true);
    right.dispatch(right.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0], 2)));
    expect(insertText(right, 'X')).toBe(true);
    sync(); expect(left.state.doc.child(0).child(0).attrs.checked).toBe('inapplicable');
    expect(undoCollaboration(left)).toBe(true); sync(); expect(left.state.doc.child(0).child(0).attrs.checked).toBe(false);
    expect(redoCollaboration(left)).toBe(true); sync(); expect(left.state.doc.child(0).child(0).attrs.checked).toBe('inapplicable');
  } finally { left.destroy(); right.destroy(); a.destroy(); b.destroy(); }
});
