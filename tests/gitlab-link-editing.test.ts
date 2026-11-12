import { afterEach, expect, it, vi } from 'vitest';
import { Plugin, Selection, insertText, undo, redo, type FountainExtension } from 'fountainjs-editor';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import { GitLabLinkEditingSession, getGitLabLinkContext } from '../integrations/gitlab/services/link_editing';

const original = 'Before [one**two**](/canonical-old) after';
const originalHTML = '<p>Before <a href="/resolved-old" data-canonical-src="/canonical-old">one<strong>two</strong></a> after</p>';
const services: GitLabContentEditor[] = [];
afterEach(() => services.splice(0).forEach(service => service.dispose()));
async function setup(extensions: readonly FountainExtension[] = []) {
  const render = vi.fn(async (source: string, _options?: { signal: AbortSignal }) => ({ body: source === original ? originalHTML
    : '<p><a href="/resolved-next">link</a></p>' }));
  const service = new GitLabContentEditor({ renderMarkdown: render, describeLabels: () => '', extensions });
  services.push(service);
  await service.setSerializedContent(original);
  const editor = service.editor;
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 2], 1)));
  return { service, editor, render };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

it('inspects the complete native link across separately formatted text fragments in pure Node', async () => {
  expect(typeof document).toBe('undefined');
  const { editor } = await setup();
  expect(getGitLabLinkContext(editor)).toMatchObject({ text: 'onetwo', href: '/canonical-old', displayHref: '/resolved-old', existing: true });
  expect(getGitLabLinkContext(editor)!.selection.eq(Selection.range([0, 1], 0, [0, 2], 3))).toBe(true);
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
  expect(getGitLabLinkContext(editor)).toBeUndefined();
});

it('updates canonical and resolved URLs while retaining mixed formatting and one-step undo/redo', async () => {
  const { service, editor, render } = await setup();
  await expect(service.beginLinkEdit().apply({ href: '/next', text: 'onetwo' })).resolves.toEqual({ status: 'applied' });
  expect(render).toHaveBeenLastCalledWith('[link](/next)', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(service.getSerializedContent()).toContain('[one**two**](/next)');
  expect(service.getSerializedContent()).not.toContain('/resolved-next');
  expect(getGitLabLinkContext(editor)).toMatchObject({ href: '/next', displayHref: '/resolved-next' });
  expect(undo(editor)).toBe(true);
  expect(service.getSerializedContent()).toBe(original);
  expect(redo(editor)).toBe(true);
  expect(service.getSerializedContent()).toContain('[one**two**](/next)');
});

it('edits only the full link label rather than the caret fragment and retains surrounding text', async () => {
  const { service, editor } = await setup();
  await service.beginLinkEdit().apply({ href: '/next', text: 'Renamed' });
  expect(editor.getText()).toBe('Before Renamed after');
  expect(service.getSerializedContent()).toContain('[Renamed](/next)');
  expect(undo(editor)).toBe(true);
  expect(service.getSerializedContent()).toBe(original);
});

it('removes a complete link while preserving its text and other marks', async () => {
  const { service, editor } = await setup();
  expect(service.beginLinkEdit().remove()).toBe(true);
  expect(editor.getText()).toBe('Before onetwo after');
  expect(service.getSerializedContent()).toContain('one**two**');
  expect(service.getSerializedContent()).not.toContain('/canonical-old');
  expect(getGitLabLinkContext(editor)).toBeUndefined();
  expect(undo(editor)).toBe(true);
  expect(service.getSerializedContent()).toBe(original);
});

it.each([false, true])('creates a native link at an unlinked %s selection without replacing neighboring content', async selected => {
  const { service, editor } = await setup();
  editor.dispatch(editor.createTransaction().setSelection(selected
    ? Selection.range([0, 0], 0, [0, 0], 6) : Selection.cursor([0, 0], 3)));
  await service.beginLinkEdit().apply({ href: '/next', text: selected ? 'Before' : 'New' });
  expect(editor.getText()).toBe(selected ? 'Before onetwo after' : 'BefNewore onetwo after');
  expect(service.getSerializedContent()).toContain(selected ? '[Before](/next)' : '[New](/next)');
  expect(service.getSerializedContent()).toContain('/canonical-old');
  expect(undo(editor)).toBe(true);
  expect(service.getSerializedContent()).toBe(original);
});

it('treats an unchanged form as a no-op without a new request or undo entry', async () => {
  const { service, editor, render } = await setup();
  const before = editor.getJSON(), count = render.mock.calls.length;
  await service.beginLinkEdit().apply({ href: '/canonical-old', text: 'onetwo' });
  expect(editor.getJSON()).toEqual(before);
  expect(render).toHaveBeenCalledTimes(count);
  expect(undo(editor)).toBe(false);
});

it('creates one enclosing link across mixed formatting instead of separate keyboard-focusable anchors', async () => {
  const { service, editor } = await setup();
  editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], 2, [0, 2], 3)));
  await service.beginLinkEdit().apply({ href: '/next', text: 'fore onetwo' });
  expect(editor.getText()).toBe('Before onetwo after');
  expect(service.getSerializedContent()).toContain('[fore one**two**](/next)');
  expect(undo(editor)).toBe(true);
  expect(service.getSerializedContent()).toBe(original);
});

it('maps an open link form through unrelated typing and preserves the other edit on undo', async () => {
  const { service, editor } = await setup();
  const session = service.beginLinkEdit();
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  insertText(editor, 'Typed ');
  const otherCaret = editor.state.selection;
  await session.apply({ href: '/next', text: 'onetwo' });
  expect(editor.getText()).toBe('Typed Before onetwo after');
  expect(editor.state.selection.eq(otherCaret)).toBe(true);
  expect(service.getSerializedContent()).toContain('[one**two**](/next)');
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Typed Before onetwo after');
  expect(service.getSerializedContent()).toContain('/canonical-old');
});

it('refuses overlapping typing while retaining both the user edit and the form draft', async () => {
  const { service, editor } = await setup();
  const changed = vi.fn(), session = service.beginLinkEdit(changed);
  insertText(editor, '!');
  const before = editor.getJSON();
  expect(session.snapshot).toMatchObject({ conflict: true, text: 'onetwo', href: '/canonical-old' });
  expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ conflict: true }));
  await expect(session.apply({ href: '/next', text: 'Draft label' })).rejects.toThrow('GITLAB_LINK_TARGET_CHANGED');
  expect(editor.getJSON()).toEqual(before);
});

it('distinguishes inside-link formatting conflicts from unrelated mark changes', async () => {
  const { service, editor } = await setup();
  const session = service.beginLinkEdit();
  editor.dispatch(editor.createTransaction().addMarkRange([0, 0], 0, [0, 0], 2, editor.state.schema.mark('em')));
  expect(session.snapshot.conflict).toBe(false);
  const target = session.snapshot.selection;
  editor.dispatch(editor.createTransaction().addMarkRange(target.path, 0, target.path, 1, editor.state.schema.mark('em')));
  expect(session.snapshot.conflict).toBe(true);
});

it('cancels a stalled resolution promptly and ignores its late result', async () => {
  const { service, editor, render } = await setup();
  const pending = deferred<{ body: string }>();
  render.mockImplementationOnce(() => pending.promise);
  const session = service.beginLinkEdit(), before = editor.getJSON();
  const result = session.apply({ href: '/next', text: 'Late label' });
  session.close();
  await expect(result).resolves.toEqual({ status: 'superseded' });
  pending.resolve({ body: '<p><a href="/resolved-next">link</a></p>' });
  await Promise.resolve();
  expect(editor.getJSON()).toEqual(before);
  expect(undo(editor)).toBe(false);
});

it('invalidates an old form after document replacement and closes sessions on service disposal', async () => {
  const { service } = await setup();
  const session = service.beginLinkEdit();
  await service.setSerializedContent('');
  expect(session.snapshot.conflict).toBe(true);
  await expect(session.apply({ href: '/next', text: 'Old' })).rejects.toThrow('GITLAB_LINK_TARGET_CHANGED');
  service.dispose();
  expect(session.snapshot.closed).toBe(true);
});

it.each(['<p>Not a link</p>', '<p><a href="/one">li</a><a href="/two">nk</a></p>', '<p><a href="/one">Different label</a></p>'])(
  'refuses ambiguous or malformed actual-renderer output and preserves a retryable draft: %s', async body => {
    const { service, editor, render } = await setup();
    const before = editor.getJSON(), session = service.beginLinkEdit();
    render.mockResolvedValueOnce({ body });
    await expect(session.apply({ href: '/next', text: 'Draft label' })).rejects.toThrow('GITLAB_LINK_RESOLUTION_FAILED');
    expect(editor.getJSON()).toEqual(before);
    expect(session.snapshot.closed).toBe(false);
    expect(undo(editor)).toBe(false);
    await expect(session.apply({ href: '/next', text: 'Draft label' })).resolves.toEqual({ status: 'applied' });
  },
);

it('opening a new form supersedes a pending old form without allowing its late result to overwrite it', async () => {
  const { service, editor, render } = await setup();
  const pending = deferred<{ body: string }>();
  render.mockImplementationOnce(() => pending.promise);
  const old = service.beginLinkEdit(), result = old.apply({ href: '/old-draft', text: 'Old draft' });
  const current = service.beginLinkEdit();
  await expect(result).resolves.toEqual({ status: 'superseded' });
  expect(render.mock.calls[1]![1]!.signal.aborted).toBe(true);
  await current.apply({ href: '/next', text: 'Current draft' });
  pending.resolve({ body: '<p><a href="/late">link</a></p>' });
  await Promise.resolve();
  expect(editor.getText()).toBe('Before Current draft after');
});

it('refuses a pending link update after the host becomes read-only', async () => {
  const { service, editor, render } = await setup();
  const pending = deferred<{ body: string }>();
  render.mockImplementationOnce(() => pending.promise);
  const session = service.beginLinkEdit(), before = editor.getJSON();
  const result = session.apply({ href: '/next', text: 'Read-only draft' });
  service.setEditable(false);
  pending.resolve({ body: '<p><a href="/resolved-next">link</a></p>' });
  await expect(result).rejects.toThrow();
  expect(editor.getJSON()).toEqual(before);
  expect(session.snapshot.closed).toBe(false);
  service.setEditable(true);
  await expect(session.apply({ href: '/next', text: 'Recovered draft' })).resolves.toEqual({ status: 'applied' });
});

it('refuses multiline table link labels before requesting a conversion or changing history', async () => {
  const { service, editor, render } = await setup();
  render.mockResolvedValueOnce({ body: '<table><thead><tr><th><a href="/old">Cell</a></th></tr></thead></table>' });
  await service.setSerializedContent('| [Cell](/old) |\n| --- |');
  let path: readonly number[] = [];
  editor.state.doc.descendants((node, currentPath) => { if (node.isText && node.text === 'Cell') path = currentPath; });
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor(path, 1)));
  const session = service.beginLinkEdit(), before = editor.getJSON(), calls = render.mock.calls.length;
  await expect(session.apply({ href: '/next', text: 'Two\nlines' })).rejects.toThrow('GITLAB_LINK_TABLE_LINE_BREAK');
  expect(editor.getJSON()).toEqual(before);
  expect(render).toHaveBeenCalledTimes(calls);
  expect(session.snapshot.closed).toBe(false);
});

it('isolates a throwing host close observer after a successful native commit', async () => {
  const { editor } = await setup();
  const onListenerError = vi.fn();
  const session = new GitLabLinkEditingSession({ editor, ensureReady: () => {},
    resolveURL: async href => href, validate: () => {},
    closed: () => { throw new Error('OBSERVER_FAILED'); }, onListenerError });
  await expect(session.apply({ href: '/next', text: 'Committed' })).resolves.toEqual({ status: 'applied' });
  expect(editor.getText()).toBe('Before Committed after');
  expect(onListenerError).toHaveBeenCalledWith(expect.objectContaining({ message: 'OBSERVER_FAILED' }));
});

it('keeps the form retryable when a native host filter refuses the transaction', async () => {
  let reject = false;
  const { service, editor } = await setup([{ name: 'link-filter', plugins: [new Plugin({
    filterTransaction: transaction => !reject || !transaction.docChanged,
  })] }]);
  const session = service.beginLinkEdit(), before = editor.getJSON();
  reject = true;
  await expect(session.apply({ href: '/next', text: 'Refused' })).rejects.toThrow('GITLAB_LINK_UPDATE_REFUSED');
  expect(editor.getJSON()).toEqual(before);
  expect(undo(editor)).toBe(false);
  expect(session.snapshot.closed).toBe(false);
  reject = false;
  await expect(session.apply({ href: '/next', text: 'Accepted' })).resolves.toEqual({ status: 'applied' });
});

it('rolls back native state and history if the host serialization preflight refuses the edited document', async () => {
  const { service, editor } = await setup();
  const session = new GitLabLinkEditingSession({ editor, ensureReady: () => {},
    resolveURL: async href => href, validate: () => { throw new Error('HOST_SOURCE_REFUSED'); } });
  try {
    const before = editor.getJSON();
    await expect(session.apply({ href: '/next', text: 'Refused' })).rejects.toThrow('HOST_SOURCE_REFUSED');
    expect(editor.getJSON()).toEqual(before);
    expect(undo(editor)).toBe(false);
  } finally { session.close(); }
});

it.each(['javascript:alert(1)', 'data:text/html,unsafe', '//outside.test', '/\\outside.test', 'https://safe.test/\u0000'])(
  'refuses unsafe link input without network or document changes: %j', async href => {
    const { service, editor, render } = await setup();
    const before = editor.getJSON(), calls = render.mock.calls.length;
    const session = service.beginLinkEdit();
    await expect(session.apply({ href, text: 'Unsafe' })).rejects.toThrow('GITLAB_LINK_UNSAFE_URL');
    expect(editor.getJSON()).toEqual(before);
    expect(render).toHaveBeenCalledTimes(calls);
  },
);
