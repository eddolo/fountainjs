import { afterEach, expect, it, vi } from 'vitest';
import { Selection, insertText, undo, redo, Plugin } from 'fountainjs-editor';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import contexts from '../integrations/gitlab/fixtures/suggestion-context-live.json';
import transport from '../integrations/gitlab/fixtures/suggestion-transport-live.json';

const services: GitLabContentEditor[] = [];
afterEach(() => services.splice(0).forEach(service => service.dispose()));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const turn = () => new Promise(resolve => setTimeout(resolve, 0));
async function setup(raw = 'original\n', lines = ['original'], start = 1,
  extensions: NonNullable<ConstructorParameters<typeof GitLabContentEditor>[0]['extensions']> = []) {
  const context = JSON.parse(JSON.stringify(contexts.fixtures[0]!.context));
  context.lines = lines; context.lineRange = { start, end: start + lines.length - 1 }; context.previewParams.line = context.lineRange.end;
  const load = vi.fn(async (_path: string, _options: { signal: AbortSignal }) => raw);
  const render = vi.fn(async (source: string) => ({ body: source ? `<p>${source}</p>` : '<p></p>' }));
  const service = new GitLabContentEditor({ renderMarkdown: render, describeLabels: () => '', extensions,
    getSuggestionContext: () => context, loadSuggestionSource: load });
  services.push(service); await service.setSerializedContent('Before');
  const editor = service.editor;
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 6)));
  return { service, editor, context, load, render };
}

it.each([
  ['escaped', 'const value = "\\n";\n', ['const value = "\uE000";']],
  ['private-use', 'const value = "\uE000";\n', ['const value = "\uE000";']],
  ['mixed', 'const mixed = "\\n\uE000";\n', ['const mixed = "\uE000\uE000";']],
  ['multiline', 'const value = "\\n";\nconst value = "\uE000";\n', ['const value = "\uE000";', 'const value = "\uE000";']],
  ['invisible and whitespace', '\tA\u200B\u00A0  \n', ['\tA\u200B\u00A0  ']],
  ['CRLF and blank line', 'first\r\n\r\n', ['first', '']],
  ['no terminal newline', 'last', ['last']],
] as const)('prefills exact raw %s source rather than reversing the lossy diff transport', async (_name, raw, lines) => {
  expect(typeof document).toBe('undefined');
  const { service, editor, render, load } = await setup(raw, [...lines]);
  const before = editor.state.doc;
  expect(await service.suggestions.insertVerified()).toEqual({ status: 'applied' });
  const suggestion = editor.state.doc.content.find(node => node.type.name === 'gitlab_code_suggestion')!;
  const expected = raw.replaceAll('\r\n', '\n').replace(/\n$/u, '') + '\n';
  expect(suggestion.textContent).toBe(expected); expect(suggestion.attrs.params).toBe(`-${lines.length - 1}+0`);
  expect(render).toHaveBeenCalledTimes(1); expect(load).toHaveBeenCalledTimes(1);
  expect(service.getSerializedContent()).toContain(expected);
  expect(undo(editor)).toBe(true); expect(editor.state.doc.toJSON()).toEqual(before.toJSON()); expect(undo(editor)).toBe(false);
  expect(redo(editor)).toBe(true); expect(editor.state.doc.content.find(node => node.type.name === 'gitlab_code_suggestion')!.textContent).toBe(expected);
  const session = service.suggestions.begin();
  expect(await session.prepareRange()).toEqual(raw.replaceAll('\r\n', '\n').replace(/\n$/u, '').split('\n'));
});

it('blocks save and mode handoff during raw-source loading while mapping unrelated edits and later caret movement', async () => {
  const { service, editor, load } = await setup(), pendingSource = deferred<string>();
  load.mockImplementationOnce(() => pendingSource.promise);
  const pending = service.suggestions.insertVerified(); await turn();
  expect(service.pendingInsertions).toBe(1); expect(service.status).toBe('loading');
  expect(() => service.getSerializedContent()).toThrow('GITLAB_EDITOR_NOT_READY');
  await expect(service.suggestions.insertVerified()).rejects.toThrow('INSERTION_PENDING');
  const paragraph = editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Added')]);
  editor.dispatch(editor.createTransaction().replace(0, 0, [paragraph]));
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  insertText(editor, '!');
  pendingSource.resolve('original\n'); expect(await pending).toEqual({ status: 'applied' });
  expect(editor.state.doc.content.map(node => [node.type.name, node.textContent])).toEqual([
    ['paragraph', '!Added'], ['paragraph', 'Before'], ['gitlab_code_suggestion', 'original\n'],
  ]);
  expect(service.pendingInsertions).toBe(0); expect(service.status).toBe('ready');
});

it('aborts an overlapping selection without dropping the user edit', async () => {
  const { service, editor, load } = await setup(), source = deferred<string>();
  editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], 1, [0, 0], 5)));
  load.mockImplementationOnce(() => source.promise);
  const pending = service.suggestions.insertVerified(); await turn();
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 3))); insertText(editor, '!');
  await expect(pending).rejects.toThrow('GITLAB_INSERTION_TARGET_CHANGED');
  expect(load.mock.calls[0]![1].signal.aborted).toBe(true);
  source.resolve('original\n'); await turn(); expect(service.getSerializedContent()).toBe('Bef!ore');
});

it.each(['reload', 'dispose', 'abort', 'suggestion-dispose'] as const)('settles a stalled raw request immediately after %s and ignores its late result', async action => {
  const { service, editor, load } = await setup(), source = deferred<string>(), controller = new AbortController();
  load.mockImplementationOnce(() => source.promise);
  const pending = service.suggestions.insertVerified(controller.signal); await turn();
  if (action === 'reload') await service.setSerializedContent('Replacement');
  else if (action === 'dispose') service.dispose();
  else if (action === 'suggestion-dispose') service.suggestions.dispose();
  else controller.abort();
  expect(await pending).toEqual({ status: 'superseded' }); expect(load.mock.calls[0]![1].signal.aborted).toBe(true);
  const before = editor.state.doc; source.resolve('original\n'); await turn(); expect(editor.state.doc).toBe(before);
  if (action === 'reload') expect(service.getSerializedContent()).toBe('Replacement');
});

it.each(['context', 'permission', 'read-only', 'file', 'range', 'oversize', 'not-text'] as const)('refuses changed or invalid %s without insertion or undo pollution', async action => {
  const { service, editor, context, load } = await setup(), source = deferred<string>();
  load.mockImplementationOnce(() => source.promise);
  const before = editor.state.doc, pending = service.suggestions.insertVerified(); await turn();
  if (action === 'context') context.previewParams.head_sha = 'b'.repeat(40);
  if (action === 'permission') context.canSuggest = false;
  if (action === 'read-only') service.setEditable(false);
  if (action === 'range') context.lineRange = { start: 2, end: 2 };
  source.resolve(action === 'file' ? 'changed\n' : action === 'oversize' ? 'x'.repeat(1_048_577) : action === 'not-text' ? 123 as unknown as string : 'original\n');
  await expect(pending).rejects.toThrow(/CONTEXT_CHANGED|UNAVAILABLE|READ_ONLY|SOURCE_CHANGED|SOURCE_INVALID|PREVIEW_CONTEXT_INVALID|GITLAB_EDITOR_NOT_READY/);
  expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false); expect(service.pendingInsertions).toBe(0);
});

it('rolls back filtered source insertion and permits an explicit verified retry', async () => {
  let refuse = false;
  const { service, editor } = await setup('original\n', ['original'], 1, [{ name: 'suggestion-filter',
    plugins: [new Plugin({ filterTransaction: transaction => !refuse || !transaction.docChanged })] }]);
  const before = editor.state.doc; refuse = true;
  await expect(service.suggestions.insertVerified()).rejects.toThrow('GITLAB_INSERTION_REFUSED');
  expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false);
  refuse = false; expect(await service.suggestions.insertVerified()).toEqual({ status: 'applied' });
});

it('refuses ambiguous synchronous host prefill and never replaces a sentinel heuristically', async () => {
  const { service, editor } = await setup('const value = "\\n";\n', ['const value = "\uE000";']);
  const before = editor.state.doc;
  expect(() => service.suggestions.insert()).toThrow('SOURCE_REQUIRED'); expect(editor.state.doc).toBe(before);
  await service.suggestions.insertVerified(); expect(service.getSerializedContent()).toContain('const value = "\\n";');
});

it.each(transport.fixtures)('preserves actual pinned Rapid Diffs $name source including selected multiline context', async fixture => {
  const { service, editor, context } = await setup(fixture.rawSource, [...fixture.context.lines], fixture.context.lineRange.start);
  Object.assign(context, fixture.context);
  expect(await service.suggestions.insertVerified()).toEqual({ status: 'applied' });
  const expected = fixture.rawSource.split('\n').slice(fixture.context.lineRange.start - 1, fixture.context.lineRange.end).join('\n') + '\n';
  const proposal = editor.state.doc.content.find(node => node.type.name === 'gitlab_code_suggestion')!;
  expect(proposal.textContent).toBe(expected);
  const session = service.suggestions.begin();
  expect(await session.prepareRange()).toEqual(fixture.rawSource.replace(/\n$/u, '').split('\n'));
});
