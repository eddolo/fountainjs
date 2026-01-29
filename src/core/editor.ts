import { EditorState } from './state';
import { Schema, SchemaSpec } from './schema';
import { Transaction } from './transaction';
import { Plugin } from './plugin';
export interface EditorConfig { schema: SchemaSpec; state?: EditorState; plugins?: Plugin[]; }
type StateChangeCallback = (newState: EditorState) => void;
export class Editor {
  private _state: EditorState; private subscribers: Set<StateChangeCallback> = new Set();
  constructor(config: { state: EditorState }) { this._state = config.state; }
  get state(): EditorState { return this._state; }
  createTransaction(): Transaction { return this.state.createTransaction(); }
  dispatch(transaction: Transaction): void { const newState = this._state.apply(transaction); if (newState === this._state) { return; } this._state = newState; this.subscribers.forEach(callback => callback(newState)); }
  subscribe(callback: StateChangeCallback): () => void { this.subscribers.add(callback); return () => this.subscribers.delete(callback); }
}
export function createEditor(config: EditorConfig): Editor { const schema = new Schema(config.schema); const plugins = config.plugins || []; const state = config.state || EditorState.create({ schema, plugins, }); return new Editor({ state }); }