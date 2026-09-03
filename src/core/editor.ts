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

export interface CommandBatchOptions {
  /** Evaluate the commands against temporary state and always restore the editor. */
  dryRun?: boolean;
}

interface CommandBatch {
  transactions: Transaction[];
}

export class Editor {
  private currentState: EditorState;
  private readonly subscribers = new Set<StateChangeCallback>();
  private destroyed = false;
  private commandBatch?: CommandBatch;
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
    if (!transaction.docChanged && !transaction.selectionSet && !transaction.storedMarksSet && transaction.getMeta('force') !== true) return;
    if (this.commandBatch) {
      this.currentState = this.currentState.apply(transaction);
      this.commandBatch.transactions.push(transaction);
      return;
    }
    const oldState = this.currentState;
    this.currentState = this.currentState.apply(transaction);
    const applied: Transaction[] = [transaction];
    for (let pass = 0; pass < 20; pass += 1) {
      let appended = false;
      for (const plugin of this.currentState.plugins) {
        const followUp = plugin.spec.appendTransaction?.(Object.freeze([...applied]), oldState, this.currentState);
        if (!followUp) continue;
        if (!followUp.docChanged && !followUp.selectionSet && !followUp.storedMarksSet && followUp.getMeta('force') !== true) continue;
        this.currentState = this.currentState.apply(followUp);
        applied.push(followUp);
        appended = true;
      }
      if (!appended) break;
      if (pass === 19) throw new Error('Plugin appendTransaction loop exceeded 20 passes.');
    }
    this.subscribers.forEach((callback) => callback(this.currentState, transaction));
    this.onUpdate?.(this.currentState, transaction);
  }

  /**
   * Runs command functions against a temporary state and commits their work as one
   * transaction. A false result or thrown error restores the original state.
   */
  runCommandBatch(execute: () => boolean, options: CommandBatchOptions = {}): boolean {
    this.assertAlive();
    if (this.commandBatch) throw new Error('FountainJS command batches cannot be nested.');
    const initialState = this.currentState;
    const batch: CommandBatch = { transactions: [] };
    this.commandBatch = batch;
    try {
      const accepted = execute();
      if (!accepted || options.dryRun) return accepted;
      const combined = initialState.createTransaction();
      batch.transactions.forEach((transaction) => {
        transaction.steps.forEach((step) => combined.step(step));
        if (transaction.selectionSet) combined.setSelection(transaction.selection);
        if (transaction.storedMarksSet) combined.setStoredMarks(transaction.storedMarks);
        transaction.getMetaEntries().forEach(([key, value]) => combined.setMeta(key, value));
      });
      this.currentState = initialState;
      this.commandBatch = undefined;
      this.dispatch(combined);
      return true;
    } finally {
      if (this.commandBatch === batch) {
        this.currentState = initialState;
        this.commandBatch = undefined;
      }
    }
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
