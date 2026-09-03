import { Plugin, PluginKey } from './plugin';
import { Selection } from './selection';
import { Mark, Node, Schema } from './schema';
import { getNodeAtPath } from './transaction/path';
import { Transaction } from './transaction';

export interface EditorStateConfig {
  schema: Schema;
  doc?: Node;
  selection?: Selection;
  plugins?: readonly Plugin<any>[];
  pluginStates?: ReadonlyMap<Plugin<any>, unknown>;
  storedMarks?: readonly Mark[];
}

function firstTextPath(doc: Node): number[] {
  let found: number[] | undefined;
  doc.descendants((node, path) => {
    if (found) return false;
    if (node.isText) {
      found = path;
      return false;
    }
  });
  return found ?? [];
}

function normalizeSelection(doc: Node, selection: Selection): Selection {
  try {
    const start = getNodeAtPath(doc, selection.path);
    const end = getNodeAtPath(doc, selection.endPath);
    if (!start.isText || !end.isText) throw new Error('Selection is not inside text.');
    return new Selection(
      selection.path,
      Math.min(selection.from, start.text?.length ?? 0),
      Math.min(selection.to, end.text?.length ?? 0),
      selection.endPath,
    );
  } catch {
    const path = firstTextPath(doc);
    return Selection.cursor(path, 0);
  }
}

export class EditorState {
  readonly schema: Schema;
  readonly doc: Node;
  readonly selection: Selection;
  readonly plugins: readonly Plugin<any>[];
  readonly storedMarks: readonly Mark[];
  private readonly pluginStates: ReadonlyMap<Plugin<any>, unknown>;

  constructor(config: EditorStateConfig) {
    this.schema = config.schema;
    this.doc = config.doc ?? this.createDefaultDoc();
    this.schema.validate(this.doc);
    this.selection = normalizeSelection(this.doc, config.selection ?? Selection.cursor(firstTextPath(this.doc), 0));
    this.plugins = Object.freeze([...(config.plugins ?? [])]);
    const initialMarks = config.storedMarks ?? (this.selection.isCollapsed
      ? getNodeAtPath(this.doc, this.selection.path).marks
      : []);
    this.storedMarks = Object.freeze([...initialMarks]);

    if (config.pluginStates) {
      this.pluginStates = config.pluginStates;
    } else {
      const states = new Map<Plugin<any>, unknown>();
      this.pluginStates = states;
      this.plugins.forEach((plugin) => {
        if (plugin.spec.state) states.set(plugin, plugin.spec.state.init({}, this));
      });
    }
  }

  static create(config: EditorStateConfig): EditorState {
    return new EditorState(config);
  }

  apply(transaction: Transaction): EditorState {
    const nextDoc = transaction.doc;
    const nextSelection = normalizeSelection(nextDoc, transaction.selectionSet ? transaction.selection : this.selection);
    let nextStoredMarks = transaction.storedMarksSet ? transaction.storedMarks : this.storedMarks;
    if (transaction.selectionSet && !transaction.storedMarksSet) {
      if (nextSelection.isCollapsed) {
        try { nextStoredMarks = getNodeAtPath(nextDoc, nextSelection.path).marks; }
        catch { nextStoredMarks = []; }
      } else nextStoredMarks = [];
    }
    const interim = new EditorState({
      schema: this.schema,
      doc: nextDoc,
      selection: nextSelection,
      plugins: this.plugins,
      pluginStates: this.pluginStates,
      storedMarks: nextStoredMarks,
    });
    const states = new Map<Plugin<any>, unknown>();
    this.plugins.forEach((plugin) => {
      const previous = this.pluginStates.get(plugin);
      const next = plugin.spec.state
        ? plugin.spec.state.apply(transaction, previous, this, interim)
        : previous;
      states.set(plugin, next);
    });
    return new EditorState({
      schema: this.schema,
      doc: nextDoc,
      selection: nextSelection,
      plugins: this.plugins,
      pluginStates: states,
      storedMarks: nextStoredMarks,
    });
  }

  createTransaction(): Transaction {
    return new Transaction(this.doc, this.selection, this.storedMarks);
  }

  getPluginState<T>(pluginOrKey: Plugin<T> | PluginKey<T>): T | undefined {
    const plugin = pluginOrKey instanceof Plugin
      ? pluginOrKey
      : this.plugins.find((candidate) => candidate.key === pluginOrKey);
    return plugin ? this.pluginStates.get(plugin) as T | undefined : undefined;
  }

  private createDefaultDoc(): Node {
    const paragraph = this.schema.nodes.paragraph;
    if (!paragraph) throw new Error('The schema must provide a paragraph node or an initial document.');
    return this.schema.topNodeType.create({}, [paragraph.create({}, [this.schema.text('')])]);
  }
}
