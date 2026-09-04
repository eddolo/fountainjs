import {
  NodeSelection,
  Plugin,
  PluginKey,
  insertText,
  splitBlock,
  type Attributes,
  type Editor,
  type Node,
  type NodeSpec,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';
import { isSafeURL } from '../core/url';
import { defineExtension, type FountainExtension } from './extension';
import { insertInlineAtom, removeInlineAtomBeforeCursor, type InlineAtomRange } from './inline-atom';
import {
  SuggestionController,
  createSuggestionStateSpec,
  handleSuggestionKeyDown,
  suggestionDecorations,
  type SuggestionItemBase,
  type SuggestionMatch,
  type SuggestionPluginState,
  type SuggestionTrigger,
} from './suggestion';

const HAS_EMOJI = /\p{Extended_Pictographic}/u;
const MAX_NAME = 128;

export interface EmojiAttributes extends Attributes {
  name: string;
  emoji?: string;
  fallbackImage?: string;
}

export interface EmojiItem extends SuggestionItemBase {
  readonly emoji: string;
  readonly shortcodes?: readonly string[];
  readonly tags?: readonly string[];
  readonly group?: string;
  readonly fallbackImage?: string;
}

export interface EmojiItemsContext {
  readonly query: string;
  readonly trigger: string;
  readonly editor: Editor;
  readonly signal: AbortSignal;
  readonly emojis: readonly EmojiItem[];
}

export interface EmojiSuggestionConfig extends SuggestionTrigger {
  readonly items?: (context: EmojiItemsContext) => readonly EmojiItem[] | Promise<readonly EmojiItem[]>;
}

export interface EmojiExtensionOptions {
  readonly emojis?: readonly EmojiItem[];
  readonly suggestion?: EmojiSuggestionConfig;
  readonly enableEmoticons?: boolean;
  readonly forceFallbackImages?: boolean;
  readonly appendSpace?: boolean;
  readonly maximumItems?: number;
  readonly HTMLAttributes?: Readonly<Record<string, string | number | boolean>>;
}

export interface ActiveEmoji {
  readonly path: readonly number[];
  readonly node: Node;
}

export interface EmojiService {
  readonly key: PluginKey<SuggestionPluginState>;
  readonly emojis: readonly EmojiItem[];
  getController(editor: Editor): SuggestionController<EmojiItem>;
  getActive(editor: Editor, path?: readonly number[]): ActiveEmoji | null;
}

const rawDefaultEmojis: readonly Omit<EmojiItem, 'id'>[] = [
  { label: 'grinning face', emoji: '😀', shortcodes: ['grinning', 'smile'], tags: ['happy', 'face'], group: 'Smileys' },
  { label: 'face with tears of joy', emoji: '😂', shortcodes: ['joy'], tags: ['laugh', 'tears'], group: 'Smileys' },
  { label: 'smiling face with heart-eyes', emoji: '😍', shortcodes: ['heart_eyes'], tags: ['love', 'face'], group: 'Smileys' },
  { label: 'thinking face', emoji: '🤔', shortcodes: ['thinking'], tags: ['question', 'hmm'], group: 'Smileys' },
  { label: 'crying face', emoji: '😢', shortcodes: ['cry'], tags: ['sad', 'tear'], group: 'Smileys' },
  { label: 'angry face', emoji: '😠', shortcodes: ['angry'], tags: ['mad', 'face'], group: 'Smileys' },
  { label: 'party face', emoji: '🥳', shortcodes: ['partying_face'], tags: ['celebrate', 'birthday'], group: 'Smileys' },
  { label: 'red heart', emoji: '❤️', shortcodes: ['heart'], tags: ['love'], group: 'Symbols' },
  { label: 'broken heart', emoji: '💔', shortcodes: ['broken_heart'], tags: ['sad', 'love'], group: 'Symbols' },
  { label: 'thumbs up', emoji: '👍', shortcodes: ['+1', 'thumbsup'], tags: ['approve', 'yes'], group: 'People' },
  { label: 'thumbs down', emoji: '👎', shortcodes: ['-1', 'thumbsdown'], tags: ['disapprove', 'no'], group: 'People' },
  { label: 'clapping hands', emoji: '👏', shortcodes: ['clap'], tags: ['applause'], group: 'People' },
  { label: 'folded hands', emoji: '🙏', shortcodes: ['pray'], tags: ['please', 'thanks'], group: 'People' },
  { label: 'eyes', emoji: '👀', shortcodes: ['eyes'], tags: ['look', 'watch'], group: 'People' },
  { label: 'fire', emoji: '🔥', shortcodes: ['fire'], tags: ['hot', 'lit'], group: 'Nature' },
  { label: 'sparkles', emoji: '✨', shortcodes: ['sparkles'], tags: ['stars', 'shine'], group: 'Nature' },
  { label: 'rocket', emoji: '🚀', shortcodes: ['rocket'], tags: ['launch', 'space'], group: 'Travel' },
  { label: 'check mark', emoji: '✅', shortcodes: ['white_check_mark'], tags: ['done', 'yes'], group: 'Symbols' },
  { label: 'cross mark', emoji: '❌', shortcodes: ['x'], tags: ['no', 'wrong'], group: 'Symbols' },
  { label: 'warning', emoji: '⚠️', shortcodes: ['warning'], tags: ['alert'], group: 'Symbols' },
  { label: 'light bulb', emoji: '💡', shortcodes: ['bulb'], tags: ['idea'], group: 'Objects' },
  { label: 'memo', emoji: '📝', shortcodes: ['memo'], tags: ['write', 'note'], group: 'Objects' },
  { label: 'paperclip', emoji: '📎', shortcodes: ['paperclip'], tags: ['attachment'], group: 'Objects' },
  { label: 'globe with meridians', emoji: '🌐', shortcodes: ['globe_with_meridians'], tags: ['web', 'world'], group: 'Travel' },
];

export const defaultEmojis: readonly EmojiItem[] = Object.freeze(rawDefaultEmojis.map((item) => Object.freeze({
  ...item,
  id: item.shortcodes?.[0] ?? item.label.replace(/\s+/g, '_'),
})));

const EMOTICONS: Readonly<Record<string, string>> = Object.freeze({
  ':)': 'grinning',
  ':-)': 'grinning',
  ':D': 'grinning',
  '<3': 'heart',
  ':(': 'cry',
  ':-(': 'cry',
});

function validEmojiItem(item: EmojiItem): boolean {
  return Boolean(item.id.trim())
    && item.id.length <= MAX_NAME
    && Boolean(item.label.trim())
    && item.label.length <= 256
    && (Boolean(item.emoji) || Boolean(item.fallbackImage))
    && (!item.fallbackImage || isSafeURL(item.fallbackImage, { allowDataImage: true }))
    && (item.shortcodes ?? []).every((value) => Boolean(value) && value.length <= MAX_NAME)
    && (item.tags ?? []).every((value) => Boolean(value) && value.length <= MAX_NAME);
}

function normalizeCatalog(items: readonly EmojiItem[]): readonly EmojiItem[] {
  const names = new Set<string>();
  return Object.freeze(items.map((item) => {
    if (!validEmojiItem(item)) throw new TypeError(`Invalid emoji definition: ${item.id || '(unnamed)'}.`);
    const name = item.id.toLowerCase();
    if (names.has(name)) throw new TypeError(`Duplicate emoji name: ${item.id}.`);
    names.add(name);
    return Object.freeze({
      ...item,
      shortcodes: Object.freeze([...(item.shortcodes ?? [item.id])]),
      tags: Object.freeze([...(item.tags ?? [])]),
    });
  }));
}

function normalizeEmojiAttributes(attrs: EmojiAttributes): Required<EmojiAttributes> | null {
  const name = String(attrs.name ?? '').trim();
  const emoji = String(attrs.emoji ?? '');
  const fallbackImage = String(attrs.fallbackImage ?? '').trim();
  if (!name || name.length > MAX_NAME || (!emoji && !fallbackImage)) return null;
  if (fallbackImage && !isSafeURL(fallbackImage, { allowDataImage: true })) return null;
  return { name, emoji, fallbackImage };
}

function emojiNodeSpec(options: EmojiExtensionOptions): NodeSpec {
  const htmlAttributes = Object.freeze({ ...(options.HTMLAttributes ?? {}) });
  return {
    group: 'inline',
    inline: true,
    atom: true,
    attrs: {
      name: { validate: (value) => typeof value === 'string' && Boolean(value.trim()) && value.length <= MAX_NAME },
      emoji: { default: '', validate: (value) => typeof value === 'string' && value.length <= 64 },
      fallbackImage: {
        default: '',
        validate: (value) => typeof value === 'string' && value.length <= 2_048 && (!value || isSafeURL(value, { allowDataImage: true })),
      },
    },
    validate: (node) => Boolean(normalizeEmojiAttributes(node.attrs as EmojiAttributes)),
    toText: (node) => String(node.attrs.emoji || `:${String(node.attrs.name)}:`),
    toDOM: (node) => {
      const name = String(node.attrs.name);
      const emoji = String(node.attrs.emoji);
      const fallbackImage = String(node.attrs.fallbackImage);
      const attrs = {
        ...htmlAttributes,
        'data-fountain-emoji': 'true',
        'data-name': name,
        'data-emoji': emoji,
        'data-fallback-image': fallbackImage,
        role: 'img',
        'aria-label': emoji ? `${String(name).replace(/_/g, ' ')} ${emoji}` : String(name).replace(/_/g, ' '),
      };
      if (fallbackImage && (options.forceFallbackImages || !emoji)) {
        return ['span', attrs, ['img', {
          class: 'fountain-emoji-fallback',
          src: fallbackImage,
          alt: emoji || `:${name}:`,
          draggable: 'false',
        }]];
      }
      return ['span', attrs, emoji || `:${name}:`];
    },
  };
}

export function createEmojiNode(editor: Editor, attrs: EmojiAttributes): Node | null {
  const type = editor.state.schema.nodes.emoji;
  const normalized = normalizeEmojiAttributes(attrs);
  if (!type || !normalized) return null;
  try { return type.create(normalized); }
  catch { return null; }
}

export function insertEmoji(
  editor: Editor,
  attrs: EmojiAttributes,
  range?: InlineAtomRange,
  appendSpace = false,
): boolean {
  const node = createEmojiNode(editor, attrs);
  return node ? insertInlineAtom(editor, node, range, appendSpace ? ' ' : '') : false;
}

export function getActiveEmoji(editor: Editor, path?: readonly number[]): ActiveEmoji | null {
  const targetPath = path ?? (editor.state.selection instanceof NodeSelection ? editor.state.selection.nodePath : null);
  if (!targetPath) return null;
  try {
    const node = getNodeAtPath(editor.state.doc, targetPath);
    return node.type.name === 'emoji' ? { path: Object.freeze([...targetPath]), node } : null;
  } catch { return null; }
}

export function deleteEmoji(editor: Editor, path?: readonly number[]): boolean {
  if (!editor.editable) return false;
  const active = getActiveEmoji(editor, path);
  if (!active) return false;
  try {
    const transaction = editor.state.createTransaction().replaceNode(active.path, []);
    editor.state.schema.validate(transaction.doc);
    return editor.dispatch(transaction);
  } catch { return false; }
}

function unicodeName(value: string): string {
  return `unicode-${Array.from(value).map((character) => character.codePointAt(0)?.toString(16)).join('-')}`;
}

function graphemes(value: string): readonly string[] {
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), (part) => part.segment);
  }
  return Array.from(value);
}

function itemForUnicode(catalog: readonly EmojiItem[], value: string): EmojiItem {
  return catalog.find((item) => item.emoji === value) ?? {
    id: unicodeName(value),
    label: 'emoji',
    emoji: value,
  };
}

/** Inserts mixed text/newlines/emoji while preserving every emoji as a portable atom. */
export function insertEmojiText(editor: Editor, value: string, catalog: readonly EmojiItem[] = defaultEmojis): boolean {
  if (!editor.editable || !HAS_EMOJI.test(value)) return false;
  return editor.runCommandBatch(() => {
    let pending = '';
    const flush = (): boolean => {
      if (!pending) return true;
      const text = pending;
      pending = '';
      return insertText(editor, text);
    };
    for (const segment of graphemes(value.replace(/\r\n?/g, '\n'))) {
      if (segment === '\n') {
        if (!flush() || !splitBlock(editor)) return false;
      } else if (HAS_EMOJI.test(segment)) {
        if (!flush()) return false;
        const item = itemForUnicode(catalog, segment);
        if (!insertEmoji(editor, { name: item.id, emoji: segment, fallbackImage: item.fallbackImage ?? '' })) return false;
      } else pending += segment;
    }
    return flush();
  });
}

function findShortcode(catalog: readonly EmojiItem[], shortcode: string): EmojiItem | undefined {
  const query = shortcode.toLowerCase();
  return catalog.find((item) => item.id.toLowerCase() === query
    || item.shortcodes?.some((candidate) => candidate.toLowerCase() === query));
}

function searchCatalog(catalog: readonly EmojiItem[], query: string): readonly EmojiItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return catalog;
  return catalog.filter((item) => [item.id, item.label, ...(item.shortcodes ?? []), ...(item.tags ?? [])]
    .some((value) => value.toLowerCase().includes(normalized)));
}

function shortcodeBeforeInput(editor: Editor, input: string, catalog: readonly EmojiItem[]): { item: EmojiItem; range: InlineAtomRange } | null {
  if (input !== ':' || editor.state.selection.kind !== 'text' || !editor.state.selection.isCollapsed) return null;
  const selection = editor.state.selection;
  let target: Node;
  try { target = getNodeAtPath(editor.state.doc, selection.path); }
  catch { return null; }
  const source = (target.text ?? '').slice(0, selection.from);
  const match = /(?:^|[\s([{]):([\w+-]{1,128})$/u.exec(source);
  if (!match) return null;
  const item = findShortcode(catalog, match[1] as string);
  if (!item) return null;
  const from = selection.from - (match[1] as string).length - 1;
  return { item, range: { path: selection.path, from, to: selection.from } };
}

function emoticonBeforeInput(editor: Editor, input: string, catalog: readonly EmojiItem[]): { item: EmojiItem; range: InlineAtomRange } | null {
  if (editor.state.selection.kind !== 'text' || !editor.state.selection.isCollapsed) return null;
  const selection = editor.state.selection;
  let target: Node;
  try { target = getNodeAtPath(editor.state.doc, selection.path); }
  catch { return null; }
  const throughInput = `${(target.text ?? '').slice(0, selection.from)}${input}`;
  const symbol = Object.keys(EMOTICONS).sort((a, b) => b.length - a.length)
    .find((candidate) => throughInput.endsWith(candidate));
  if (!symbol) return null;
  const item = findShortcode(catalog, EMOTICONS[symbol] as string);
  if (!item) return null;
  return {
    item,
    range: { path: selection.path, from: throughInput.length - symbol.length, to: selection.from },
  };
}

function emojiBeforeCursor(editor: Editor): Node | null {
  const selection = editor.state.selection;
  if (selection.kind !== 'text' || !selection.isCollapsed || selection.from !== 0) return null;
  const index = selection.path.at(-1);
  if (index === undefined || index < 1) return null;
  try {
    const node = getNodeAtPath(editor.state.doc, [...selection.path.slice(0, -1), index - 1]);
    return node.type.name === 'emoji' ? node : null;
  } catch { return null; }
}

function createEmojiExtensionWithKey(
  options: EmojiExtensionOptions,
  key: PluginKey<SuggestionPluginState>,
): FountainExtension {
  const catalog = normalizeCatalog(options.emojis ?? defaultEmojis);
  const suggestion = Object.freeze({ char: ':', ...(options.suggestion ?? {}) });
  const controllers = new WeakMap<Editor, SuggestionController<EmojiItem>>();

  const getController = (editor: Editor): SuggestionController<EmojiItem> => {
    const existing = controllers.get(editor);
    if (existing) return existing;
    const controller = new SuggestionController<EmojiItem>(
      editor,
      key,
      ({ editor: activeEditor, match, signal }) => options.suggestion?.items?.({
        query: match.query,
        trigger: match.trigger,
        editor: activeEditor,
        signal,
        emojis: catalog,
      }) ?? searchCatalog(catalog, match.query),
      (activeEditor, item, match: SuggestionMatch) => insertEmoji(activeEditor, {
        name: item.id,
        emoji: item.emoji,
        fallbackImage: item.fallbackImage ?? '',
      }, match.range, options.appendSpace !== false),
      options.maximumItems ?? 50,
    );
    controllers.set(editor, controller);
    return controller;
  };

  const plugin = new Plugin<SuggestionPluginState>({
    key,
    state: createSuggestionStateSpec([suggestion]),
    props: {
      decorations: (state) => suggestionDecorations(state, key, 'fountain-emoji-query'),
      onCreate: (editor) => { getController(editor); },
      onDestroy: (editor) => {
        controllers.get(editor)?.destroy();
        controllers.delete(editor);
      },
      handleKeyDown: (editor, event) => {
        if (handleSuggestionKeyDown(controllers.get(editor), event)) return true;
        if (event.key !== 'Backspace' || event.ctrlKey || event.metaKey || event.altKey) return false;
        const emoji = emojiBeforeCursor(editor);
        return emoji ? removeInlineAtomBeforeCursor(editor, (node) => node === emoji) : false;
      },
      handleTextInput: (editor, _from, _to, input) => {
        const shortcode = shortcodeBeforeInput(editor, input, catalog);
        if (shortcode) return insertEmoji(editor, {
          name: shortcode.item.id,
          emoji: shortcode.item.emoji,
          fallbackImage: shortcode.item.fallbackImage ?? '',
        }, shortcode.range);
        const emoticon = options.enableEmoticons ? emoticonBeforeInput(editor, input, catalog) : null;
        if (emoticon) return insertEmoji(editor, {
          name: emoticon.item.id,
          emoji: emoticon.item.emoji,
          fallbackImage: emoticon.item.fallbackImage ?? '',
        }, emoticon.range);
        return HAS_EMOJI.test(input) ? insertEmojiText(editor, input, catalog) : false;
      },
      handlePaste: (editor, event) => {
        const text = event.clipboardData?.getData('text/plain') ?? '';
        const html = event.clipboardData?.getData('text/html') ?? '';
        return !html && HAS_EMOJI.test(text) ? insertEmojiText(editor, text, catalog) : false;
      },
    },
  });

  const service: EmojiService = Object.freeze({ key, emojis: catalog, getController, getActive: getActiveEmoji });
  return defineExtension({
    name: 'emoji',
    nodes: { emoji: emojiNodeSpec(options) },
    plugins: [plugin],
    commands: { insertEmoji, insertEmojiText, deleteEmoji },
    services: { emoji: service },
  });
}

export function createEmojiExtension(options: EmojiExtensionOptions = {}): FountainExtension {
  return createEmojiExtensionWithKey(options, new PluginKey<SuggestionPluginState>('emoji-suggestion'));
}

export const emojiSuggestionKey = new PluginKey<SuggestionPluginState>('emoji-suggestion');
export const EmojiExtension = createEmojiExtensionWithKey({}, emojiSuggestionKey);
