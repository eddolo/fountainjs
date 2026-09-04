import {
  NodeSelection,
  Plugin,
  PluginKey,
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

const shortString = (value: unknown, maximum = 256): boolean => typeof value === 'string' && value.length <= maximum;
const requiredString = (value: unknown): boolean => shortString(value) && Boolean(String(value).trim());

export interface MentionAttributes extends Attributes {
  id: string;
  label?: string;
  trigger?: string;
  kind?: string;
  href?: string;
}

export interface MentionItem extends SuggestionItemBase {
  readonly kind?: string;
  readonly href?: string;
}

export interface MentionItemsContext {
  readonly query: string;
  readonly trigger: string;
  readonly editor: Editor;
  readonly signal: AbortSignal;
}

export interface MentionSuggestionConfig extends SuggestionTrigger {
  readonly kind?: string;
  readonly items?: (context: MentionItemsContext) => readonly MentionItem[] | Promise<readonly MentionItem[]>;
}

export interface MentionRenderContext {
  readonly id: string;
  readonly label: string;
  readonly trigger: string;
  readonly kind: string;
}

export interface MentionExtensionOptions {
  readonly suggestions?: readonly MentionSuggestionConfig[];
  readonly appendSpace?: boolean;
  /** When false, Backspace converts a mention back to its trigger. */
  readonly deleteTriggerWithBackspace?: boolean;
  readonly HTMLAttributes?: Readonly<Record<string, string | number | boolean>>;
  readonly renderText?: (context: MentionRenderContext) => string;
  readonly maximumItems?: number;
}

export interface ActiveMention {
  readonly path: readonly number[];
  readonly node: Node;
}

export interface MentionService {
  readonly key: PluginKey<SuggestionPluginState>;
  getController(editor: Editor): SuggestionController<MentionItem>;
  getActive(editor: Editor, path?: readonly number[]): ActiveMention | null;
}

function normalizedMention(attrs: MentionAttributes): Required<Pick<MentionAttributes, 'id' | 'label' | 'trigger' | 'kind' | 'href'>> | null {
  const id = String(attrs.id ?? '').trim();
  const label = String(attrs.label ?? '').trim();
  const trigger = String(attrs.trigger ?? '@');
  const kind = String(attrs.kind ?? 'mention').trim();
  const href = String(attrs.href ?? '').trim();
  if (!id || id.length > 256 || label.length > 256 || !trigger || trigger.length > 8 || /\s/.test(trigger)) return null;
  if (!kind || kind.length > 64 || (href && !isSafeURL(href))) return null;
  return { id, label, trigger, kind, href };
}

function defaultMentionText(context: MentionRenderContext): string {
  return `${context.trigger}${context.label || context.id}`;
}

function mentionNodeSpec(options: MentionExtensionOptions): NodeSpec {
  const renderText = options.renderText ?? defaultMentionText;
  const htmlAttributes = Object.freeze({ ...(options.HTMLAttributes ?? {}) });
  const context = (node: Node): MentionRenderContext => ({
    id: String(node.attrs.id),
    label: String(node.attrs.label),
    trigger: String(node.attrs.trigger),
    kind: String(node.attrs.kind),
  });
  return {
    group: 'inline',
    inline: true,
    atom: true,
    attrs: {
      id: { validate: requiredString },
      label: { default: '', validate: (value) => shortString(value) },
      trigger: { default: '@', validate: (value) => requiredString(value) && String(value).length <= 8 && !/\s/.test(String(value)) },
      kind: { default: 'mention', validate: (value) => requiredString(value) && String(value).length <= 64 },
      href: { default: '', validate: (value) => shortString(value, 2_048) && (!value || isSafeURL(value)) },
    },
    validate: (node) => Boolean(normalizedMention(node.attrs as MentionAttributes)),
    toText: (node) => renderText(context(node)),
    toDOM: (node) => {
      const value = context(node);
      const text = renderText(value);
      const href = String(node.attrs.href ?? '');
      const attrs = {
        ...htmlAttributes,
        'data-fountain-mention': 'true',
        'data-id': value.id,
        'data-label': value.label,
        'data-trigger': value.trigger,
        'data-kind': value.kind,
        'aria-label': text,
      };
      return href
        ? ['a', { ...attrs, href, rel: 'noopener noreferrer' }, text]
        : ['span', attrs, text];
    },
  };
}

export function createMentionNode(editor: Editor, attrs: MentionAttributes): Node | null {
  const type = editor.state.schema.nodes.mention;
  const normalized = normalizedMention(attrs);
  if (!type || !normalized) return null;
  try { return type.create(normalized); }
  catch { return null; }
}

export function insertMention(
  editor: Editor,
  attrs: MentionAttributes,
  range?: InlineAtomRange,
  appendSpace = true,
): boolean {
  const node = createMentionNode(editor, attrs);
  return node ? insertInlineAtom(editor, node, range, appendSpace ? ' ' : '') : false;
}

export function getActiveMention(editor: Editor, path?: readonly number[]): ActiveMention | null {
  const targetPath = path ?? (editor.state.selection instanceof NodeSelection ? editor.state.selection.nodePath : null);
  if (!targetPath) return null;
  try {
    const node = getNodeAtPath(editor.state.doc, targetPath);
    return node.type.name === 'mention' ? { path: Object.freeze([...targetPath]), node } : null;
  } catch { return null; }
}

export function setMentionAttributes(
  editor: Editor,
  attrs: Partial<MentionAttributes>,
  path?: readonly number[],
): boolean {
  if (!editor.editable) return false;
  const active = getActiveMention(editor, path);
  if (!active) return false;
  const normalized = normalizedMention({ ...active.node.attrs, ...attrs } as MentionAttributes);
  if (!normalized) return false;
  try {
    const transaction = editor.state.createTransaction().setNodeAttrs(active.path, normalized);
    transaction.setSelection(new NodeSelection(transaction.doc, active.path));
    return editor.dispatch(transaction);
  } catch { return false; }
}

export function deleteMention(editor: Editor, path?: readonly number[]): boolean {
  if (!editor.editable) return false;
  const active = getActiveMention(editor, path);
  if (!active) return false;
  try {
    const transaction = editor.state.createTransaction().replaceNode(active.path, []);
    editor.state.schema.validate(transaction.doc);
    return editor.dispatch(transaction);
  } catch { return false; }
}

function mentionBeforeCursor(editor: Editor): Node | null {
  const selection = editor.state.selection;
  if (selection.kind !== 'text' || !selection.isCollapsed || selection.from !== 0) return null;
  const index = selection.path.at(-1);
  if (index === undefined || index < 1) return null;
  try {
    const node = getNodeAtPath(editor.state.doc, [...selection.path.slice(0, -1), index - 1]);
    return node.type.name === 'mention' ? node : null;
  } catch { return null; }
}

function configFor(configs: readonly MentionSuggestionConfig[], match: SuggestionMatch): MentionSuggestionConfig | undefined {
  return configs.find((config) => config.char === match.trigger);
}

function createMentionExtensionWithKey(
  options: MentionExtensionOptions,
  key: PluginKey<SuggestionPluginState>,
): FountainExtension {
  const suggestions = Object.freeze([...(options.suggestions ?? [{ char: '@' }])].map((config) => Object.freeze({ ...config })));
  if (!suggestions.length) throw new TypeError('MentionExtension requires at least one suggestion trigger.');
  if (new Set(suggestions.map((config) => config.char)).size !== suggestions.length) {
    throw new TypeError('MentionExtension suggestion triggers must be unique.');
  }
  const controllers = new WeakMap<Editor, SuggestionController<MentionItem>>();
  const maximumItems = options.maximumItems ?? 50;

  const getController = (editor: Editor): SuggestionController<MentionItem> => {
    const existing = controllers.get(editor);
    if (existing) return existing;
    const controller = new SuggestionController<MentionItem>(
      editor,
      key,
      ({ editor: activeEditor, match, signal }) => {
        const config = configFor(suggestions, match);
        return config?.items?.({ query: match.query, trigger: match.trigger, editor: activeEditor, signal }) ?? [];
      },
      (activeEditor, item, match) => {
        const config = configFor(suggestions, match);
        return insertMention(activeEditor, {
          id: item.id,
          label: item.label,
          trigger: match.trigger,
          kind: item.kind ?? config?.kind ?? 'mention',
          href: item.href ?? '',
        }, match.range, options.appendSpace !== false);
      },
      maximumItems,
    );
    controllers.set(editor, controller);
    return controller;
  };

  const plugin = new Plugin<SuggestionPluginState>({
    key,
    state: createSuggestionStateSpec(suggestions),
    props: {
      decorations: (state) => suggestionDecorations(state, key, 'fountain-mention-query'),
      onCreate: (editor) => { getController(editor); },
      onDestroy: (editor) => {
        controllers.get(editor)?.destroy();
        controllers.delete(editor);
      },
      handleKeyDown: (editor, event) => {
        if (handleSuggestionKeyDown(controllers.get(editor), event)) return true;
        if (event.key !== 'Backspace' || event.ctrlKey || event.metaKey || event.altKey) return false;
        const mention = mentionBeforeCursor(editor);
        if (!mention) return false;
        const replacement = options.deleteTriggerWithBackspace ? '' : String(mention.attrs.trigger ?? '@');
        return removeInlineAtomBeforeCursor(editor, (node) => node === mention, replacement);
      },
    },
  });

  const service: MentionService = Object.freeze({
    key,
    getController,
    getActive: getActiveMention,
  });

  return defineExtension({
    name: 'mention',
    nodes: { mention: mentionNodeSpec(options) },
    plugins: [plugin],
    commands: { insertMention, setMentionAttributes, deleteMention },
    services: { mentions: service },
  });
}

export function createMentionExtension(options: MentionExtensionOptions = {}): FountainExtension {
  return createMentionExtensionWithKey(options, new PluginKey<SuggestionPluginState>('mention-suggestion'));
}

export const mentionSuggestionKey = new PluginKey<SuggestionPluginState>('mention-suggestion');
export const MentionExtension = createMentionExtensionWithKey({}, mentionSuggestionKey);
