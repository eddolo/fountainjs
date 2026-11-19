import { afterEach, expect, it, vi } from 'vitest';
import { createEditor, createHistoryPlugin, Plugin, Selection, insertText, undo, redo, type Editor } from 'fountainjs-editor';
import { exitGitLabCode } from '../integrations/gitlab/services/code_editing';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import contexts from '../integrations/gitlab/fixtures/suggestion-context-live.json';
import captures from '../integrations/gitlab/fixtures/suggestion-live-html.json';
import { createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import { serializeGitLabSuggestionNode } from '../integrations/gitlab/services/code_suggestion_node';
import { GitLabSuggestionEditing, readGitLabSuggestionContext, type GitLabSuggestionEditingOptions } from '../integrations/gitlab/services/code_suggestion_editing';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.destroy()));
const source = 'first\noriginal A\noriginal B\nlast\n';
function setup(extra: Partial<GitLabSuggestionEditingOptions> = {}, plugins: Plugin[] = []) {
  const editor = createEditor({ schema: createGitLabSchemaSpec(), plugins: [createHistoryPlugin(), ...plugins], content: {
    type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
      { type: 'gitlab_code_suggestion', attrs: { params: '-1+0', fence: '```' }, content: [{ type: 'text', text: 'proposal();\n' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
    ],
  } });
  editors.push(editor);
  const host = { canSuggest: true, showPopover: false, lines: ['original A', 'original B'],
    lineRange: { start: 2, end: 3 }, lineType: 'new', blobRawPath: '/group/project/-/raw/main/file.js' };
  const options: GitLabSuggestionEditingOptions = { editor, ensureReady() {}, getContext: () => host,
    validate(doc) { doc.descendants(node => { if (node.type.name === 'gitlab_code_suggestion') serializeGitLabSuggestionNode(node); }); },
    loadSource: vi.fn(async () => source), ...extra };
  const editing = new GitLabSuggestionEditing(options);
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 3)));
  return { editor, host, options, editing };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

it('reads a copied immutable host context without changing invisible or whitespace source', () => {
  const { host } = setup(); host.lines = ['\tα\u200B\u00A0 ', ''];
  const result = readGitLabSuggestionContext(host)!;
  host.lines[0] = 'changed'; host.lineRange.start = 1;
  expect(result.lines).toEqual(['\tα\u200B\u00A0 ', '']);
  expect(result.lineRange).toEqual({ start: 2, end: 3 });
  expect(Object.isFrozen(result.lines)).toBe(true); expect(Object.isFrozen(result.lineRange)).toBe(true);
  expect(readGitLabSuggestionContext({ canSuggest: false })).toBeUndefined();
});
it.each([
  { lines: ['a\nb', 'c'] }, { lines: [] }, { lineRange: { start: 3, end: 2 } },
  { lineRange: { start: 1, end: 3 } }, { lineRange: { start: 2.5, end: 3.5 } },
  { lineType: 'old' }, { lineType: { toString: (): string => 'new' } }, { blobRawPath: '//other.test/file' }, { blobRawPath: 'https://other.test/file' },
  { blobRawPath: '/path\\file' }, { extra: true }, { showPopover: 'yes' },
])('refuses malformed host context %j', patch => {
  const { host } = setup(); expect(() => readGitLabSuggestionContext({ ...host, ...patch })).toThrow('CONTEXT_INVALID');
});
it('inserts the selected GitLab lines as a proposal with offsets, one-step undo and redo', () => {
  const { editor, editing } = setup(), before = editor.state.doc;
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 6)));
  expect(editing.insert()).toBe(true);
  const added = editor.state.doc.content.filter(node => node.type.name === 'gitlab_code_suggestion');
  expect(added.map(node => node.textContent)).toEqual(['original A\noriginal B\n', 'proposal();\n']);
  expect(added[0]!.attrs.params).toBe('-1+0');
  expect(undo(editor)).toBe(true); expect(editor.state.doc.toJSON()).toEqual(before.toJSON());
  expect(undo(editor)).toBe(false); expect(redo(editor)).toBe(true);
});
it('refuses nested insertion, unavailable context and read-only editing without mutations', () => {
  const { editor, editing, host } = setup(), before = editor.state.doc;
  expect(() => editing.insert()).toThrow('ALREADY_INSIDE');
  host.canSuggest = false; expect(editing.available).toBe(false); expect(() => editing.begin()).toThrow('UNAVAILABLE');
  host.canSuggest = true; editor.setEditable(false); expect(() => editing.begin()).toThrow('READ_ONLY');
  expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false);
});
it('rolls back insertion and history if conversion or the host context changes mid-command', () => {
  const { editor, editing, host, options } = setup();
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 6)));
  const before = editor.state.doc;
  options.validate = () => { throw new Error('CONVERSION_REFUSED'); };
  expect(() => editing.insert()).toThrow('CONVERSION_REFUSED'); expect(editor.state.doc).toBe(before);
  options.validate = () => { host.lineRange = { start: 3, end: 4 }; };
  expect(() => editing.insert()).toThrow('CONTEXT_CHANGED'); expect(editor.state.doc).toBe(before);
  expect(undo(editor)).toBe(false);
});
it('follows the owned proposal after unrelated edits and caret movement, retaining a single undoable source edit', () => {
  const { editor, editing } = setup(), session = editing.begin();
  const paragraph = editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Inserted')]);
  editor.dispatch(editor.createTransaction().replaceNode([0], [paragraph, editor.state.doc.child(0)]));
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([3, 0], 1)));
  expect(session.targetPath).toEqual([2]);
  expect(session.applySource('new();\n\n')).toBe(true); expect(session.closed).toBe(true);
  expect(editor.state.doc.child(2).textContent).toBe('new();\n\n'); expect(editor.state.doc.child(3).textContent).toBe('After');
  expect(editor.state.selection.path).toEqual([3, 0]);
  expect(undo(editor)).toBe(true); expect(editor.state.doc.child(2).textContent).toBe('proposal();\n');
});
it.each(['edited', 'deleted', 'replaced'])('refuses a pending source edit after its proposal is %s', change => {
  const { editor, editing } = setup(), session = editing.begin();
  if (change === 'edited') insertText(editor, 'changed');
  if (change === 'deleted') editor.dispatch(editor.createTransaction().replaceNode([1], []));
  if (change === 'replaced') editor.dispatch(editor.createTransaction().replaceNode([0], [editor.state.doc.child(0)]).setMeta('content$replace', true).setMeta('force', true));
  const before = editor.state.doc;
  expect(session.conflict).toBe(true); expect(() => session.applySource('draft')).toThrow('TARGET_CHANGED');
  expect(editor.state.doc).toBe(before); session.close();
});
it('supports deletion suggestions and closes unchanged or cancelled sessions without history', () => {
  const { editor, editing } = setup(), before = editor.state.doc;
  editing.begin().close(); expect(editing.begin().applySource('proposal();\n')).toBe(true); expect(undo(editor)).toBe(false);
  expect(editing.begin().applySource('')).toBe(true);
  expect(serializeGitLabSuggestionNode(editor.state.doc.child(1))).toBe('```suggestion:-1+0\n```');
  expect(undo(editor)).toBe(true); expect(editor.state.doc.toJSON()).toEqual(before.toJSON());
});
it('rolls back refused proposal changes and permits retry without publishing intermediate content', () => {
  let refuse = false;
  const { editor, editing, options } = setup({}, [new Plugin({ filterTransaction: transaction => !refuse || !transaction.docChanged })]);
  const session = editing.begin(), before = editor.state.doc, observe = vi.fn(), release = editor.subscribe(observe);
  refuse = true; expect(() => session.applySource('draft')).toThrow('UPDATE_REFUSED'); expect(editor.state.doc).toBe(before);
  refuse = false; options.validate = () => { throw new Error('CONVERSION_REFUSED'); };
  expect(() => session.applySource('draft')).toThrow('CONVERSION_REFUSED'); expect(editor.state.doc).toBe(before);
  expect(observe.mock.calls.every(([, transaction]) => !transaction.docChanged)).toBe(true); expect(undo(editor)).toBe(false);
  options.validate = () => {}; expect(session.applySource('draft')).toBe(true); release();
});
it('shrinks within captured lines without fetching and keeps replacement text unchanged', async () => {
  const { editor, editing, options } = setup(), session = editing.begin();
  expect(await session.applyRange(3, 3)).toBe(true); expect(options.loadSource).not.toHaveBeenCalled();
  expect(editor.state.doc.child(1).attrs.params).toBe('-0+0'); expect(editor.state.doc.child(1).textContent).toBe('proposal();\n');
  expect(undo(editor)).toBe(true); expect(editor.state.doc.child(1).attrs.params).toBe('-1+0');
});
it('edits a posted multiline replacement when the host supplies only its anchor line', async () => {
  const { editor, editing, host, options } = setup();
  host.lines = ['original B'];
  host.lineRange = { start: 3, end: 3 };
  const before = editor.state.doc.toJSON();
  const session = editing.begin();
  await expect(session.applyChange('draft\n', 1, 3)).rejects.toThrow('SOURCE_REQUIRED');
  expect(await session.applyChange('draft\n', 2, 3)).toBe(true);
  const proposal = editor.state.doc.child(1);
  expect(proposal.textContent).toBe('draft\n');
  expect(proposal.attrs.params).toBe('-1+0');
  expect(options.loadSource).not.toHaveBeenCalled();
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.toJSON()).toEqual(before);
});

it('checks actual file lines before expanding a range and rechecks fresh source when applying', async () => {
  const { editor, editing, options } = setup(), session = editing.begin();
  await expect(session.applyRange(1, 4)).rejects.toThrow('SOURCE_REQUIRED');
  expect(await session.prepareRange()).toEqual(['first', 'original A', 'original B', 'last']);
  expect(await session.applyRange(1, 4)).toBe(true); expect(options.loadSource).toHaveBeenCalledTimes(2);
  expect(editor.state.doc.child(1).attrs.params).toBe('-2+1'); expect(editor.state.doc.child(1).textContent).toBe('proposal();\n');
});
it.each([[0, 3], [4, 4], [1, 2], [2.5, 3], [1, 5]])('refuses invalid or out-of-file range %j', async (start, end) => {
  const { editor, editing } = setup(), before = editor.state.doc, session = editing.begin(); await session.prepareRange();
  await expect(session.applyRange(start, end)).rejects.toThrow('RANGE_INVALID'); expect(editor.state.doc).toBe(before); session.close();
});
it('refuses changed raw source both during preparation and before range application', async () => {
  const { editor, editing, options } = setup(), before = editor.state.doc;
  options.loadSource = vi.fn(async () => source.replace('original A', 'changed'));
  await expect(editing.begin().prepareRange()).rejects.toThrow('SOURCE_CHANGED');
  options.loadSource = vi.fn(async () => source);
  const session = editing.begin(); await session.prepareRange();
  options.loadSource = vi.fn(async () => source + 'new row\n');
  await expect(session.applyRange(1, 4)).rejects.toThrow('SOURCE_CHANGED'); expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false);
});
it.each(['closed', 'revoked', 'context', 'target'])('rejects late raw-file completion after the session is %s', async change => {
  const pending = deferred<string>(), { editor, editing, host } = setup({ loadSource: vi.fn(() => pending.promise) });
  const session = editing.begin(), prepare = session.prepareRange();
  if (change === 'closed') session.close();
  if (change === 'revoked') host.canSuggest = false;
  if (change === 'context') host.lineRange = { start: 3, end: 4 };
  if (change === 'target') insertText(editor, 'changed');
  const before = editor.state.doc; pending.resolve(source);
  await expect(prepare).rejects.toThrow(/SESSION_CLOSED|UNAVAILABLE|CONTEXT_CHANGED|TARGET_CHANGED/);
  expect(editor.state.doc).toBe(before); session.close();
});
it('does not let a superseded raw-file response overwrite the current range source', async () => {
  const first = deferred<string>(), second = deferred<string>(); let request = 0;
  const { editing, options } = setup({ loadSource: vi.fn(() => ++request === 1 ? first.promise : second.promise) });
  const session = editing.begin(), older = session.prepareRange(), newer = session.prepareRange();
  second.resolve(source); await newer;
  first.resolve(source.replace('original A', 'stale')); await expect(older).rejects.toThrow('SOURCE_SUPERSEDED');
  expect((options.loadSource as ReturnType<typeof vi.fn>).mock.calls[0]![1].signal.aborted).toBe(true); session.close();
});
it('does not interpret a cross-block text selection as one selected suggestion', () => {
  const { editor, editing } = setup();
  editor.dispatch(editor.createTransaction().setSelection(Selection.range([1, 0], 0, [2, 0], 2)));
  expect(() => editing.begin()).toThrow('SELECTION_REQUIRED');
  expect(() => editing.insert()).toThrow('ALREADY_INSIDE');
});

it('owns suggestion session cancellation through the real content service lifetime in pure Node', async () => {
  expect(typeof document).toBe('undefined');
  const fixture = captures.fixtures.find(item => item.name === 'single')!;
  const { host } = setup(), pending = deferred<string>(); let signal: AbortSignal | undefined;
  const service = new GitLabContentEditor({ renderMarkdown: async () => ({ body: fixture.body }), describeLabels: () => '',
    getSuggestionContext: () => host, loadSuggestionSource: async (_path, options) => { signal = options.signal; return pending.promise; } });
  try {
    expect(service.suggestions.available).toBe(false);
    await service.setSerializedContent(fixture.source); expect(service.suggestions.available).toBe(true);
    service.editor.dispatch(service.editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    const session = service.suggestions.begin(), prepare = session.prepareRange();
    service.dispose(); expect(session.closed).toBe(true); expect(signal?.aborted).toBe(true);
    pending.resolve(source); await expect(prepare).rejects.toThrow('SESSION_CLOSED');
    expect(service.suggestions.available).toBe(false); expect(() => service.suggestions.insert()).toThrow('DISPOSED');
  } finally { service.dispose(); }
});
it('invalidates an owned session on an equal-source service reload and closes the prior session on reopen', async () => {
  const fixture = captures.fixtures.find(item => item.name === 'single')!, { host } = setup();
  const service = new GitLabContentEditor({ renderMarkdown: async () => ({ body: fixture.body }), describeLabels: () => '', getSuggestionContext: () => host });
  try {
    await service.setSerializedContent(fixture.source);
    const first = service.suggestions.begin(), second = service.suggestions.begin(); expect(first.closed).toBe(true);
    await service.setSerializedContent(fixture.source);
    expect(second.conflict).toBe(true); expect(() => second.applySource('late')).toThrow('TARGET_CHANGED');
    expect(service.getSerializedContent()).toBe(fixture.source);
  } finally { service.dispose(); }
});

it('compares the exact loaded file snapshot even when only its line endings change', async () => {
  const { editor, editing, options } = setup({ loadSource: async () => source.replaceAll('\n', '\r\n') });
  const before = editor.state.doc, session = editing.begin();
  expect(await session.prepareRange()).toEqual(['first', 'original A', 'original B', 'last']);
  options.loadSource = async () => source;
  await expect(session.applyRange(1, 4)).rejects.toThrow('SOURCE_CHANGED'); expect(editor.state.doc).toBe(before);
});

it.each(['single', 'quoted', 'nested-list'])('leaves %s suggestion at its own parent boundary with undo and original source intact', async kind => {
  const fixture = captures.fixtures.find(item => item.name === kind)!;
  const service = new GitLabContentEditor({ renderMarkdown: async () => ({ body: fixture.body }), describeLabels: () => '' });
  try {
    await service.setSerializedContent(fixture.source);
    const { editor } = service; let path: number[] = [];
    editor.state.doc.descendants((node, current) => { if (node.type.name === 'gitlab_code_suggestion') path = [...current]; });
    const before = editor.state.doc, node = path.reduce((owner, index) => owner.child(index), before);
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([...path, 0], 0)));
    const handler = editor.state.plugins[0]!.spec.props!.handleKeyDown!;
    const event = { key: 'Enter', ctrlKey: true, altKey: false, shiftKey: false, isComposing: false, stopPropagation: vi.fn() } as unknown as KeyboardEvent;
    expect(handler(editor, { ...event, isComposing: true } as KeyboardEvent)).toBe(false);
    expect(handler(editor, { ...event, ctrlKey: false } as KeyboardEvent)).toBe(false);
    expect(handler(editor, event)).toBe(true); expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(editor.state.selection.path.slice(0, -2)).toEqual(path.slice(0, -1));
    expect(path.reduce((owner, index) => owner.child(index), editor.state.doc)).toBe(node);
    const exited = editor.state.doc;
    expect(insertText(editor, 'Review notes.')).toBe(true);
    expect(service.getSerializedContent()).toContain('Review notes.');
    expect(undo(editor)).toBe(true); expect(editor.state.doc.toJSON()).toEqual(exited.toJSON());
    expect(undo(editor)).toBe(true); expect(editor.state.doc.toJSON()).toEqual(before.toJSON());
    expect(service.getSerializedContent()).toBe(fixture.source);
  } finally { service.dispose(); }
});
it('refuses read-only code exit and rolls back a conversion refusal', () => {
  const { editor } = setup(), before = editor.state.doc;
  expect(() => exitGitLabCode(editor, () => { throw new Error('EXIT_REFUSED'); })).toThrow('EXIT_REFUSED');
  expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false);
  editor.setEditable(false); expect(exitGitLabCode(editor, () => {})).toBe(false);
});

it.each(contexts.fixtures)('reads actual Rapid Diffs $name context with immutable file/revision ownership', fixture => {
  const input = JSON.parse(JSON.stringify(fixture.context)), parsed = readGitLabSuggestionContext(input)!;
  expect(parsed.previewParams).toEqual(fixture.context.previewParams); expect(Object.isFrozen(parsed.previewParams)).toBe(true);
  input.previewParams.head_sha = 'a'.repeat(40); expect(parsed.previewParams!.head_sha).toBe(fixture.context.previewParams.head_sha);
  expect(parsed.lines).toEqual(fixture.rawSource.split('\n').slice(parsed.lineRange.start - 1, parsed.lineRange.end));
});
it.each([
  { preview_suggestions: false }, { line: 2 }, { file_path: '../file.js' }, { file_path: '/file.js' },
  { file_path: 'file\u0000.js' }, { head_sha: 'not-a-commit' }, { extra: true },
])('refuses malformed Rapid Diffs preview metadata %j', patch => {
  const original = contexts.fixtures[0]!.context;
  expect(() => readGitLabSuggestionContext({ ...original, previewParams: { ...original.previewParams, ...patch } })).toThrow('PREVIEW_CONTEXT_INVALID');
});
it('rejects a pending source edit when only the Rapid Diffs base revision changes', () => {
  const current = JSON.parse(JSON.stringify(contexts.fixtures[0]!.context));
  const { editing, editor } = setup({ getContext: () => current }), session = editing.begin(), before = editor.state.doc;
  current.previewParams.base_sha = 'b'.repeat(40);
  expect(() => session.applySource('late')).toThrow('CONTEXT_CHANGED'); expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false);
});

it.each(contexts.fixtures)('inserts and prepares real $name line context without losing raw characters', async fixture => {
  const { editing, editor } = setup({ getContext: () => fixture.context, loadSource: async () => fixture.rawSource });
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 6)));
  expect(editing.insert()).toBe(true);
  const proposal = editor.state.doc.child(1), expected = fixture.context.lines.join('\n') + '\n';
  expect(proposal.textContent).toBe(expected); expect(proposal.attrs.params).toBe('-0+0');
  const session = editing.begin(); await session.prepareRange(); expect(await session.applyRange(1, 5)).toBe(true);
  expect(editor.state.doc.child(1).textContent).toBe(expected);
});

it('applies a replacement and absolute file range atomically with one undo and redo', async () => {
  const { editor, editing } = setup(), before = editor.state.doc, session = editing.begin();
  expect(session.initial.range).toEqual({ start: 2, end: 3 }); expect(Object.isFrozen(session.initial.range)).toBe(true);
  await session.prepareRange(); expect(await session.applyChange('combined();\n', 1, 4)).toBe(true);
  expect(editor.state.doc.child(1).attrs.params).toBe('-2+1'); expect(editor.state.doc.child(1).textContent).toBe('combined();\n');
  expect(undo(editor)).toBe(true); expect(editor.state.doc.toJSON()).toEqual(before.toJSON()); expect(undo(editor)).toBe(false);
  expect(redo(editor)).toBe(true); expect(editor.state.doc.child(1).textContent).toBe('combined();\n');
});
it('publishes neither range nor source when combined editing fails validation', async () => {
  const { editor, editing, options } = setup(), session = editing.begin(), before = editor.state.doc;
  await session.prepareRange(); options.validate = () => { throw new Error('COMBINED_REFUSED'); };
  await expect(session.applyChange('combined();\n', 1, 4)).rejects.toThrow('COMBINED_REFUSED');
  expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false); expect(session.closed).toBe(false);
});

it('replaces the sole default empty paragraph and clears prose marks when inserting a literal suggestion', () => {
  const { editing, editor } = setup(), schema = editor.state.schema;
  const empty = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('')])]);
  editor.dispatch(editor.createTransaction().replaceDocument(empty).setMeta('history$reset', true)
    .setSelection(Selection.cursor([0, 0], 0)).setStoredMarks([schema.mark('strong')]));
  expect(editing.insert()).toBe(true); expect(editor.state.doc.childCount).toBe(1);
  expect(editor.state.doc.child(0).type.name).toBe('gitlab_code_suggestion'); expect(editor.state.storedMarks).toEqual([]);
  expect(insertText(editor, 'typed();')).toBe(true); expect(editor.state.doc.child(0).content.every(node => !node.marks.length)).toBe(true);
});
