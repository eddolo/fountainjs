import { expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import data from '../integrations/gitlab/fixtures/handoff-methods.json';

const rich = 'contentEditor', markdown = 'markdownField';
it('binds the selected-method fixture to the actual reviewable upstream patch', () => {
  const patch = readFileSync(new URL('../integrations/gitlab/patches/0001-guard-markdown-handoff.patch', import.meta.url));
  expect(createHash('sha256').update(patch).digest('hex')).toBe(data.patchSHA256);
});
function selected(kind: string): (this: any, ...args: any[]) => any {
  const file = data.files.find(file => file.kind === kind)!;
  if (!file.code) throw new Error(`The actual GitLab ${file.method} method is missing.`);
  return new Function('EDITING_MODE_CONTENT_EDITOR', 'EDITING_MODE_MARKDOWN_FIELD', 's__',
    `return ({ ${file.code} }).${file.method};`)(rich, markdown, (text: string) => text.split('|').slice(1).join('|'));
}
function host(read: () => unknown = () => 'Latest rich text') {
  const events: string[] = [];
  const context = { editingMode: rich, isContentEditorActive: true, markdown: 'Old debounced value', alert: null as any,
    beforeContentEditor: undefined as undefined | ((source: string) => Promise<boolean>),
    $refs: { contentEditor: { getSerializedContentForHandoff: read } },
    updateMarkdownFromContentEditor({ markdown: source }: { markdown: string }) { this.markdown = source; events.push('publish:' + source); },
    notifyEditingModeChange: vi.fn((mode: string) => events.push('mode:' + mode)),
  };
  return { context, events };
}

it('flushes the current rich document before switching instead of trusting a delayed parent value', async () => {
  const { context, events } = host();
  await selected('host').call(context, markdown);
  expect(context.markdown).toBe('Latest rich text');
  expect(context.editingMode).toBe(markdown);
  expect(events).toEqual(['publish:Latest rich text', 'mode:' + markdown]);
});

it.each(['throws', 'missing component', 'non-string'])('retains the mounted document and draft when handoff %s', async failure => {
  const { context, events } = host(() => { if (failure === 'throws') throw new Error('Conversion refused'); return undefined; });
  if (failure === 'missing component') context.$refs.contentEditor = undefined as any;
  await selected('host').call(context, markdown);
  expect(context.markdown).toBe('Old debounced value');
  expect(context.editingMode).toBe(rich);
  expect(events).toEqual([]);
  expect(context.alert?.variant).toBe('danger');
});

it('hands off an empty current document without restoring older content', async () => {
  const { context } = host(() => '');
  await selected('host').call(context, markdown);
  expect(context.markdown).toBe('');
  expect(context.editingMode).toBe(markdown);
});

it('recovers after a refused handoff without keeping the old error or old draft', async () => {
  let refuse = true;
  const { context } = host(() => { if (refuse) throw new Error('Conversion refused'); return 'Recovered source'; });
  const changeMode = selected('host');
  await changeMode.call(context, markdown);
  expect(context.alert?.handoffError).toBe(true);
  refuse = false;
  await changeMode.call(context, markdown);
  expect(context.editingMode).toBe(markdown);
  expect(context.markdown).toBe('Recovered source');
  expect(context.alert).toBe(null);
});

it('retains the existing asynchronous parent gate for entering rich text', async () => {
  const { context, events } = host();
  context.editingMode = markdown; context.isContentEditorActive = false;
  context.beforeContentEditor = vi.fn(async () => false);
  await selected('host').call(context, rich);
  expect(context.beforeContentEditor).toHaveBeenCalledWith('Old debounced value');
  expect(context.editingMode).toBe(markdown); expect(events).toEqual([]);
});

it.each([{ loading: true, composing: false }, { loading: false, composing: true }])(
  'refuses reading before the actual rich component settles: %j', ({ loading, composing }) => {
    const read = vi.fn(() => 'Current');
    expect(() => selected('component').call({ isLoading: loading,
      contentEditor: { tiptapEditor: { view: { composing } }, getSerializedContent: read } })).toThrow();
    expect(read).not.toHaveBeenCalled();
  },
);

it('reads the actual component serializer and propagates a conversion refusal', () => {
  const context = { isLoading: false, contentEditor: { tiptapEditor: { view: { composing: false } },
    getSerializedContent: vi.fn(() => 'Current') } };
  expect(selected('component').call(context)).toBe('Current');
  context.contentEditor.getSerializedContent.mockImplementation(() => { throw new Error('Cannot retain source'); });
  expect(() => selected('component').call(context)).toThrow('Cannot retain source');
});

it('refuses an unapplied Markdown replacement after its loading error', () => {
  const read = vi.fn(() => 'Old document');
  expect(() => selected('component').call({ isLoading: false, markdown: 'New source', latestMarkdown: 'Old source',
    contentEditor: { tiptapEditor: { view: { composing: false } }, getSerializedContent: read } })).toThrow();
  expect(read).not.toHaveBeenCalled();
});

it('reads collaborative state rather than relying on a lagging Markdown prop', () => {
  const read = vi.fn(() => 'Shared current source');
  expect(selected('component').call({ isLoading: false, collaborationProvider: {}, markdown: 'Old prop', latestMarkdown: 'New local',
    contentEditor: { tiptapEditor: { view: { composing: false } }, getSerializedContent: read } })).toBe('Shared current source');
});

it.each([false, true])('uses the same current-document guard for a restored Markdown preference (refuse: %j)', async refuse => {
  const { context } = host(() => { if (refuse) throw new Error('Not ready'); return 'Current restored-mode source'; });
  const state = Object.assign(context, { isDefaultEditorEnabled: true,
    onEditingModeChange(mode: string) { return selected('host').call(this, mode); } });
  await selected('restored').call(state, markdown);
  expect(state.editingMode).toBe(refuse ? rich : markdown);
  expect(state.markdown).toBe(refuse ? 'Old debounced value' : 'Current restored-mode source');
});
