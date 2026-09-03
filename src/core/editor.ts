import { Plugin } from './plugin';
import { Node, type NodeJSON, Schema, type SchemaSpec } from './schema';
import { EditorState } from './state';
import { Transaction } from './transaction';

export interface EditorConfig {
  schema: SchemaSpec;
  content?: Node | NodeJSON;
  state?: EditorState;
  plugins?: readonly Plugin<any>[];
  editable?: boolean;
  onUpdate?: (state: EditorState, transaction: Transaction) => void;
}

export type StateChangeCallback = (state: EditorState, transaction: Transaction) => void;

export class Editor {
  private currentState: EditorState;
  private readonly subscribers = new Set<StateChangeCallback>();
  private destroyed = false;
  readonly editable: boolean;

  constructor(state: EditorState, private readonly onUpdate?: EditorConfig['onUpdate'], editable = true) {
    this.currentState = state;
    this.editable = editable;
    state.plugins.forEach((plugin) => plugin.spec.props?.onCreate?.(this));
  }

  get state(): EditorState { return this.currentState; }
  get isDestroyed(): boolean { return this.destroyed; }

  createTransaction(): Transaction {
    this.assertAlive();
    return this.currentState.createTransaction();
  }

  dispatch(transaction: Transaction): void {
    this.assertAlive();
    if (!transaction.docChanged && !transaction.selectionSet && transaction.getMeta('force') !== true) return;
    this.currentState = this.currentState.apply(transaction);
    this.subscribers.forEach((callback) => callback(this.currentState, transaction));
    this.onUpdate?.(this.currentState, transaction);
  }

  subscribe(callback: StateChangeCallback): () => void {
    this.assertAlive();
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  getJSON(): NodeJSON { return this.state.doc.toJSON(); }
  getText(separator = '\n'): string { return this.state.doc.content.map((node) => node.textContent).join(separator); }

  destroy(): void {
    if (this.destroyed) return;
    this.currentState.plugins.forEach((plugin) => plugin.spec.props?.onDestroy?.(this));
    this.subscribers.clear();
    this.destroyed = true;
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('This FountainJS editor has been destroyed.');
  }
}

export function createEditor(config: EditorConfig): Editor {
  if (config.state) return new Editor(config.state, config.onUpdate, config.editable);
  const schema = new Schema(config.schema);
  const doc = config.content instanceof Node
    ? config.content
    : config.content
      ? schema.nodeFromJSON(config.content)
      : undefined;
  const state = EditorState.create({ schema, doc, plugins: config.plugins });
  return new Editor(state, config.onUpdate, config.editable);
}
