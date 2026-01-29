import { Schema, Node } from './schema';
import { Transaction } from './transaction';
import { Selection } from './selection';
import { Plugin } from './plugin';
export interface EditorStateConfig { schema: Schema; doc?: Node; selection?: Selection; plugins?: Plugin[]; pluginStates?: any[]; }
export class EditorState {
  public readonly schema: Schema; public readonly doc: Node; public readonly selection: Selection; public readonly plugins: Plugin[]; public readonly pluginStates: any[];
  constructor(config: EditorStateConfig) { this.schema = config.schema; this.doc = config.doc || this.createDefaultDoc(config.schema); this.selection = config.selection || Selection.createCursor([0, 0], 19); this.plugins = config.plugins || []; if (config.pluginStates) { this.pluginStates = config.pluginStates; } else { this.pluginStates = this.plugins.map(p => p.spec.state?.init({}, this)); } }
  static create(config: { schema: Schema; plugins?: Plugin[] }): EditorState { return new EditorState(config); }
  apply(tr: Transaction): EditorState { const newPluginStates = this.plugins.map((plugin, i) => { const stateSpec = plugin.spec.state; return stateSpec ? stateSpec.apply(tr, this.pluginStates[i], this) : this.pluginStates[i]; }); const newDoc = tr.doc; const newSelection = tr.selectionSet ? tr.selection : this.selection; return new EditorState({ schema: this.schema, doc: newDoc, selection: newSelection, plugins: this.plugins, pluginStates: newPluginStates, }); }
  createTransaction(): Transaction { return new Transaction(this.doc); }
  private createDefaultDoc(schema: Schema): Node { const docType = schema.nodes.doc; const paraType = schema.nodes.paragraph; const textType = schema.nodes.text; if (!docType || !paraType || !textType) throw new Error('Schema is missing core nodes.'); const textNode = new Node(textType, {}, [], 'Start typing here...'); const paragraphNode = new Node(paraType, {}, [textNode]); return new Node(docType, {}, [paragraphNode]); }
}