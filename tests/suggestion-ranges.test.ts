import { afterEach, expect, it } from 'vitest';
import { createEditor, Selection, mapSelection, textPointToPosition, type Editor, type Node, type Transaction } from '../src/core';
import { CoreExtension, HistoryExtension, undo, redo } from '../src/extensions';
import { composeExtensions } from '../src/extensions/extension';
import { createMentionExtension, createMentionNode, insertMention, type MentionService } from '../src/extensions/mention';
import { insertInlineAtom } from '../src/extensions/inline-atom';
import { findSuggestionMatch } from '../src/extensions/suggestion';
import { suggestionDecorations } from '../src/extensions/suggestion';
import { createSlashCommandExtension, type SlashCommandService } from '../src/extensions/slash-command';

const editors: Editor[] = [];
afterEach(() => { for (const editor of editors.splice(0)) editor.destroy(); });
function setup() {
  const kit = composeExtensions([CoreExtension, HistoryExtension, createMentionExtension({
    suggestions: [{ char: '@', items: () => [{ id: 'alice', label: 'Alice' }] }],
  })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins }); editors.push(editor);
  return { editor, schema: editor.state.schema, service: kit.services.mentions as MentionService };
}
function seed(editor: Editor, blocks: readonly Node[], path: readonly number[], offset: number) {
  editor.dispatch(editor.createTransaction().replaceDocument(editor.state.schema.node('doc', {}, blocks))
    .setSelection(Selection.cursor(path, offset)).setMeta('addToHistory', false));
}

it('matches a reference across differently formatted text leaves without requiring a DOM', () => {
  const { editor, schema } = setup();
  seed(editor, [schema.node('paragraph', {}, [schema.text('Hello '), schema.text('@al', [schema.mark('strong')]),
    schema.text('ice suffix', [schema.mark('em')])])], [0, 2], 3);
  expect(typeof globalThis.document).toBe('undefined');
  expect(findSuggestionMatch(editor.state, [{ char: '@' }])).toEqual({ trigger: '@', query: 'alice', text: '@alice',
    range: { path: [0, 1], from: 0, to: 3, endPath: [0, 2] } });
});
it('checks the real prefix across formatting instead of treating every leaf as a new line', () => {
  const { editor, schema } = setup();
  seed(editor, [schema.node('paragraph', {}, [schema.text('email'), schema.text('@root', [schema.mark('strong')])])], [0, 1], 5);
  expect(findSuggestionMatch(editor.state, [{ char: '@' }])).toBeNull();
  expect(findSuggestionMatch(editor.state, [{ char: '@', allowedPrefixes: null }])?.query).toBe('root');
});
it('does not open a slash command in a later formatted run after ordinary text', () => {
  const { editor, schema } = setup();
  seed(editor, [schema.node('paragraph', {}, [schema.text('Prose '), schema.text('/close', [schema.mark('strong')])])], [0, 1], 6);
  expect(findSuggestionMatch(editor.state, [{ char: '/', startOfLine: true }])).toBeNull();
});
it.each(['hard_break', 'inline_image'])('respects an inline %s boundary without matching through it', kind => {
  const { editor, schema } = setup();
  const atom = kind === 'hard_break' ? schema.node(kind) : schema.node(kind, { src: '/figure.png' });
  seed(editor, [schema.node('paragraph', {}, [schema.text('@al'), atom, schema.text('ice')])], [0, 2], 3);
  expect(findSuggestionMatch(editor.state, [{ char: '@' }])).toBeNull();
});
it('allows line-start suggestions after a hard break, but not after an inline image', () => {
  const { editor, schema } = setup();
  for (const [node, expected] of [[schema.node('hard_break'), 'close'], [schema.node('inline_image', { src: '/figure.png' }), null]] as const) {
    seed(editor, [schema.node('paragraph', {}, [schema.text('Earlier'), node, schema.text('/close')])], [0, 2], 6);
    expect(findSuggestionMatch(editor.state, [{ char: '/', startOfLine: true }])?.query ?? null).toBe(expected);
  }
});
it('supports a literal newline without confusing the paragraph start and current line', () => {
  const { editor, schema } = setup();
  seed(editor, [schema.node('paragraph', {}, [schema.text('First\n/close')])], [0, 0], 12);
  expect(findSuggestionMatch(editor.state, [{ char: '/', startOfLine: true }])?.range).toEqual({ path: [0, 0], from: 6, to: 12 });
});
it('supports actual long GitLab prefixes while bounding configuration size', () => {
  const { editor, schema } = setup();
  seed(editor, [schema.node('paragraph', {}, [schema.text('[vulnerability:42')])], [0, 0], 17);
  expect(findSuggestionMatch(editor.state, [{ char: '[vulnerability:' }])?.query).toBe('42');
  expect(() => findSuggestionMatch(editor.state, [{ char: 'x'.repeat(65) }])).toThrow();
  expect(() => findSuggestionMatch(editor.state, [{ char: 'bad prefix' }])).toThrow();
});
it('matches within nested prose and picks the nearest trigger before converting its text paths', () => {
  const { editor, schema } = setup();
  seed(editor, [schema.node('blockquote', {}, [schema.node('paragraph', {}, [schema.text('#12 '),
    schema.text('@root', [schema.mark('strong')])])])], [0, 0, 1], 5);
  expect(findSuggestionMatch(editor.state, [{ char: '#', allowSpaces: true }, { char: '@' }])).toEqual({
    trigger: '@', query: 'root', text: '@root', range: { path: [0, 0, 1], from: 0, to: 5 },
  });
});
it('uses the nearest valid occurrence when the same trigger appears several times', () => {
  const { editor, schema } = setup();
  seed(editor, [schema.node('paragraph', {}, [schema.text('@one '), schema.text('@two', [schema.mark('strong')])])], [0, 1], 4);
  expect(findSuggestionMatch(editor.state, [{ char: '@', allowSpaces: true }])).toEqual({ trigger: '@', query: 'two', text: '@two',
    range: { path: [0, 1], from: 0, to: 4 } });
});
it('the mention controller inserts one real atom across formatting, with exact one-step undo and redo', async () => {
  const { editor, schema, service } = setup();
  const paragraph = schema.node('paragraph', {}, [schema.text('Before '), schema.text('@al', [schema.mark('strong')]),
    schema.text('ice after', [schema.mark('em')])]);
  seed(editor, [paragraph], [0, 2], 3);
  const controller = service.getController(editor); await Promise.resolve(); await Promise.resolve();
  expect(controller.getSnapshot().items.map(item => item.id)).toEqual(['alice']);
  expect(controller.accept()).toBe(true);
  expect(editor.state.doc.child(0).content.map(node => node.type.name)).toEqual(['text', 'mention', 'text']);
  expect(editor.getText()).toBe('Before @Alice  after');
  expect(editor.state.doc.child(0).child(2).marks.map(mark => mark.type.name)).toEqual(['em']);
  expect(editor.state.selection).toEqual(Selection.cursor([0, 2], 1));
  expect(undo(editor)).toBe(true); expect(editor.state.doc.child(0).eq(paragraph)).toBe(true);
  expect(redo(editor)).toBe(true); expect(editor.state.doc.child(0).child(1).type.name).toBe('mention');
});
it.each([false, true])('maps outside anchors precisely for an inline atom (cross-run=%s)', crossRun => {
  const { editor, schema } = setup();
  const pieces = crossRun ? [schema.text('Before @al'), schema.text('ice after', [schema.mark('em')])]
    : [schema.text('Before @alice after')];
  seed(editor, [schema.node('paragraph', {}, pieces)], [0, 0], 0);
  const before = editor.state.doc;
  const prefix = Selection.cursor([0, 0], 2), suffix = Selection.cursor(crossRun ? [0, 1] : [0, 0], crossRun ? 6 : 16);
  const prefixPosition = textPointToPosition(before, prefix.path, prefix.from);
  const suffixPosition = textPointToPosition(before, suffix.path, suffix.from);
  let applied: Transaction | undefined;
  const release = editor.subscribe((_state, transaction) => { applied = transaction; });
  const node = createMentionNode(editor, { id: 'alice', label: 'Alice' })!;
  expect(insertInlineAtom(editor, node, { path: [0, 0], from: 7, to: crossRun ? 3 : 13,
    ...(crossRun ? { endPath: [0, 1] } : {}) }, ' ')).toBe(true);
  release();
  expect(applied).toBeDefined();
  expect(applied!.mapping.map(prefixPosition)).toBe(prefixPosition);
  expect(applied!.mapping.map(suffixPosition)).toBe(suffixPosition - 6 + node.nodeSize + 1);
  const mapped = mapSelection(suffix, before, editor.state.doc, applied!.mapping);
  expect(textPointToPosition(editor.state.doc, mapped.path, mapped.from)).toBe(suffixPosition - 6 + node.nodeSize + 1);
});
it('refuses cross-block or atom-spanning replacements without changing source or selection', () => {
  const { editor, schema } = setup();
  const node = createMentionNode(editor, { id: 'existing', label: 'Existing' })!;
  seed(editor, [schema.node('paragraph', {}, [schema.text('@al'), node, schema.text('ice')]),
    schema.node('paragraph', {}, [schema.text('Elsewhere')])], [0, 0], 3);
  const before = editor.state;
  expect(insertInlineAtom(editor, node, { path: [0, 0], from: 0, to: 3, endPath: [0, 2] })).toBe(false);
  expect(insertInlineAtom(editor, node, { path: [0, 0], from: 0, to: 2, endPath: [1, 0] })).toBe(false);
  expect(editor.state).toBe(before);
});
it('keeps adjacent atom identity and paragraph attributes while accepting a formatted query', () => {
  const { editor, schema } = setup();
  const neighbor = createMentionNode(editor, { id: 'neighbor', label: 'Neighbor' })!;
  seed(editor, [schema.node('paragraph', { align: 'center', alignExplicit: true }, [schema.text('@al'), schema.text('ice ', [schema.mark('em')]), neighbor])], [0, 1], 3);
  expect(insertMention(editor, { id: 'alice', label: 'Alice' }, { path: [0, 0], from: 0, to: 3, endPath: [0, 1] })).toBe(true);
  expect(editor.state.doc.child(0).attrs.align).toBe('center');
  expect(editor.state.doc.child(0).content.at(-1)).toBe(neighbor);
});
it('decorates a cross-run query ending at offset zero in an empty leaf', () => {
  const { editor, schema, service } = setup();
  seed(editor, [schema.node('paragraph', {}, [schema.text('@a', [schema.mark('strong')]), schema.text('')])], [0, 1], 0);
  const decorations = suggestionDecorations(editor.state, service.key);
  expect(decorations).toHaveLength(1);
  expect(decorations[0]).toMatchObject({ from: 1, to: 3 });
});
it('the slash consumer removes the entire formatted query before running its command', async () => {
  const kit = composeExtensions([CoreExtension, HistoryExtension, createSlashCommandExtension()]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins }); editors.push(editor);
  const { schema } = editor.state;
  seed(editor, [schema.node('paragraph', {}, [schema.text('/head', [schema.mark('strong')]), schema.text('ing')])], [0, 1], 3);
  const controller = (kit.services.slashCommands as SlashCommandService).getController(editor);
  await expect.poll(() => controller.getSnapshot().status).toBe('ready');
  const index = controller.getSnapshot().items.findIndex(item => item.id === 'heading-1');
  expect(index).toBeGreaterThanOrEqual(0); expect(controller.accept(index)).toBe(true);
  expect(editor.state.doc.child(0).type.name).toBe('heading');
  expect(editor.getText()).toBe('');
  expect(undo(editor)).toBe(true); expect(editor.getText()).toBe('/heading');
});
it('rebases inline-atom undo and redo over an unrelated non-history insertion', () => {
  const { editor, schema } = setup();
  seed(editor, [schema.node('paragraph', {}, [schema.text('Before @alice after')])], [0, 0], 13);
  expect(insertMention(editor, { id: 'alice', label: 'Alice' }, { path: [0, 0], from: 7, to: 13 })).toBe(true);
  editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Remote ').setMeta('addToHistory', false));
  expect(undo(editor)).toBe(true); expect(editor.getText()).toBe('Remote Before @alice after');
  expect(redo(editor)).toBe(true); expect(editor.getText()).toBe('Remote Before @Alice  after');
});
it('accepts extended mention triggers through schema validation, not just matching', () => {
  const { editor } = setup();
  expect(insertMention(editor, { id: 'proof-42', label: '42]', trigger: '[vulnerability:' })).toBe(true);
  expect(editor.state.doc.child(0).child(0).attrs.trigger).toBe('[vulnerability:');
  expect(editor.getText()).toBe('[vulnerability:42] ');
});
