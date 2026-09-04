import {
  Plugin,
  PluginKey,
  Selection,
  type Editor,
  type Node,
} from '../core';
import { setBlockType } from '../core/commands';
import { getNodeAtPath } from '../core/transaction/path';
import { toggleList } from '../core/structure-commands';
import { defineExtension, type FountainExtension } from './extension';
import {
  SuggestionController,
  createSuggestionStateSpec,
  handleSuggestionKeyDown,
  suggestionDecorations,
  type SuggestionItemBase,
  type SuggestionMatch,
  type SuggestionPluginState,
} from './suggestion';

export interface SlashCommandExecutionContext {
  readonly editor: Editor;
  readonly match: SuggestionMatch;
}

export interface SlashCommandItem extends SuggestionItemBase {
  readonly description?: string;
  readonly group?: string;
  readonly aliases?: readonly string[];
  readonly icon?: string;
  readonly priority?: number;
  readonly isAvailable?: (editor: Editor) => boolean;
  readonly run: (context: SlashCommandExecutionContext) => boolean;
}

export interface SlashCommandSourceContext {
  readonly editor: Editor;
  readonly match: SuggestionMatch;
  readonly query: string;
  readonly signal: AbortSignal;
}

export type SlashCommandSource = (
  context: SlashCommandSourceContext,
) => readonly SlashCommandItem[] | Promise<readonly SlashCommandItem[]>;

export interface SlashCommandRegistration {
  readonly id: string;
  readonly source: SlashCommandSource;
}

export interface SlashCommandExtensionOptions {
  readonly trigger?: string;
  readonly startOfLine?: boolean;
  readonly allowSpaces?: boolean;
  readonly allowedPrefixes?: readonly string[] | null;
  readonly maximumItems?: number;
  readonly includeDefaultItems?: boolean;
  readonly items?: readonly SlashCommandItem[];
  readonly sources?: readonly SlashCommandRegistration[];
  readonly registry?: SlashCommandRegistry;
}

export interface SlashCommandService {
  readonly key: PluginKey<SuggestionPluginState>;
  readonly registry: SlashCommandRegistry;
  getController(editor: Editor): SuggestionController<SlashCommandItem>;
}

function normalizedSearch(value: string): string {
  return value.toLocaleLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function searchScore(item: SlashCommandItem, query: string): number | null {
  const normalized = normalizedSearch(query);
  if (!normalized) return 0;
  const label = normalizedSearch(item.label);
  const aliases = (item.aliases ?? []).map(normalizedSearch);
  const fields = [label, normalizedSearch(item.id), ...aliases];
  const haystack = normalizedSearch([
    item.label,
    item.id,
    item.description ?? '',
    item.group ?? '',
    ...(item.aliases ?? []),
  ].join(' '));
  if (!normalized.split(' ').every((part) => haystack.includes(part))) return null;
  if (fields.includes(normalized)) return 0;
  if (fields.some((field) => field.startsWith(normalized))) return 1;
  if (fields.some((field) => field.split(' ').some((word) => word.startsWith(normalized)))) return 2;
  return 3;
}

/** Filters and stably ranks slash items without coupling the registry to a UI. */
export function filterSlashCommandItems(
  items: readonly SlashCommandItem[],
  query: string,
  editor?: Editor,
): readonly SlashCommandItem[] {
  return Object.freeze(items.flatMap((item, index) => {
    if (item.isAvailable && editor && !item.isAvailable(editor)) return [];
    const score = searchScore(item, query);
    return score === null ? [] : [{ item, index, score }];
  }).sort((left, right) => (
    left.score - right.score
    || (right.item.priority ?? 0) - (left.item.priority ?? 0)
    || left.index - right.index
  )).map(({ item }) => item));
}

/**
 * Runtime registry for product and extension-owned slash command sources.
 * Registering or removing a source invalidates any currently open menu.
 */
export class SlashCommandRegistry {
  private readonly sources = new Map<string, SlashCommandSource>();
  private readonly listeners = new Set<() => void>();

  constructor(registrations: readonly SlashCommandRegistration[] = []) {
    registrations.forEach(({ id, source }) => { this.register(id, source); });
  }

  register(id: string, source: SlashCommandSource): () => void {
    const normalized = id.trim();
    if (!normalized) throw new TypeError('Slash command sources require a non-empty id.');
    if (typeof source !== 'function') throw new TypeError(`Slash command source ${normalized} must be a function.`);
    if (this.sources.has(normalized)) throw new Error(`Duplicate slash command source: ${normalized}`);
    this.sources.set(normalized, source);
    this.notify();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.sources.delete(normalized);
      this.notify();
    };
  }

  registerItems(id: string, items: readonly SlashCommandItem[]): () => void {
    const frozen = Object.freeze(items.map((item) => Object.freeze({
      ...item,
      ...(Array.isArray(item?.aliases) ? { aliases: Object.freeze([...item.aliases]) } : {}),
    })));
    return this.register(id, () => frozen);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async getItems(context: SlashCommandSourceContext): Promise<readonly SlashCommandItem[]> {
    const groups = await Promise.all([...this.sources.entries()].map(async ([sourceId, source]) => {
      const items = await source(context);
      if (!Array.isArray(items)) throw new TypeError(`Slash command source ${sourceId} must return an array.`);
      return items.map((item) => ({ item, sourceId }));
    }));
    if (context.signal.aborted) throw new DOMException('The slash command request was aborted.', 'AbortError');
    const ids = new Set<string>();
    const items = groups.flat().map(({ item, sourceId }) => {
      const id = typeof item?.id === 'string' ? item.id.trim() : '';
      const label = typeof item?.label === 'string' ? item.label.trim() : '';
      const aliases = item && Array.isArray(item.aliases) && item.aliases.every((alias: unknown) => typeof alias === 'string')
        ? item.aliases.map((alias: string) => alias.trim()).filter(Boolean)
        : item?.aliases === undefined ? [] : null;
      if (!id || !label || typeof item?.run !== 'function' || !aliases
        || (item.description !== undefined && typeof item.description !== 'string')
        || (item.group !== undefined && typeof item.group !== 'string')
        || (item.icon !== undefined && typeof item.icon !== 'string')
        || (item.priority !== undefined && !Number.isFinite(item.priority))
        || (item.disabled !== undefined && typeof item.disabled !== 'boolean')
        || (item.isAvailable !== undefined && typeof item.isAvailable !== 'function')) {
        throw new TypeError(`Slash command source ${sourceId} returned an invalid item.`);
      }
      if (ids.has(id)) throw new Error(`Duplicate slash command item: ${id}`);
      ids.add(id);
      return Object.freeze({
        ...item,
        id,
        label,
        aliases: Object.freeze(aliases),
      });
    });
    return filterSlashCommandItems(items, context.query, context.editor);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

function textBlockItem(
  id: string,
  label: string,
  icon: string,
  typeName: string,
  attrs: Readonly<Record<string, unknown>> = {},
  group = 'Text',
): SlashCommandItem {
  return Object.freeze({
    id, label, icon, group,
    description: typeName === 'paragraph' ? 'Write ordinary body text.' : `Turn this block into ${label.toLocaleLowerCase()}.`,
    aliases: Object.freeze(typeName === 'paragraph' ? ['text', 'body'] : ['title']),
    isAvailable: (editor: Editor) => Boolean(editor.state.schema.nodes[typeName]),
    run: ({ editor }: SlashCommandExecutionContext) => setBlockType(editor, typeName, attrs),
  });
}

function replaceEmptyBlock(
  editor: Editor,
  create: (editor: Editor) => { nodes: readonly Node[]; selectionPath: readonly number[] },
): boolean {
  const selection = editor.state.selection;
  if (!(selection instanceof Selection) || !selection.isCollapsed || !selection.isSingleText) return false;
  const blockPath = selection.path.slice(0, -1);
  if (blockPath.length !== 1) return false;
  let block: Node;
  try { block = getNodeAtPath(editor.state.doc, blockPath); }
  catch { return false; }
  if (block.textContent) return false;
  try {
    const { nodes, selectionPath } = create(editor);
    const transaction = editor.state.createTransaction()
      .replaceNode(blockPath, nodes)
      .setSelection(Selection.cursor(selectionPath, 0));
    editor.state.schema.validate(transaction.doc);
    return editor.dispatch(transaction);
  } catch { return false; }
}

/** Default commands are ordinary registry entries and can be omitted or replaced. */
export function defaultSlashCommandItems(): readonly SlashCommandItem[] {
  return Object.freeze([
    textBlockItem('paragraph', 'Text', '¶', 'paragraph'),
    textBlockItem('heading-1', 'Heading 1', 'H1', 'heading', { level: 1 }),
    textBlockItem('heading-2', 'Heading 2', 'H2', 'heading', { level: 2 }),
    textBlockItem('heading-3', 'Heading 3', 'H3', 'heading', { level: 3 }),
    Object.freeze({
      id: 'bullet-list', label: 'Bullet list', icon: '•', group: 'Lists',
      description: 'Start an unordered list.', aliases: Object.freeze(['unordered list', 'ul']),
      isAvailable: (editor: Editor) => Boolean(editor.state.schema.nodes.bullet_list && editor.state.schema.nodes.list_item),
      run: ({ editor }: SlashCommandExecutionContext) => toggleList(editor, 'bullet'),
    }),
    Object.freeze({
      id: 'ordered-list', label: 'Numbered list', icon: '1.', group: 'Lists',
      description: 'Start an ordered list.', aliases: Object.freeze(['ordered list', 'ol']),
      isAvailable: (editor: Editor) => Boolean(editor.state.schema.nodes.ordered_list && editor.state.schema.nodes.list_item),
      run: ({ editor }: SlashCommandExecutionContext) => toggleList(editor, 'ordered'),
    }),
    Object.freeze({
      id: 'task-list', label: 'Task list', icon: '☑', group: 'Lists',
      description: 'Start an interactive checklist.', aliases: Object.freeze(['todo', 'checklist']),
      isAvailable: (editor: Editor) => Boolean(editor.state.schema.nodes.task_list && editor.state.schema.nodes.task_item),
      run: ({ editor }: SlashCommandExecutionContext) => toggleList(editor, 'task'),
    }),
    Object.freeze({
      id: 'quote', label: 'Quote', icon: '❝', group: 'Blocks',
      description: 'Insert a block quotation.', aliases: Object.freeze(['blockquote']),
      isAvailable: (editor: Editor) => Boolean(editor.state.schema.nodes.blockquote && editor.state.schema.nodes.paragraph),
      run: ({ editor }: SlashCommandExecutionContext) => replaceEmptyBlock(editor, ({ state }) => ({
        nodes: [state.schema.node('blockquote', {}, [state.schema.node('paragraph', {}, [state.schema.text('')])])],
        selectionPath: [state.selection.path[0] as number, 0, 0],
      })),
    }),
    textBlockItem('code-block', 'Code block', '</>', 'code_block', { language: 'plaintext', lineNumbers: false }, 'Blocks'),
    Object.freeze({
      id: 'divider', label: 'Divider', icon: '—', group: 'Insert',
      description: 'Separate sections with a horizontal rule.', aliases: Object.freeze(['horizontal rule', 'separator']),
      isAvailable: (editor: Editor) => Boolean(editor.state.schema.nodes.horizontal_rule && editor.state.schema.nodes.paragraph),
      run: ({ editor }: SlashCommandExecutionContext) => replaceEmptyBlock(editor, ({ state }) => {
        const index = state.selection.path[0] as number;
        return {
          nodes: [state.schema.node('horizontal_rule'), state.schema.node('paragraph', {}, [state.schema.text('')])],
          selectionPath: [index + 1, 0],
        };
      }),
    }),
    Object.freeze({
      id: 'table', label: 'Table', icon: '▦', group: 'Insert',
      description: 'Insert a 3 by 3 table with a header row.', aliases: Object.freeze(['grid', 'spreadsheet']),
      isAvailable: (editor: Editor) => Boolean(editor.state.schema.nodes.table && editor.state.schema.nodes.table_row && editor.state.schema.nodes.table_cell && editor.state.schema.nodes.paragraph),
      run: ({ editor }: SlashCommandExecutionContext) => replaceEmptyBlock(editor, ({ state }) => {
        const index = state.selection.path[0] as number;
        const rows = Array.from({ length: 3 }, (_, row) => state.schema.node('table_row', {},
          Array.from({ length: 3 }, () => state.schema.node(
            row === 0 && state.schema.nodes.table_header ? 'table_header' : 'table_cell',
            {},
            [state.schema.node('paragraph', {}, [state.schema.text('')])],
          )),
        ));
        return {
          nodes: [state.schema.node('table', {}, rows), state.schema.node('paragraph', {}, [state.schema.text('')])],
          selectionPath: [index, 0, 0, 0, 0],
        };
      }),
    }),
  ] satisfies SlashCommandItem[]);
}

function executeSlashCommand(editor: Editor, item: SlashCommandItem, match: SuggestionMatch): boolean {
  if (!editor.editable || item.disabled || (item.isAvailable && !item.isAvailable(editor))) return false;
  return editor.runCommandBatch(() => {
    try {
      const transaction = editor.state.createTransaction()
        .replaceText(match.range.path, match.range.from, match.range.to, '')
        .setSelection(Selection.cursor(match.range.path, match.range.from));
      if (!editor.dispatch(transaction)) return false;
      return item.run({ editor, match });
    } catch { return false; }
  });
}

function createSlashCommandExtensionWithKey(
  options: SlashCommandExtensionOptions,
  key: PluginKey<SuggestionPluginState>,
): FountainExtension {
  const trigger = options.trigger ?? '/';
  const registry = options.registry ?? new SlashCommandRegistry();
  if (options.includeDefaultItems !== false) registry.registerItems('fountain-defaults', defaultSlashCommandItems());
  if (options.items?.length) registry.registerItems('host-items', options.items);
  (options.sources ?? []).forEach(({ id, source }) => registry.register(id, source));
  const controllers = new WeakMap<Editor, {
    controller: SuggestionController<SlashCommandItem>;
    unsubscribeRegistry: () => void;
  }>();
  const getController = (editor: Editor) => {
    const existing = controllers.get(editor);
    if (existing) return existing.controller;
    const controller = new SuggestionController(
      editor,
      key,
      ({ editor: activeEditor, match, signal }) => registry.getItems({
        editor: activeEditor,
        match,
        query: match.query,
        signal,
      }),
      executeSlashCommand,
      options.maximumItems ?? 60,
    );
    const unsubscribeRegistry = registry.subscribe(() => controller.invalidate());
    controllers.set(editor, { controller, unsubscribeRegistry });
    return controller;
  };
  const plugin = new Plugin<SuggestionPluginState>({
    key,
    state: createSuggestionStateSpec([{
      char: trigger,
      startOfLine: options.startOfLine !== false,
      allowSpaces: options.allowSpaces !== false,
      allowedPrefixes: options.allowedPrefixes,
    }]),
    props: {
      decorations: (state) => suggestionDecorations(state, key, 'fountain-slash-command-query'),
      handleKeyDown: (editor, event) => handleSuggestionKeyDown(controllers.get(editor)?.controller, event),
      onDestroy: (editor) => {
        const entry = controllers.get(editor);
        entry?.unsubscribeRegistry();
        entry?.controller.destroy();
        controllers.delete(editor);
      },
    },
  });
  const service: SlashCommandService = Object.freeze({ key, registry, getController });
  return defineExtension({
    name: 'slash-command',
    plugins: [plugin],
    services: { slashCommands: service },
  });
}

export function createSlashCommandExtension(options: SlashCommandExtensionOptions = {}): FountainExtension {
  return createSlashCommandExtensionWithKey(options, new PluginKey<SuggestionPluginState>('slash-command'));
}

export const slashCommandKey = new PluginKey<SuggestionPluginState>('slash-command');
export const SlashCommandExtension = createSlashCommandExtensionWithKey({}, slashCommandKey);
