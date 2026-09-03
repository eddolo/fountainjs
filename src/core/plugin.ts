import type { Editor } from './editor';
import type { EditorState } from './state';
import type { Transaction } from './transaction';
import type { Decoration, DecorationSet } from './decoration';

let pluginId = 0;

export class PluginKey<T = unknown> {
  readonly id: string;

  constructor(name = 'plugin') {
    this.id = `${name}$${pluginId++}`;
  }

  get(state: EditorState): T | undefined {
    return state.getPluginState(this);
  }
}

export interface PluginStateSpec<T> {
  init: (config: unknown, state: EditorState) => T;
  apply: (transaction: Transaction, value: T, oldState: EditorState, newState: EditorState) => T;
}

export interface PluginProps {
  decorations?: (state: EditorState) => DecorationSet | readonly Decoration[] | null | undefined;
  handleKeyDown?: (editor: Editor, event: KeyboardEvent) => boolean;
  handleBeforeInput?: (editor: Editor, event: InputEvent) => boolean;
  handleTextInput?: (editor: Editor, from: number, to: number, text: string) => boolean;
  handleCopy?: (editor: Editor, event: ClipboardEvent) => boolean;
  handleCut?: (editor: Editor, event: ClipboardEvent) => boolean;
  handlePaste?: (editor: Editor, event: ClipboardEvent) => boolean;
  handleDrop?: (editor: Editor, event: DragEvent) => boolean;
  handleClick?: (editor: Editor, event: MouseEvent) => boolean;
  onCreate?: (editor: Editor) => void;
  onDestroy?: (editor: Editor) => void;
}

export interface PluginSpec<T = unknown> {
  key?: PluginKey<T>;
  state?: PluginStateSpec<T>;
  props?: PluginProps;
  /** May return a follow-up transaction after a state update (for example, structural repair). */
  appendTransaction?: (
    transactions: readonly Transaction[],
    oldState: EditorState,
    newState: EditorState,
  ) => Transaction | null | undefined;
}

export class Plugin<T = unknown> {
  readonly key: PluginKey<T>;

  constructor(public readonly spec: PluginSpec<T>) {
    this.key = spec.key ?? new PluginKey<T>();
  }
}
