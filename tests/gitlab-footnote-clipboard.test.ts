// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { AllSelection, NodeSelection, Selection, EditorView, undo, redo } from 'fountainjs-editor';
import { inspectFootnotes } from 'fountainjs-editor/pages';
import captures from '../integrations/gitlab/fixtures/footnote-probe-live-html.json';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';

const mime = 'application/x-fountainjs+json';
function event(type: 'copy' | 'paste', input: Record<string, string> = {}) {
  const values = new Map(Object.entries(input));
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files: [],
    getData: (name: string) => values.get(name) ?? '',
    setData: (name: string, value: string) => values.set(name, value) } });
  return { event, values };
}
async function setup() {
  const fixture = captures.fixtures.find(item => item.name === 'simple')!;
  const bridge = new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: async source => {
    if (source !== fixture.source) throw new Error('No actual host fixture for this exact source.');
    return { body: fixture.body };
  } });
  await bridge.setSerializedContent(fixture.source);
  const mount = document.createElement('div'); document.body.append(mount);
  const view = new EditorView(mount, bridge.editor);
  return { bridge, view, cleanup: () => { view.destroy(); bridge.dispose(); mount.remove(); } };
}

it('copies a paragraph reference together with its owned definition for another editor', async () => {
  const { bridge, view, cleanup } = await setup();
  try {
    bridge.editor.dispatch(bridge.editor.createTransaction().setSelection(new NodeSelection(bridge.editor.state.doc, [0])));
    const copied = event('copy'); view.dom.dispatchEvent(copied.event);
    const payload = JSON.parse(copied.values.get(mime)!);
    const document = bridge.editor.state.schema.nodeFromJSON(payload.document);
    expect(inspectFootnotes(document).definitions).toHaveLength(1);
    expect(inspectFootnotes(document).valid).toBe(true);
    expect(copied.values.get('text/plain')).toContain('[^alpha]');
    expect(copied.values.get('text/html')).toContain('Definition');
  } finally { cleanup(); }
});

it.each(['native', 'html'])('pastes the copied %s document in its source editor without duplicate identities or source labels', async format => {
  const { bridge, view, cleanup } = await setup();
  try {
    bridge.editor.dispatch(bridge.editor.createTransaction().setSelection(new AllSelection(bridge.editor.state.doc)));
    const copied = event('copy'); view.dom.dispatchEvent(copied.event);
    const before = bridge.getSerializedContent();
    if (format === 'html') copied.values.delete(mime);
    bridge.editor.dispatch(bridge.editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    view.dom.dispatchEvent(event('paste', Object.fromEntries(copied.values)).event);
    const notes = inspectFootnotes(bridge.editor.state.doc);
    expect(notes.definitions).toHaveLength(2);
    expect(new Set(notes.definitions.map(note => note.id)).size).toBe(2);
    expect(notes.valid).toBe(true);
    expect(() => bridge.getSerializedContent()).not.toThrow();
    expect(bridge.status).toBe('ready');
    const pasted = bridge.getSerializedContent();
    expect(undo(bridge.editor)).toBe(true); expect(bridge.getSerializedContent()).toBe(before);
    expect(redo(bridge.editor)).toBe(true); expect(bridge.getSerializedContent()).toBe(pasted);
  } finally { cleanup(); }
});

it('does not attach a copied reference to a different body with the same old identity', async () => {
  const source = await setup(), destination = await setup();
  try {
    source.bridge.editor.dispatch(source.bridge.editor.createTransaction().setSelection(new NodeSelection(source.bridge.editor.state.doc, [0])));
    const copied = event('copy'); source.view.dom.dispatchEvent(copied.event);
    const editor = destination.bridge.editor, existing = editor.state.doc.child(1);
    editor.dispatch(editor.createTransaction().replaceNode([1], [existing.copy([
      editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Different destination body.')]),
    ])]).setSelection(Selection.cursor([0, 0], 0)));
    destination.view.dom.dispatchEvent(event('paste', Object.fromEntries(copied.values)).event);
    const notes = inspectFootnotes(editor.state.doc);
    expect(notes.valid).toBe(true); expect(notes.definitions).toHaveLength(2);
    const bodies = notes.definitions.map(note => note.path.reduce((node, index) => node.child(index), editor.state.doc).textContent);
    expect(bodies).toContain('Different destination body.'); expect(bodies).toContain('Definition bold.');
    expect(destination.bridge.getSerializedContent()).toContain('Different destination body.');
  } finally { source.cleanup(); destination.cleanup(); }
});
