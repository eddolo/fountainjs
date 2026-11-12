import { afterEach, expect, it, vi } from 'vitest';
import { NodeSelection, Plugin, Selection, insertText, undo, redo, type FountainExtension } from 'fountainjs-editor';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import { GitLabAlertEditing, getGitLabAlertContext } from '../integrations/gitlab/services/alert_editing';
import { GITLAB_ALERT_TYPES } from '../integrations/gitlab/services/alerts';
import live from '../integrations/gitlab/fixtures/alert-live-html.json';
const services: GitLabContentEditor[] = [];
afterEach(() => services.splice(0).forEach(service => service.dispose()));
async function setup(name = 'default-note', extensions: readonly FountainExtension[] = []) {
  const row = live.fixtures.find(value => value.name === name)!;
  const onError = vi.fn(), render = vi.fn(async () => ({ body: row.body }));
  const service = new GitLabContentEditor({ renderMarkdown: render, describeLabels: () => '', extensions, onListenerError: onError });
  services.push(service); await service.setSerializedContent(row.source);
  const editor = service.editor;
  let alertPath: readonly number[] | undefined;
  editor.state.doc.descendants((node, path) => { if (!alertPath && node.type.name === 'gitlab_alert') alertPath = path; });
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([...alertPath!, 0, 0], 0)));
  const key = (value: string, overrides = {}) => editor.state.plugins.some(plugin => plugin.spec.props?.handleKeyDown?.(editor,
    { key: value, isComposing: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...overrides } as KeyboardEvent));
  const before = (inputType: string) => editor.state.plugins.some(plugin => plugin.spec.props?.handleBeforeInput?.(editor, { inputType, isComposing: false } as InputEvent));
  const paste = (text: string) => editor.state.plugins.some(plugin => plugin.spec.props?.handlePaste?.(editor,
    { clipboardData: { getData: () => text } } as unknown as ClipboardEvent));
  return { service, editor, row, onError, render, key, before, paste, path: alertPath! };
}

it('inspects native alert context and real title leaves without a fake DOM', async () => {
  expect(typeof document).toBe('undefined'); const { editor, path } = await setup();
  expect(getGitLabAlertContext(editor)).toEqual({ path, kind: 'note', inTitle: true });
  editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, path)));
  expect(getGitLabAlertContext(editor)?.inTitle).toBe(false);
});

it.each(GITLAB_ALERT_TYPES)('changes to %s with one-step undo/redo while preserving body identity', async kind => {
  const { service, editor, row } = await setup('custom'); const body = editor.state.doc.child(0).child(1);
  if (kind === 'warning') { expect(service.alerts.setKind(kind)).toBe(true); expect(undo(editor)).toBe(false); return; }
  expect(service.alerts.setKind(kind)).toBe(true);
  expect(editor.state.doc.child(0).attrs.kind).toBe(kind); expect(editor.state.doc.child(0).child(1)).toBe(body);
  expect(service.getSerializedContent()).toContain(`[!${kind}] Deployment blocked`);
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(row.source);
  expect(redo(editor)).toBe(true); expect(editor.state.doc.child(0).attrs.kind).toBe(kind);
});

it('does not reinterpret an explicit title equal to another default severity word', async () => {
  const { service, editor } = await setup('other-default-word'); service.alerts.setKind('warning');
  expect(editor.state.doc.child(0).child(0).textContent).toBe('Tip'); expect(service.getSerializedContent()).toContain('[!warning] Tip');
});

it('does not serialize the editor-only trailing caret paragraph as authored document content', async () => {
  const { service } = await setup(); service.alerts.setKind('tip');
  expect(service.getSerializedContent()).not.toContain('data-fountain-empty');
});

it('inserts a separate alert and lands in its body without replacing the existing document', async () => {
  const { service, editor, row } = await setup(); const original = editor.state.doc.child(0);
  expect(service.alerts.insert('tip')).toBe(true); expect(editor.state.doc.child(0)).toBe(original);
  expect(editor.state.selection.path).toEqual([1, 1, 0]);
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(row.source);
  expect(redo(editor)).toBe(true); expect(insertText(editor, 'New alert body')).toBe(true);
  expect(service.getSerializedContent()).toContain('New alert body');
});

it.each(['custom', 'default-note', 'empty', 'list'])('converts %s to normal content without losing authored title or body', async name => {
  const { service, editor, row } = await setup(name);
  const text = () => { const values: unknown[] = []; editor.state.doc.descendants(node => { if (node.isText && node.text) values.push(node.toJSON()); }); return values; };
  const original = text(); service.alerts.unwrap();
  expect(text()).toEqual(original); expect(getGitLabAlertContext(editor)).toBeUndefined();
  expect(service.getSerializedContent()).not.toContain('[!');
  expect(() => editor.state.schema.validate(editor.state.doc)).not.toThrow();
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(row.source);
});

it('deletes the whole alert from a list without breaking the required item or neighbor', async () => {
  const { service, editor, row } = await setup('list');
  service.alerts.remove(); expect(editor.getText()).toContain('Neighbor.');
  expect(editor.state.doc.child(0).child(0).child(0).type.name).toBe('paragraph');
  expect(() => editor.state.schema.validate(editor.state.doc)).not.toThrow();
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(row.source);
});

it('splits an edited literal title into title and body through Enter', async () => {
  const { service, editor, key } = await setup('custom');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0, 0], 10)));
  expect(key('Enter')).toBe(true); expect(editor.state.doc.child(0).child(0).textContent).toBe('Deployment');
  expect(editor.state.doc.child(0).child(1).textContent).toBe(' blocked'); expect(editor.state.selection.path).toEqual([0, 1, 0]);
  expect(service.getSerializedContent()).toContain('Keep the rollback ready.');
  expect(undo(editor)).toBe(true); expect(editor.state.doc.child(0).child(0).textContent).toBe('Deployment blocked');
});

it('supports mobile paragraph input from an empty title', async () => {
  const { editor, before } = await setup('empty'); expect(before('insertParagraph')).toBe(true);
  expect(editor.state.selection.path).toEqual([0, 1, 0]); expect(insertText(editor, 'Mobile body')).toBe(true);
  expect(editor.state.doc.child(0).textContent).toBe('Mobile body');
});

it('does not add an undo step when Enter only moves from an empty title into its existing empty body', async () => {
  const { editor, key } = await setup('empty'), alert = editor.state.doc.child(0), { schema } = editor.state;
  editor.dispatch(editor.createTransaction().replaceNode([0], [alert.copy([...alert.content, schema.node('paragraph', {}, [schema.text('')])])])
    .setSelection(Selection.cursor([0, 0, 0], 0)).setMeta('addToHistory', false));
  const doc = editor.state.doc;
  expect(key('Enter')).toBe(true); expect(editor.state.doc).toBe(doc);
  expect(editor.state.selection.path).toEqual([0, 1, 0]); expect(undo(editor)).toBe(false);
});

it('keeps keyboard and mobile format commands out of literal titles while preserving normal body formatting', async () => {
  const { editor, key, before } = await setup('empty'), state = editor.state;
  for (const value of ['b', 'i', 'u']) expect(key(value, { ctrlKey: true })).toBe(true);
  for (const value of ['formatBold', 'formatItalic', 'formatUnderline', 'formatStrikeThrough']) expect(before(value)).toBe(true);
  expect(editor.state).toBe(state);
  expect(key('Enter')).toBe(true);
  expect(key('b', { ctrlKey: true })).toBe(false); expect(before('formatBold')).toBe(false);
});

it('moves Delete from title end into the existing body without inserting a blank paragraph', async () => {
  const { editor, key, row, service } = await setup('custom');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0, 0], 18)));
  const before = editor.state.doc; expect(key('Delete')).toBe(true); expect(editor.state.doc).toBe(before);
  expect(editor.state.selection.path).toEqual([0, 1, 0]); expect(service.getSerializedContent()).toBe(row.source);
});

it('backspaces from a default title into ordinary content without deleting marked body text', async () => {
  const { service, editor, key, row } = await setup(); expect(key('Backspace')).toBe(true);
  expect(service.getSerializedContent()).toContain('Body **with marks**.'); expect(getGitLabAlertContext(editor)).toBeUndefined();
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(row.source);
});

it('backspaces from the first body paragraph to a custom title without merging away body formatting', async () => {
  const { editor, key, row, service } = await setup('custom');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 1, 0], 0)));
  const before = editor.state.doc; expect(key('Backspace')).toBe(true); expect(editor.state.doc).toBe(before);
  expect(editor.state.selection.path).toEqual([0, 0, 0]); expect(editor.state.selection.from).toBe(18);
  expect(service.getSerializedContent()).toBe(row.source);
});

it('exits an empty final body paragraph and retains the populated alert', async () => {
  const { service, editor, key } = await setup(); const alert = editor.state.doc.child(0), { schema } = editor.state;
  editor.dispatch(editor.createTransaction().replaceNode([0], [alert.copy([...alert.content, schema.node('paragraph', {}, [schema.text('')])])])
    .setSelection(Selection.cursor([0, 2, 0], 0)));
  expect(key('Enter')).toBe(true); expect(editor.state.doc.childCount).toBe(2);
  expect(editor.state.selection.path).toEqual([1, 0]); expect(insertText(editor, 'Outside')).toBe(true);
  expect(service.getSerializedContent()).toContain('\n\nOutside'); expect(editor.state.doc.child(0).childCount).toBe(2);
});

it('pastes title source literally and refuses multiline paste without losing existing content', async () => {
  const { editor, paste, onError, service } = await setup('empty');
  expect(paste('**literal** & <tag>')).toBe(true); expect(editor.state.doc.child(0).child(0).textContent).toBe('**literal** & <tag>');
  expect(service.getSerializedContent()).toContain('[!tip] **literal** & <tag>');
  const before = editor.state.doc; expect(paste('line one\nline two')).toBe(true); expect(editor.state.doc).toBe(before);
  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'GITLAB_ALERT_TITLE_SINGLE_LINE' }));
});

it('leaves modifier keys, composition and body Shift+Enter to the host and normal input path', async () => {
  const { editor, key, before } = await setup();
  expect(key('Enter', { ctrlKey: true })).toBe(false); expect(key('Enter', { isComposing: true })).toBe(false);
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 1, 0], 1)));
  expect(key('Enter', { shiftKey: true })).toBe(false); expect(before('insertLineBreak')).toBe(false);
});

it('refuses invalid kinds and every mutation while read-only', async () => {
  const { service, editor } = await setup(), before = editor.state.doc;
  expect(() => service.alerts.setKind('danger')).toThrow('GITLAB_ALERT_INVALID_KIND');
  service.setEditable(false);
  for (const run of [() => service.alerts.insert(), () => service.alerts.setKind('tip'), () => service.alerts.unwrap(), () => service.alerts.remove()]) expect(run).toThrow('GITLAB_EDITOR_NOT_READY');
  expect(editor.state.doc).toBe(before);
});

it.each(['insert', 'setKind', 'remove', 'unwrap'] as const)('honors a transaction filter refusing %s', async operation => {
  let refuse = false; const filter = new Plugin({ filterTransaction: transaction => !refuse || !transaction.docChanged });
  const { service, editor } = await setup('custom', [{ name: 'alert-refusal', plugins: [filter] }]);
  const before = editor.state.doc; refuse = true;
  expect(() => operation === 'setKind' ? service.alerts.setKind('tip') : service.alerts[operation]()).toThrow('GITLAB_ALERT_UPDATE_REFUSED');
  expect(editor.state.doc).toBe(before); refuse = false; expect(service.alerts.setKind('tip')).toBe(true);
});

it('rolls back an export refusal before document/history observers can publish a partial edit', async () => {
  const { editor } = await setup(), before = editor.state.doc;
  const editing = new GitLabAlertEditing({ editor, ensureReady() {}, validate() { throw new Error('CONVERSION_REFUSED'); }, onError() {} });
  const observer = vi.fn(), release = editor.subscribe(observer);
  expect(() => editing.setKind('tip')).toThrow('CONVERSION_REFUSED'); expect(editor.state.doc).toBe(before);
  expect(observer.mock.calls.every(([, transaction]) => !transaction.docChanged)).toBe(true); expect(undo(editor)).toBe(false); release();
});
