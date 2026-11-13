import { afterEach, expect, it, vi } from 'vitest';
import { NodeSelection, Plugin, Selection, insertText, splitBlock, textPointToPosition, undo, redo, type FountainExtension } from 'fountainjs-editor';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import { GitLabCodeEditingSession, getGitLabCodeContext, setGitLabCodeBlock } from '../integrations/gitlab/services/code_editing';

const source = 'Before\n\n```js\nconst x = 1;\nconsole.log(x);\n```\n\nAfter';
const html = '<p>Before</p><pre data-language="js"><code>const x = 1;\nconsole.log(x);</code></pre><p>After</p>';
const services: GitLabContentEditor[] = [];
afterEach(() => services.splice(0).forEach(service => service.dispose()));

it('creates serializable literal code after bold prose and retains deletion and undo', async () => {
  const source = '**Recovered paste**';
  const service = new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: async () => ({ body: '<p><strong>Recovered paste</strong></p>' }) });
  services.push(service); await service.setSerializedContent(source);
  const { editor } = service;
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 'Recovered paste'.length)));
  expect(splitBlock(editor)).toBe(true);
  expect(editor.state.storedMarks.map(mark => mark.type.name)).toContain('strong');
  expect(service.setCodeBlock('mermaid')).toBe(true);
  expect(insertText(editor, 'graph LR\n  Created-->Natively')).toBe(true);
  expect(editor.state.doc.child(1).content.every(node => !node.marks.length)).toBe(true);
  expect(service.status).toBe('ready');
  expect(service.getSerializedContent()).toContain('```mermaid\ngraph LR\n  Created-->Natively\n```');
  expect(service.beginCodeEdit().remove()).toBe(true);
  expect(undo(editor)).toBe(true);
  expect(service.getSerializedContent()).toContain('Created-->Natively');
});

it.each(['text', 'mermaid', 'plantuml'])('converts styled prose to literal %s source with stable selection and exact undo', async language => {
  const source = '**A** and `B`';
  const service = new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: async () => ({ body: '<p><strong>A</strong> and <code>B</code></p>' }) });
  services.push(service); await service.setSerializedContent(source);
  const { editor } = service;
  editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], 1, [0, 2], 1)));
  const before = editor.state.doc, selection = editor.state.selection;
  const positions = [textPointToPosition(before, selection.path, selection.from), textPointToPosition(before, selection.endPath, selection.to)];
  expect(service.setCodeBlock(language)).toBe(true);
  const selected = editor.state.selection;
  expect(selected.kind).toBe('text');
  expect([textPointToPosition(editor.state.doc, selected.path, selected.from),
    textPointToPosition(editor.state.doc, selected.endPath, selected.to)]).toEqual(positions);
  expect(editor.state.doc.child(0).textContent).toBe('A and B');
  expect(editor.state.doc.child(0).content.every(node => !node.marks.length)).toBe(true);
  expect(editor.state.storedMarks).toEqual([]);
  expect(service.getSerializedContent()).toBe('```' + language + '\nA and B\n```');
  expect(undo(editor)).toBe(true); expect(editor.state.doc.toJSON()).toEqual(before.toJSON());
  expect(service.getSerializedContent()).toBe(source);
  expect(redo(editor)).toBe(true); expect(service.getSerializedContent()).toContain('A and B');
});

it('preserves unrelated existing code blocks and neighboring paragraph identities during conversion', async () => {
  const { service, editor } = await setup();
  const before = editor.state.doc;
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([2, 0], 2)));
  expect(service.setCodeBlock('plantuml')).toBe(true);
  expect(editor.state.doc.child(0)).toBe(before.child(0)); expect(editor.state.doc.child(1)).toBe(before.child(1));
  expect(editor.state.doc.child(2).attrs.language).toBe('plantuml');
  expect(editor.state.doc.child(2).textContent).toBe('After');
});

it('refuses creating code while read-only without losing prose and permits retry', async () => {
  const { service, editor } = await setup();
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([2, 0], 2)));
  const before = editor.state.doc;
  service.setEditable(false);
  expect(() => service.setCodeBlock('mermaid')).toThrow('GITLAB_EDITOR_NOT_READY');
  expect(editor.state.doc).toBe(before);
  service.setEditable(true); expect(service.setCodeBlock('mermaid')).toBe(true);
});

it('rolls back code creation and formatting cleanup when a transaction filter refuses it', async () => {
  let refuse = false;
  const plugin = new Plugin({ filterTransaction: transaction => !refuse || !transaction.docChanged });
  const { service, editor } = await setup([{ name: 'code-creation-refusal', plugins: [plugin] }]);
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([2, 0], 2)));
  const before = editor.state.doc; refuse = true;
  expect(service.setCodeBlock('mermaid')).toBe(false);
  expect(editor.state.doc).toBe(before); expect(service.status).toBe('ready');
  expect(undo(editor)).toBe(false);
  refuse = false; expect(service.setCodeBlock('mermaid')).toBe(true);
});

it('publishes no partial code conversion when serialization refuses the completed batch', async () => {
  const { editor } = await setup();
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([2, 0], 2)));
  const before = editor.state.doc, observe = vi.fn(), release = editor.subscribe(observe);
  expect(() => setGitLabCodeBlock(editor, 'mermaid', () => { throw new Error('CONVERSION_REFUSED'); })).toThrow('CONVERSION_REFUSED');
  expect(editor.state.doc).toBe(before);
  expect(observe.mock.calls.every(([, transaction]) => !transaction.docChanged)).toBe(true);
  expect(undo(editor)).toBe(false); release();
});

it('keeps browser formatting shortcuts and beforeinput commands out of literal GitLab code without blocking prose or IME', async () => {
  const { editor } = await setup(), plugin = editor.state.plugins[0]!;
  const before = editor.state.doc;
  for (const key of ['b', 'i', 'u']) {
    expect(plugin.spec.props!.handleKeyDown!(editor, { key, ctrlKey: true, altKey: false } as KeyboardEvent)).toBe(true);
    expect(plugin.spec.props!.handleKeyDown!(editor, { key, metaKey: true, altKey: false } as KeyboardEvent)).toBe(true);
    expect(plugin.spec.props!.handleKeyDown!(editor, { key, ctrlKey: true, altKey: true } as KeyboardEvent)).toBe(false);
    expect(plugin.spec.props!.handleKeyDown!(editor, { key, ctrlKey: true, isComposing: true } as KeyboardEvent)).toBe(false);
  }
  for (const inputType of ['formatBold', 'formatItalic', 'formatUnderline', 'formatStrikeThrough'])
    expect(plugin.spec.props!.handleBeforeInput!(editor, { inputType } as InputEvent)).toBe(true);
  expect(editor.state.doc).toBe(before);
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([2, 0], 2)));
  expect(plugin.spec.props!.handleKeyDown!(editor, { key: 'b', ctrlKey: true } as KeyboardEvent)).toBe(false);
  expect(plugin.spec.props!.handleBeforeInput!(editor, { inputType: 'formatBold' } as InputEvent)).toBe(false);
});
async function setup(extensions: readonly FountainExtension[] = []) {
  const render = vi.fn(async () => ({ body: html }));
  const service = new GitLabContentEditor({ renderMarkdown: render, describeLabels: () => '', extensions });
  services.push(service); await service.setSerializedContent(source);
  const editor = service.editor;
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 4)));
  return { service, editor, render };
}

it('inspects a complete multiline code block from the model in pure Node', async () => {
  expect(typeof document).toBe('undefined');
  const { editor } = await setup();
  expect(getGitLabCodeContext(editor)).toEqual({ path: [1], language: 'js', text: 'const x = 1;\nconsole.log(x);' });
  editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [1])));
  expect(getGitLabCodeContext(editor)?.path).toEqual([1]);
  editor.dispatch(editor.createTransaction().setSelection(Selection.range([1, 0], 2, [2, 0], 2)));
  expect(getGitLabCodeContext(editor)).toBeUndefined();
});

it('changes a code language without altering source or neighboring blocks and supports one-step undo/redo', async () => {
  const { service, editor, render } = await setup();
  const before = editor.state.doc, selection = editor.state.selection;
  expect(service.beginCodeEdit().applyLanguage(' Python ')).toBe(true);
  expect(editor.state.doc.child(1).attrs.language).toBe('python');
  expect(editor.state.doc.child(1).textContent).toBe(before.child(1).textContent);
  expect(editor.state.doc.child(0)).toBe(before.child(0));
  expect(editor.state.doc.child(2)).toBe(before.child(2));
  expect(editor.state.selection.eq(selection)).toBe(true);
  expect(service.getSerializedContent()).toContain('```python\nconst x = 1;\nconsole.log(x);\n```');
  expect(render).toHaveBeenCalledTimes(1);
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(source);
  expect(redo(editor)).toBe(true); expect(editor.state.doc.child(1).attrs.language).toBe('python');
});

it.each(['', '\n  graph LR\n  A-->B\n\n', '\tα\u200Bβ\u00A0→🖋️\r\n'])('applies literal source %j without trimming, normalization or extra undo steps', async input => {
  const { service, editor } = await setup(), before = editor.state.doc;
  const session = service.beginCodeEdit();
  expect(session.applySource(input)).toBe(true);
  expect(session.closed).toBe(true);
  expect(editor.state.doc.child(1).textContent).toBe(input);
  expect(editor.state.doc.child(1).attrs).toEqual(before.child(1).attrs);
  expect(editor.state.doc.child(0)).toBe(before.child(0));
  expect(editor.state.doc.child(2)).toBe(before.child(2));
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(source);
  expect(undo(editor)).toBe(false);
  expect(redo(editor)).toBe(true); expect(editor.state.doc.child(1).textContent).toBe(input);
});

it('does not create history for an unchanged source or mutate a cancelled source draft', async () => {
  const { service, editor } = await setup(), before = editor.state;
  service.beginCodeEdit().close();
  expect(service.beginCodeEdit().applySource(before.doc.child(1).textContent)).toBe(true);
  expect(editor.state).toBe(before); expect(undo(editor)).toBe(false);
});

it('maps a source draft to its captured block after unrelated edits and caret movement', async () => {
  const { service, editor } = await setup(), session = service.beginCodeEdit();
  expect(session.targetPath).toEqual([1]);
  const paragraph = editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Inserted')]);
  editor.dispatch(editor.createTransaction().replaceNode([0], [paragraph, editor.state.doc.child(0)]));
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([3, 0], 2)));
  expect(session.targetPath).toEqual([2]);
  expect(session.applySource('Updated source')).toBe(true);
  expect(editor.state.doc.child(2).textContent).toBe('Updated source');
  expect(editor.state.doc.child(3).textContent).toBe('After');
  expect(editor.state.selection.path).toEqual([3, 0]);
  expect(session.targetPath).toBeUndefined();
});

it.each(['edited', 'deleted', 'replaced'])('refuses a source draft after its target is %s', async change => {
  const { service, editor } = await setup(), session = service.beginCodeEdit();
  if (change === 'edited') insertText(editor, 'changed');
  if (change === 'deleted') editor.dispatch(editor.createTransaction().replaceNode([1], []));
  if (change === 'replaced') await service.setSerializedContent(source);
  const before = editor.state.doc;
  expect(session.targetPath).toBeUndefined();
  expect(() => session.applySource('draft')).toThrow('GITLAB_CODE_TARGET_CHANGED');
  expect(editor.state.doc).toBe(before); expect(session.closed).toBe(false);
});

it('retains a source session through late read-only refusal and permits retry', async () => {
  const { service, editor } = await setup(), session = service.beginCodeEdit(), before = editor.state.doc;
  service.setEditable(false);
  expect(() => session.applySource('draft')).toThrow('GITLAB_EDITOR_NOT_READY');
  expect(editor.state.doc).toBe(before); expect(session.closed).toBe(false);
  service.setEditable(true); expect(session.applySource('draft')).toBe(true);
});

it('rolls back an unserializable source draft without publishing partial content or history', async () => {
  const { editor } = await setup(), before = editor.state.doc;
  let refuse = true;
  const session = new GitLabCodeEditingSession({ editor, ensureReady() {}, validate() { if (refuse) throw new Error('CONVERSION_REFUSED'); } });
  const observe = vi.fn(), release = editor.subscribe(observe);
  expect(() => session.applySource('draft')).toThrow('CONVERSION_REFUSED');
  expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false);
  expect(observe.mock.calls.every(([, transaction]) => !transaction.docChanged)).toBe(true);
  expect(session.closed).toBe(false); refuse = false;
  expect(session.applySource('draft')).toBe(true); release();
});

it('retains a source draft after a transaction filter refuses it', async () => {
  let refuse = false;
  const plugin = new Plugin({ filterTransaction: transaction => !refuse || !transaction.docChanged });
  const { service, editor } = await setup([{ name: 'source-refusal', plugins: [plugin] }]);
  const before = editor.state.doc, session = service.beginCodeEdit(); refuse = true;
  expect(() => session.applySource('draft')).toThrow('GITLAB_CODE_UPDATE_REFUSED');
  expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false);
  refuse = false; expect(session.applySource('draft')).toBe(true);
});

it.each(['my-company-dsl', 'c++', 'c#', 'fsharp', 'plain_text', 'text.v2'])('retains the custom non-executing language %s', async language => {
  const { service, editor } = await setup(); service.beginCodeEdit().applyLanguage(language);
  expect(editor.state.doc.child(1).attrs.language).toBe(language);
  expect(service.getSerializedContent()).toContain('```' + language + '\n');
});

it.each(['', 'two words', 'a\nb', 'x`y', '<script>', 'x'.repeat(81)])('refuses malformed language %j without closing the draft', async language => {
  const { service, editor } = await setup(), before = editor.state;
  const session = service.beginCodeEdit();
  expect(() => session.applyLanguage(language)).toThrow('GITLAB_CODE_INVALID_LANGUAGE');
  expect(editor.state).toBe(before); expect(session.closed).toBe(false);
  expect(session.applyLanguage('rust')).toBe(true);
});

it.each(['math', 'suggestion', 'glql'])('refuses the specialized %s renderer until its adapter is available', async language => {
  const { service, editor } = await setup(), before = editor.state;
  expect(() => service.beginCodeEdit().applyLanguage(language)).toThrow('GITLAB_CODE_SPECIALIZED_LANGUAGE');
  expect(editor.state).toBe(before);
});

it.each(['mermaid', 'plantuml'])('changes ordinary source to %s without execution or rewriting its contents', async language => {
  const { service, editor } = await setup(), original = editor.state.doc.child(1).textContent;
  expect(service.beginCodeEdit().applyLanguage(language)).toBe(true);
  expect(editor.state.doc.child(1).textContent).toBe(original);
  expect(service.getSerializedContent()).toContain('```' + language + '\n' + original);
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(source);
});

it('removes the whole selected code block and restores its source through undo', async () => {
  const { service, editor } = await setup();
  expect(service.beginCodeEdit().remove()).toBe(true);
  expect(editor.getText()).toBe('Before\nAfter');
  expect(getGitLabCodeContext(editor)).toBeUndefined();
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(source);
});

it('leaves an editable paragraph after removing the sole code block', async () => {
  const { service, editor, render } = await setup();
  render.mockResolvedValueOnce({ body: '<pre data-language="text"><code>only code</code></pre>' });
  await service.setSerializedContent('```text\nonly code\n```');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
  service.beginCodeEdit().remove();
  expect(editor.state.doc.child(0).type.name).toBe('paragraph');
  expect(insertText(editor, 'Next')).toBe(true); expect(service.getSerializedContent()).toBe('Next');
});

it('retains neighboring list items when deleting the sole code block in an item', async () => {
  const { service, editor, render } = await setup();
  render.mockResolvedValueOnce({ body: '<ul><li><pre data-canonical-lang="js"><code>nested</code></pre></li><li><p>Neighbor</p></li></ul>' });
  await service.setSerializedContent('- ```js\n  nested\n  ```\n- Neighbor');
  let path: readonly number[] = [];
  editor.state.doc.descendants((node, currentPath) => { if (node.type.name === 'code_block') path = currentPath; });
  editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, path)));
  expect(service.beginCodeEdit().remove()).toBe(true);
  expect(editor.getText()).toContain('Neighbor');
  expect(editor.state.doc.child(0).type.name).toBe('bullet_list');
  expect(() => editor.state.schema.validate(editor.state.doc)).not.toThrow();
});

it('maps an unrelated inserted block but never redirects to a later caret', async () => {
  const { service, editor } = await setup(); const session = service.beginCodeEdit();
  const paragraph = editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Inserted')]);
  editor.dispatch(editor.createTransaction().replaceNode([0], [paragraph, editor.state.doc.child(0)]));
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([3, 0], 2)));
  expect(session.conflict).toBe(false); session.applyLanguage('rust');
  expect(editor.state.doc.child(2).attrs.language).toBe('rust');
  expect(editor.state.selection.path).toEqual([3, 0]);
});

it('refuses a changed target while retaining a retryable draft', async () => {
  const { service, editor } = await setup(); const session = service.beginCodeEdit();
  insertText(editor, 'changed'); const before = editor.state.doc;
  expect(session.conflict).toBe(true);
  expect(() => session.applyLanguage('rust')).toThrow('GITLAB_CODE_TARGET_CHANGED');
  expect(editor.state.doc).toBe(before);
});

it('invalidates an old session after document replacement even with identical rendered content', async () => {
  const { service } = await setup(); const session = service.beginCodeEdit();
  await service.setSerializedContent(source);
  expect(() => session.remove()).toThrow('GITLAB_CODE_TARGET_CHANGED');
});

it('cancels, supersedes and disposes sessions without mutations', async () => {
  const { service, editor } = await setup(), before = editor.state.doc;
  const first = service.beginCodeEdit(), second = service.beginCodeEdit();
  expect(first.closed).toBe(true); expect(() => first.remove()).toThrow('GITLAB_CODE_SESSION_CLOSED');
  second.close(); expect(editor.state.doc).toBe(before);
  const last = service.beginCodeEdit(); service.dispose(); expect(last.closed).toBe(true);
});

it('does not add an undo entry for an unchanged language', async () => {
  const { service, editor } = await setup(), before = editor.state;
  expect(service.beginCodeEdit().applyLanguage('js')).toBe(true);
  expect(editor.state).toBe(before); expect(undo(editor)).toBe(false);
});

it('leaves an unchanged authored language spelling and exact original source intact', async () => {
  const { service, editor, render } = await setup();
  const original = '```MyDSL\nx\n```';
  render.mockResolvedValueOnce({ body: '<pre data-canonical-lang="MyDSL"><code>x</code></pre>' });
  await service.setSerializedContent(original);
  editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [0])));
  const before = editor.state.doc; service.beginCodeEdit().applyLanguage('MyDSL');
  expect(editor.state.doc).toBe(before); expect(service.getSerializedContent()).toBe(original);
  expect(undo(editor)).toBe(false);
});

it('refuses edits while read-only and permits retry after restoration', async () => {
  const { service, editor } = await setup(), before = editor.state.doc;
  const session = service.beginCodeEdit(); service.setEditable(false);
  expect(() => session.remove()).toThrow('GITLAB_EDITOR_NOT_READY'); expect(editor.state.doc).toBe(before);
  service.setEditable(true); expect(session.applyLanguage('go')).toBe(true);
});

it('rolls back a conversion refusal without publishing a partial document or history entry', async () => {
  const { service, editor } = await setup(), before = editor.state.doc;
  let refuse = true;
  const session = new GitLabCodeEditingSession({ editor, ensureReady() {}, validate() { if (refuse) throw new Error('CONVERSION_REFUSED'); } });
  const observe = vi.fn(), release = editor.subscribe(observe);
  expect(() => session.applyLanguage('go')).toThrow('CONVERSION_REFUSED');
  expect(editor.state.doc).toBe(before); expect(observe.mock.calls.every(([, transaction]) => !transaction.docChanged)).toBe(true);
  expect(undo(editor)).toBe(false); refuse = false; expect(session.applyLanguage('go')).toBe(true);
  release(); expect(service.getSerializedContent()).toContain('```go');
});

it('isolates a throwing close observer after a successful edit and closes only once', async () => {
  const { editor } = await setup();
  const closed = vi.fn(() => { throw new Error('OBSERVER_FAILED'); }), onListenerError = vi.fn();
  const session = new GitLabCodeEditingSession({ editor, ensureReady() {}, validate() {}, closed, onListenerError });
  expect(session.applyLanguage('go')).toBe(true);
  expect(editor.state.doc.child(1).attrs.language).toBe('go');
  expect(closed).toHaveBeenCalledTimes(1); expect(onListenerError).toHaveBeenCalledTimes(1);
  session.close(); expect(closed).toHaveBeenCalledTimes(1);
});

it.each(['language', 'remove'])('honors a transaction filter refusing %s', async operation => {
  let refuse = false;
  const plugin = new Plugin({ filterTransaction: transaction => !refuse || !transaction.docChanged });
  const { service, editor } = await setup([{ name: 'code-refusal', plugins: [plugin] }]);
  refuse = true;
  const before = editor.state.doc, session = service.beginCodeEdit();
  expect(() => operation === 'remove' ? session.remove() : session.applyLanguage('go')).toThrow('GITLAB_CODE_UPDATE_REFUSED');
  expect(editor.state.doc).toBe(before); refuse = false; expect(session.applyLanguage('go')).toBe(true);
});
