/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import {
  CoreExtension,
  HTMLExporter,
  HTMLImporter,
  MarkdownExporter,
  composeExtensions,
  createEditor,
  deleteBackward,
  insertText,
  selectText,
  setContent,
} from '../src';
import {
  CharacterCountExtension,
  EmojiExtension,
  MentionExtension,
  SlashCommandExtension,
  SlashCommandRegistry,
  TypographyExtension,
  createCharacterCountExtension,
  createEmojiExtension,
  createMentionExtension,
  createSlashCommandExtension,
  createTypographyExtension,
  defaultSlashCommandItems,
  filterSlashCommandItems,
  getActiveEmoji,
  getActiveMention,
  insertEmojiText,
  insertMention,
  type CharacterCountService,
  type EmojiService,
  type MentionService,
  type SlashCommandItem,
  type SlashCommandService,
} from '../src/document-utilities';

function kitWith(...extensions: Parameters<typeof composeExtensions>[0]) {
  return composeExtensions([CoreExtension, ...extensions]);
}

function keyboard(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('framework-neutral mention suggestions', () => {
  it('cancels stale async sources, navigates results, inserts portable identity, and restores the trigger', async () => {
    const requests: Array<{
      query: string;
      signal: AbortSignal;
      resolve: (items: readonly { id: string; label: string }[]) => void;
    }> = [];
    const extension = createMentionExtension({
      suggestions: [{
        char: '@',
        items: ({ query, signal }) => new Promise((resolve) => requests.push({ query, signal, resolve })),
      }],
    });
    const kit = kitWith(extension);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const service = kit.services.mentions as MentionService;
    const controller = service.getController(editor);

    expect(insertText(editor, '@a')).toBe(true);
    expect(requests.at(-1)?.query).toBe('a');
    expect(controller.getSnapshot().status).toBe('loading');
    expect(insertText(editor, 'b')).toBe(true);
    expect(requests.at(-1)?.query).toBe('ab');
    expect(requests[0]?.signal.aborted).toBe(true);

    requests[0]?.resolve([{ id: 'stale', label: 'Stale result' }]);
    requests[1]?.resolve([
      { id: 'alice', label: 'Alice' },
      { id: 'abel', label: 'Abel' },
    ]);
    await settle();
    expect(controller.getSnapshot()).toMatchObject({ status: 'ready', selectedIndex: 0 });
    expect(controller.getSnapshot().items.map((item) => item.id)).toEqual(['alice', 'abel']);

    const plugin = extension.plugins?.[0];
    expect(plugin?.spec.props?.handleKeyDown?.(editor, keyboard('ArrowDown'))).toBe(true);
    expect(controller.getSnapshot().selectedIndex).toBe(1);
    expect(plugin?.spec.props?.handleKeyDown?.(editor, keyboard('Enter'))).toBe(true);
    expect(editor.getText()).toBe('@Abel ');
    expect(editor.state.doc.child(0).child(0).toJSON()).toEqual({
      type: 'mention',
      attrs: { id: 'abel', label: 'Abel', trigger: '@', kind: 'mention', href: '' },
    });
    expect(controller.getSnapshot().open).toBe(false);

    expect(deleteBackward(editor)).toBe(true);
    expect(plugin?.spec.props?.handleKeyDown?.(editor, keyboard('Backspace'))).toBe(true);
    expect(editor.getText()).toBe('@');
    editor.destroy();
  });

  it('supports multiple trigger kinds, safe links, metadata updates, and JSON/HTML interchange', () => {
    const extension = createMentionExtension({
      suggestions: [{ char: '@', kind: 'person' }, { char: '#', kind: 'topic' }],
      HTMLAttributes: { class: 'product-mention' },
    });
    const kit = kitWith(extension);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });

    expect(insertMention(editor, {
      id: 'editor-platform', label: 'Editor Platform', trigger: '#', kind: 'topic', href: '/topics/editor-platform',
    })).toBe(true);
    expect(getActiveMention(editor, [0, 0])?.node.attrs.kind).toBe('topic');
    expect(insertMention(editor, { id: 'bad', href: 'javascript:alert(1)' })).toBe(false);

    const html = HTMLExporter.export(editor.state.doc, { document: false });
    expect(html).toContain('class="product-mention"');
    expect(html).toContain('data-fountain-mention="true"');
    expect(html).toContain('href="/topics/editor-platform"');
    const parsed = HTMLImporter.parse(html, editor.state.schema);
    expect(parsed.toJSON()).toEqual(editor.getJSON());
    expect(MarkdownExporter.export(editor.state.doc)).toBe('#Editor Platform');
  });

  it('ships as an independent default extension instead of silently changing StarterKit', () => {
    expect(MentionExtension.name).toBe('mention');
    expect(kitWith(MentionExtension).schema.nodes.mention).toBeDefined();
  });
});

describe('portable emoji nodes and input', () => {
  it('converts typed Unicode, completed shortcodes, emoticons, and pasted multi-line text', () => {
    const extension = createEmojiExtension({ enableEmoticons: true });
    const kit = kitWith(extension);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const plugin = extension.plugins?.[0];

    expect(plugin?.spec.props?.handleTextInput?.(editor, 0, 0, '👩‍💻')).toBe(true);
    expect(editor.state.doc.child(0).child(0).type.name).toBe('emoji');
    expect(editor.getText()).toBe('👩‍💻');

    expect(insertText(editor, ':rocket')).toBe(true);
    expect(plugin?.spec.props?.handleTextInput?.(editor, 7, 7, ':')).toBe(true);
    expect(editor.getText()).toBe('👩‍💻🚀');

    expect(insertText(editor, ' ')).toBe(true);
    expect(insertText(editor, ':')).toBe(true);
    expect(plugin?.spec.props?.handleTextInput?.(editor, editor.state.selection.from, editor.state.selection.to, ')')).toBe(true);
    expect(editor.getText()).toBe('👩‍💻🚀 😀');

    expect(insertEmojiText(editor, ' A😀\nB❤️')).toBe(true);
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.getText()).toContain('A😀\nB❤️');
    expect(editor.getJSON().content?.flatMap((block) => block.content ?? []).filter((node) => node.type === 'emoji').length).toBe(5);
  });

  it('provides searchable/custom suggestions, selection, fallback images, and safe interchange', async () => {
    const extension = createEmojiExtension({
      forceFallbackImages: true,
      emojis: [{
        id: 'octocat', label: 'Octocat', emoji: '', shortcodes: ['octocat'], tags: ['github', 'cat'],
        fallbackImage: 'https://github.githubassets.com/images/icons/emoji/octocat.png',
      }],
    });
    const kit = kitWith(extension);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const service = kit.services.emoji as EmojiService;
    const controller = service.getController(editor);
    expect(insertText(editor, ':git')).toBe(true);
    await settle();
    expect(controller.getSnapshot().items[0]?.id).toBe('octocat');
    expect(controller.accept()).toBe(true);
    const active = getActiveEmoji(editor, [0, 0]);
    expect(active?.node.textContent).toBe(':octocat:');
    expect(() => editor.state.schema.node('emoji', {
      name: 'unsafe', emoji: '', fallbackImage: 'javascript:alert(1)',
    })).toThrow();

    const html = HTMLExporter.export(editor.state.doc, { document: false });
    expect(html).toContain('data-fountain-emoji="true"');
    expect(html).toContain('class="fountain-emoji-fallback"');
    expect(HTMLImporter.parse(html, editor.state.schema).toJSON()).toEqual(editor.getJSON());

    const native = HTMLImporter.parse('<p>Hello 😀!</p>', editor.state.schema);
    expect(native.child(0).content.map((node) => node.type.name)).toEqual(['text', 'emoji', 'text']);
  });

  it('ships a useful default catalog without preventing host-owned complete catalogs', () => {
    expect(EmojiExtension.name).toBe('emoji');
    expect((kitWith(EmojiExtension).services.emoji as EmojiService).emojis.length).toBeGreaterThan(20);
  });
});

describe('configurable typography input rules', () => {
  function transform(source: string, input: string, extension = TypographyExtension): string {
    const kit = kitWith(extension);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    if (source) insertText(editor, source);
    expect(extension.plugins?.[0]?.spec.props?.handleTextInput?.(editor, source.length, source.length, input)).toBe(true);
    return editor.getText();
  }

  it.each([
    ['-', '-', '—'],
    ['..', '.', '…'],
    ['', '"', '“'],
    ['word', '"', 'word”'],
    ['', "'", '‘'],
    ['word', "'", 'word’'],
    ['<', '-', '←'],
    ['-', '>', '→'],
    ['(c', ')', '©'],
    ['(r', ')', '®'],
    ['(tm', ')', '™'],
    ['(sm', ')', '℠'],
    ['1/', '2', '½'],
    ['1/', '4', '¼'],
    ['3/', '4', '¾'],
    ['+/', '-', '±'],
    ['!', '=', '≠'],
    ['<', '<', '«'],
    ['>', '>', '»'],
    ['2x', '3', '2×3'],
    ['^', '2', '²'],
    ['^', '3', '³'],
  ])('transforms %s + %s', (source, input, expected) => {
    expect(transform(source, input)).toBe(expected);
  });

  it('allows individual disabling, output overrides, RTL quotes, and literal undo', () => {
    const configured = createTypographyExtension({ emDash: false, oneHalf: '1 / 2', rtl: true });
    expect(transform('1/', '2', configured)).toBe('1 / 2');
    expect(transform('', '"', configured)).toBe('”');

    const kit = kitWith(configured);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    insertText(editor, '-');
    expect(configured.plugins?.[0]?.spec.props?.handleTextInput?.(editor, 1, 1, '-')).toBe(false);
    expect(editor.getText()).toBe('-');

    const defaults = kitWith(TypographyExtension);
    const undoable = createEditor({ schema: defaults.schema, plugins: defaults.plugins });
    insertText(undoable, '-');
    expect(TypographyExtension.plugins?.[0]?.spec.props?.handleTextInput?.(undoable, 1, 1, '-')).toBe(true);
    expect(TypographyExtension.plugins?.[0]?.spec.props?.handleKeyDown?.(undoable, keyboard('Backspace'))).toBe(true);
    expect(undoable.getText()).toBe('--');
  });
});

describe('enforced character and word counting', () => {
  it('reports counts and rejects transactions that increase content beyond the limit', () => {
    const extension = createCharacterCountExtension({ limit: 5 });
    const kit = kitWith(extension);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const service = kit.services.characterCount as CharacterCountService;

    expect(insertText(editor, 'hello')).toBe(true);
    expect(service.snapshot(editor)).toMatchObject({ characters: 5, words: 1, remaining: 0, overLimit: false });
    expect(insertText(editor, '!')).toBe(false);
    expect(editor.getText()).toBe('hello');
    expect(editor.dispatch(editor.state.createTransaction().replaceText([0, 0], 0, 5, 'longer'))).toBe(false);
  });

  it('trims initial and programmatically replaced content to the largest valid prefix', () => {
    const extension = createCharacterCountExtension({ limit: 3 });
    const kit = kitWith(extension);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abcdef' }] }] },
    });
    expect(editor.getText()).toBe('abc');

    const replacement = editor.state.schema.node('doc', {}, [
      editor.state.schema.node('paragraph', {}, [editor.state.schema.text('uvwxyz')]),
    ]);
    expect(setContent(editor, replacement)).toBe(true);
    expect(editor.getText()).toBe('uvw');
  });

  it('supports over-limit preservation, reductions, node-size mode, and custom grapheme counters', () => {
    const preservedExtension = createCharacterCountExtension({ limit: 3, autoTrim: false });
    const preservedKit = kitWith(preservedExtension);
    const preserved = createEditor({
      schema: preservedKit.schema,
      plugins: preservedKit.plugins,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] },
    });
    const preservedService = preservedKit.services.characterCount as CharacterCountService;
    expect(preservedService.snapshot(preserved).overLimit).toBe(true);
    selectText(preserved, [0, 0], 5);
    expect(deleteBackward(preserved)).toBe(true);
    expect(preserved.getText()).toBe('hell');
    expect(insertText(preserved, '!')).toBe(false);

    const nodeSizeKit = kitWith(createCharacterCountExtension({ mode: 'nodeSize' }));
    const nodeSizeEditor = createEditor({ schema: nodeSizeKit.schema, plugins: nodeSizeKit.plugins });
    expect((nodeSizeKit.services.characterCount as CharacterCountService).snapshot(nodeSizeEditor).characters).toBe(2);

    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const graphemeKit = kitWith(createCharacterCountExtension({
      limit: 1,
      textCounter: (text) => Array.from(segmenter.segment(text)).length,
    }));
    const graphemeEditor = createEditor({ schema: graphemeKit.schema, plugins: graphemeKit.plugins });
    expect(insertText(graphemeEditor, '👩‍💻')).toBe(true);
    expect((graphemeKit.services.characterCount as CharacterCountService).snapshot(graphemeEditor).characters).toBe(1);
  });

  it('publishes the default extension without imposing a limit', () => {
    const kit = kitWith(CharacterCountExtension);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    expect(insertText(editor, 'No implicit product limit')).toBe(true);
    expect((kit.services.characterCount as CharacterCountService).snapshot(editor).limit).toBeNull();
  });
});

describe('headless slash command registry', () => {
  it('filters multi-word aliases, ranks matches, and supports runtime registration', async () => {
    const registry = new SlashCommandRegistry();
    const extension = createSlashCommandExtension({ registry, includeDefaultItems: false });
    const kit = kitWith(extension);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const service = kit.services.slashCommands as SlashCommandService;
    const controller = service.getController(editor);
    const unregister = registry.registerItems('product-blocks', [
      {
        id: 'callout', label: 'Callout', description: 'Insert a product notice.',
        aliases: ['notice box'], group: 'Product', run: () => true,
      },
      {
        id: 'code-review', label: 'Code review', description: 'Review source changes.',
        aliases: ['inspect patch'], group: 'Product', priority: 10, run: () => true,
      },
    ]);

    expect(filterSlashCommandItems(defaultSlashCommandItems(), 'numbered').map((item) => item.id)).toEqual(['ordered-list']);
    expect(filterSlashCommandItems(defaultSlashCommandItems(), 'horizontal sep').map((item) => item.id)).toEqual(['divider']);
    expect(insertText(editor, '/notice')).toBe(true);
    await settle();
    expect(controller.getSnapshot().items.map((item) => item.id)).toEqual(['callout']);

    registry.registerItems('live-module', [{
      id: 'notice-inline', label: 'Inline notice', aliases: ['notice'], group: 'Product', run: () => true,
    }]);
    await settle();
    expect(controller.getSnapshot().items.map((item) => item.id)).toEqual(['notice-inline', 'callout']);
    unregister();
    await settle();
    expect(controller.getSnapshot().items.map((item) => item.id)).toEqual(['notice-inline']);
    expect(() => registry.registerItems('live-module', [])).toThrow('Duplicate slash command source');
    editor.destroy();
  });

  it('aborts stale async sources and rolls back a command that refuses to run', async () => {
    const requests: Array<{
      query: string;
      signal: AbortSignal;
      resolve: (items: readonly SlashCommandItem[]) => void;
    }> = [];
    const extension = createSlashCommandExtension({
      includeDefaultItems: false,
      sources: [{
        id: 'remote',
        source: ({ query, signal }) => new Promise((resolve) => requests.push({ query, signal, resolve })),
      }],
    });
    const kit = kitWith(extension);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const controller = (kit.services.slashCommands as SlashCommandService).getController(editor);

    insertText(editor, '/a');
    insertText(editor, 'b');
    expect(requests.map((request) => request.query)).toEqual(['a', 'ab']);
    expect(requests[0]?.signal.aborted).toBe(true);
    requests[0]?.resolve([{ id: 'stale', label: 'Stale', run: () => true }]);
    requests[1]?.resolve([{ id: 'abort', label: 'Abort action', aliases: ['ab'], run: () => false }]);
    await settle();
    expect(controller.getSnapshot().items.map((item) => item.id)).toEqual(['abort']);
    expect(controller.accept()).toBe(false);
    expect(editor.getText()).toBe('/ab');
    expect(extension.plugins?.[0]?.spec.props?.handleKeyDown?.(editor, keyboard('Tab'))).toBe(true);
    expect(controller.getSnapshot().open).toBe(false);
    expect(editor.getText()).toBe('/ab');
    editor.destroy();
  });

  it('rejects malformed and colliding runtime contributions', async () => {
    const kit = kitWith();
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const context = {
      editor,
      query: '',
      signal: new AbortController().signal,
      match: {
        trigger: '/', query: '', text: '/',
        range: { path: [0, 0], from: 0, to: 1 },
      },
    } as const;
    const malformed = new SlashCommandRegistry();
    malformed.registerItems('malformed', [{
      id: 'bad', label: 'Bad', aliases: 'not-an-array' as unknown as readonly string[], run: () => true,
    }]);
    await expect(malformed.getItems(context)).rejects.toThrow('returned an invalid item');

    const colliding = new SlashCommandRegistry();
    colliding.registerItems('one', [{ id: 'same', label: 'One', run: () => true }]);
    colliding.registerItems('two', [{ id: 'same', label: 'Two', run: () => true }]);
    await expect(colliding.getItems(context)).rejects.toThrow('Duplicate slash command item: same');
    editor.destroy();
  });

  it.each([
    ['heading 2', 'heading', 1],
    ['bullet', 'bullet_list', 1],
    ['quote', 'blockquote', 1],
    ['divider', 'horizontal_rule', 2],
    ['table', 'table', 2],
  ])('runs the default %s command atomically', async (query, expectedType, expectedBlocks) => {
    const kit = kitWith(createSlashCommandExtension());
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const service = kit.services.slashCommands as SlashCommandService;
    const controller = service.getController(editor);
    insertText(editor, `/${query}`);
    await settle();
    expect(controller.getSnapshot().items).toHaveLength(1);
    expect(controller.accept()).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe(expectedType);
    expect(editor.state.doc.childCount).toBe(expectedBlocks);
    expect(editor.getText()).not.toContain('/');
    editor.destroy();
  });

  it('ships independently from StarterKit', () => {
    expect(SlashCommandExtension.name).toBe('slash-command');
    expect(defaultSlashCommandItems().map((item) => item.id)).toHaveLength(11);
  });
});
