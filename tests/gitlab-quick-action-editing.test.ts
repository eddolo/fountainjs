import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GapSelection, Selection, undo, redo, type Node } from 'fountainjs-editor';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import { createGitLabQuickActionPlugin, filterGitLabQuickActionCommands, getGitLabQuickActionContext,
  parseGitLabQuickActionCommands, type GitLabQuickActionProvider } from '../integrations/gitlab/services/quick_action_editing';
import live from '../integrations/gitlab/fixtures/quick-action-commands-live.json';

const services: GitLabContentEditor[] = [];
const commands = parseGitLabQuickActionCommands(live.commands);
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { for (const service of services.splice(0)) service.dispose(); vi.useRealTimers(); });
async function setup(provider: GitLabQuickActionProvider = async () => commands) {
  const render = vi.fn(async (source: string) => ({ body: `<p>${escape(source)}</p>`,
    references: { commands: `<p>Explanation for ${escape(source)}</p>` } }));
  const service = new GitLabContentEditor({ renderMarkdown: render, describeLabels: () => 'Adds a label.', quickActionProvider: provider });
  services.push(service); await service.setSerializedContent('Start'); render.mockClear();
  return { service, editor: service.editor, actions: service.quickActions, render };
}
function document(service: GitLabContentEditor, nodes: readonly Node[], path = [0, 0], offset = 0) {
  const { editor } = service;
  editor.dispatch(editor.createTransaction().replaceDocument(editor.state.schema.node('doc', {}, nodes))
    .setMeta('content$replace', true).setSelection(Selection.cursor(path, 0)));
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor(path, offset)));
}
async function query(service: GitLabContentEditor, text: string, offset = text.length) {
  const schema = service.editor.state.schema;
  document(service, [schema.node('paragraph', {}, [schema.text(text)])], [0, 0], offset);
  await vi.advanceTimersByTimeAsync(151);
}

it('validates actual server commands, descriptions, aliases and parameter hints', () => {
  expect(commands).toHaveLength(32);
  expect(commands.find(item => item.name === 'label')).toMatchObject({ id: 'label', label: '/label',
    description: 'Add labels', aliases: ['labels'], params: ['~label1 ~"label 2"'] });
  expect(Object.isFrozen(commands)).toBe(true);
  expect(filterGitLabQuickActionCommands(commands, 'labels').map(item => item.name)).toEqual(['label']);
  expect(typeof globalThis.document).toBe('undefined');
});
it.each([null, {}, [{ name: '<script>', description: '', params: [], aliases: [] }],
  [{ name: 'label', description: '', params: 'wrong', aliases: [] }], [...live.commands, live.commands[0]]])
('refuses invalid command envelopes rather than inventing an available command', value => {
  expect(() => parseGitLabQuickActionCommands(value)).toThrow('GITLAB_QUICK_ACTION_RESPONSE_INVALID');
});
it('inserts into an empty root paragraph with one-step undo and redo', async () => {
  const { service, editor, actions } = await setup();
  const schema = editor.state.schema; document(service, [schema.node('paragraph')]);
  expect(actions.insert()).toBe(true); expect(service.getSerializedContent()).toBe('/');
  expect(editor.state.selection).toEqual(Selection.cursor([0, 0], 1));
  expect(undo(editor)).toBe(true); expect(editor.state.doc.textContent).toBe('');
  expect(redo(editor)).toBe(true); expect(editor.state.doc.textContent).toBe('/');
});
it.each(['blockquote', 'table'] as const)('inserts after an owning %s instead of putting a command inside it', async kind => {
  const { service, editor, actions } = await setup(); const schema = editor.state.schema;
  const paragraph = schema.node('paragraph', {}, [schema.text('Keep this text')]);
  const node = kind === 'blockquote' ? schema.node('blockquote', {}, [paragraph])
    : schema.node('table', {}, [schema.node('table_row', {}, [schema.node('table_header', {}, [schema.node('paragraph', {}, [schema.text('Header')])])]),
      schema.node('table_row', {}, [schema.node('table_cell', {}, [paragraph])])]);
  const path = kind === 'blockquote' ? [0, 0, 0] : [0, 1, 0, 0, 0];
  document(service, [node], path, 3); const owner = editor.state.doc.child(0); expect(actions.insert()).toBe(true);
  expect(editor.state.doc.child(0)).toBe(owner); expect(editor.state.doc.child(1).textContent).toBe('/');
  expect(editor.state.selection).toEqual(Selection.cursor([1, 0], 1));
});
it('honors a root gap before the first block', async () => {
  const { service, editor, actions } = await setup();
  const original = editor.state.doc.child(0);
  editor.dispatch(editor.createTransaction().setSelection(new GapSelection(editor.state.doc, 0)));
  expect(actions.insert()).toBe(true);
  expect(editor.state.doc.child(0).textContent).toBe('/'); expect(editor.state.doc.child(1)).toBe(original);
});
it('accepts the actual label command without erasing existing arguments or reopening the name menu', async () => {
  const { service, editor, actions } = await setup(); await query(service, '/lab ~"Keep arguments"', 4);
  expect(actions.suggestions?.getSnapshot().status).toBe('ready');
  const item = actions.suggestions!.getSnapshot().items.find(value => value.name === 'label')!;
  expect(actions.accept(item)).toBe(true);
  expect(service.getSerializedContent()).toBe('/label ~"Keep arguments"');
  expect(editor.state.selection).toEqual(Selection.cursor([0, 0], 7));
  expect(actions.suggestions?.getSnapshot().open).toBe(false);
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe('/lab ~"Keep arguments"');
});
it('cancels obsolete transport and refuses a stale visible item after the cursor changes', async () => {
  const signals: AbortSignal[] = [];
  const provider = vi.fn(async ({ signal }: Parameters<GitLabQuickActionProvider>[0]) => { signals.push(signal); return commands; });
  const { service, editor, actions } = await setup(provider); await query(service, '/la');
  const item = actions.suggestions!.getSnapshot().items[0]!;
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  expect(signals[0]!.aborted).toBe(true);
  const before = editor.state.doc;
  expect(actions.accept(item)).toBe(false); expect(editor.state.doc).toBe(before);
});
it('dismisses pending suggestions on equal-content document replacement', async () => {
  const { service, editor, actions } = await setup(); await query(service, '/la');
  const item = actions.suggestions!.getSnapshot().items[0]!;
  await service.setSerializedContent('/la');
  expect(actions.suggestions?.getSnapshot().open).toBe(false);
  expect(actions.accept(item)).toBe(false); expect(editor.state.doc.textContent).toBe('/la');
});
it('keeps reference identity and selection while explicitly changing a command into literal text', async () => {
  const { service, editor, actions } = await setup(); const schema = editor.state.schema;
  const reference = schema.node('gitlab_reference', { original: '~bug', label: 'bug', referenceType: 'label', href: '/labels' });
  const paragraph = schema.node('paragraph', {}, [schema.text('/label '), reference]);
  document(service, [paragraph], [0, 0], 3);
  expect(actions.setLiteral(true)).toBe(true);
  expect(editor.state.doc.child(0).child(1)).toBe(reference);
  expect(editor.state.selection).toEqual(Selection.cursor([0, 0], 3));
  expect(service.getSerializedContent()).toBe('\\/label ~bug');
  expect(actions.getSnapshot().status).toBe('literal');
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe('/label ~bug');
});
it('makes formatted literal slash text an explicit plain command with undo', async () => {
  const { service, editor, actions } = await setup(); const schema = editor.state.schema;
  document(service, [schema.node('paragraph', { gitlabLiteralSlash: true }, [schema.text('/close', [schema.mark('strong')])])], [0, 0], 3);
  expect(actions.setLiteral(false)).toBe(true); expect(service.getSerializedContent()).toBe('/close');
  expect(editor.state.selection).toEqual(Selection.cursor([0, 0], 3));
  expect(undo(editor)).toBe(true); expect(editor.state.doc.child(0).child(0).marks[0]?.type.name).toBe('strong');
});
it('shows a debounced server explanation and ignores stale explanation results', async () => {
  const { service, editor, actions, render } = await setup(); await query(service, '/close');
  expect(render).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(50);
  expect(render).toHaveBeenCalledWith('/close', expect.anything());
  expect(actions.getSnapshot()).toMatchObject({ status: 'ready', explanation: 'Explanation for /close' });
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  // Selection within the same root paragraph does not create duplicate requests.
  await vi.advanceTimersByTimeAsync(300); expect(render).toHaveBeenCalledTimes(1);
});
it('keeps keyboard IME input intact and isolates popup Escape from the host form', async () => {
  const { service, editor, actions } = await setup(); await query(service, '/la');
  const handler = createGitLabQuickActionPlugin(() => actions).spec.props!.handleKeyDown!;
  const event = { key: 'Enter', isComposing: true, stopPropagation: vi.fn() } as unknown as KeyboardEvent;
  expect(handler(editor, event)).toBe(false); expect(editor.state.doc.textContent).toBe('/la');
  const escapeEvent = { key: 'Escape', stopPropagation: vi.fn() } as unknown as KeyboardEvent;
  expect(handler(editor, escapeEvent)).toBe(true); expect(escapeEvent.stopPropagation).toHaveBeenCalledOnce();
  expect(actions.suggestions?.getSnapshot().open).toBe(false);
});
it('closes providers and refuses mutations in read-only mode', async () => {
  const { service, editor, actions } = await setup(); await query(service, '/la');
  editor.setEditable(false);
  expect(actions.suggestions?.getSnapshot().open).toBe(false);
  expect(actions.getSnapshot().status).toBe('closed');
  expect(() => actions.insert()).toThrow('GITLAB_EDITOR_NOT_READY');
});
it.each(['code_block', 'blockquote'])('does not offer commands inside %s', async type => {
  const { service, editor, actions } = await setup(); const schema = editor.state.schema;
  const node = type === 'code_block' ? schema.node(type, { language: 'text' }, [schema.text('/la')])
    : schema.node(type, {}, [schema.node('paragraph', {}, [schema.text('/la')])]);
  document(service, [node], type === 'code_block' ? [0, 0] : [0, 0, 0], 3);
  await vi.advanceTimersByTimeAsync(300);
  expect(getGitLabQuickActionContext(editor)).toBeUndefined(); expect(actions.suggestions?.getSnapshot().open).toBe(false);
});
