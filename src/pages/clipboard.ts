import { Plugin, NodeSelection, insertDocument, type Editor, type Node } from '../core';
import { isAutomaticTrailingParagraph } from '../core/editing-provenance';

export interface FootnoteClipboardOptions {
  readonly idFactory?: (editor: Editor) => string;
  readonly label?: (node: Node) => string;
  /** Host-specific source metadata, such as labels, is prepared before insertion. */
  readonly prepareDocument?: (document: Node, current: Node) => Node;
  /** Throws to refuse the entire paste before its model is published. */
  readonly validateDocument?: (document: Node) => void;
}

const isDefinition = (node: Node) => node.type.name === 'footnote_definition';
const isReference = (node: Node) => node.type.name === 'footnote_reference';
function containsNotes(document: Node): boolean {
  let found = false;
  document.descendants(node => { if (isDefinition(node) || isReference(node)) found = true; });
  return found;
}
function definitions(document: Node): Map<string, Node> {
  const result = new Map<string, Node>();
  document.descendants((node, path) => {
    if (!isDefinition(node)) return;
    const id = String(node.attrs.id);
    if (path.length !== 1 || result.has(id)) throw new Error('FOUNTAIN_CLIPBOARD_AMBIGUOUS_FOOTNOTE');
    result.set(id, node);
  });
  return result;
}
function references(document: Node): string[] {
  const result: string[] = [];
  document.descendants(node => { if (isReference(node)) result.push(String(node.attrs.id)); });
  return result;
}
function completeCopy(editor: Editor, supplied: Node): Node {
  if (!containsNotes(supplied)) return supplied;
  let document = supplied;
  const selection = editor.state.selection;
  if (document.childCount === 1 && isDefinition(document.child(0)) && selection.kind !== 'all'
    && !(selection instanceof NodeSelection && selection.nodeType === 'footnote_definition')) {
    document = document.copy(document.child(0).content);
  }
  const selected = definitions(document), current = definitions(editor.state.doc), needed = new Map<string, Node>();
  const queue = references(document);
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!;
    if (needed.has(id)) continue;
    const definition = current.get(id);
    if (!definition) throw new Error('FOUNTAIN_CLIPBOARD_MISSING_FOOTNOTE');
    needed.set(id, definition);
    queue.push(...references(definition));
  }
  // A reference owns the entire body, even when the selected range also
  // contains only part of that body. Other selected definitions stay selected.
  const content = document.content.map(node => isDefinition(node) ? needed.get(String(node.attrs.id)) ?? node : node);
  for (const [id, definition] of needed) if (!selected.has(id)) content.push(definition);
  return document.copy(content);
}
function freshen(document: Node, current: Node, editor: Editor, factory: NonNullable<FootnoteClipboardOptions['idFactory']>): Node {
  const incoming = definitions(document), used = new Set<string>(), assigned = new Map<string, string>();
  current.descendants(node => { if (isDefinition(node) || isReference(node)) used.add(String(node.attrs.id)); });
  const incomingIds = new Set(incoming.keys()), counters = new Map<string, number>();
  for (const reference of references(document)) if (!incoming.has(reference)) throw new Error('FOUNTAIN_CLIPBOARD_MISSING_FOOTNOTE');
  for (const id of incoming.keys()) {
    let target = id;
    if (used.has(target)) {
      const base = factory(editor);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(base)) throw new Error('FOUNTAIN_CLIPBOARD_FOOTNOTE_ID');
      target = base;
      let next = counters.get(base) ?? 2;
      while (used.has(target) || incomingIds.has(target)) {
        const suffix = '-' + next++;
        target = base.slice(0, 128 - suffix.length) + suffix;
      }
      counters.set(base, next);
    }
    assigned.set(id, target); used.add(target);
  }
  const project = (node: Node): Node => {
    const id = isDefinition(node) || isReference(node) ? assigned.get(String(node.attrs.id)) : undefined;
    const content = node.content.map(project);
    return node.type.create(id === undefined ? node.attrs : { ...node.attrs, id }, content, node.text, node.marks);
  };
  return project(document);
}

/** Keeps clipboard references self-contained and inserts their definitions at the document root. */
export function createFootnoteClipboardPlugin(options: FootnoteClipboardOptions = {}): Plugin {
  const factory = options.idFactory ?? (() => {
    if (!globalThis.crypto?.randomUUID) throw new Error('FOUNTAIN_CLIPBOARD_FOOTNOTE_ID_FACTORY');
    return globalThis.crypto.randomUUID();
  });
  return new Plugin({ props: {
    transformCopiedDocument: completeCopy,
    serializeCopiedNode(_editor, node, serialize) {
      if (!isReference(node) && !isDefinition(node)) return undefined;
      const label = options.label?.(node) ?? String(node.attrs.id);
      if (isReference(node)) return `[^${label}]`;
      if (isDefinition(node)) return `[^${label}]: ${node.content.map(serialize).join('\n\n').split('\n').join('\n    ')}`;
      return undefined;
    },
    handlePasteDocument(editor, supplied) {
      if (!containsNotes(supplied)) return undefined;
      if (!editor.editable) return false;
      return editor.runCommandBatch(() => {
        let document = freshen(supplied, editor.state.doc, editor, factory);
        document = options.prepareDocument?.(document, editor.state.doc) ?? document;
        if (document.type !== editor.state.schema.topNodeType) throw new Error('FOUNTAIN_CLIPBOARD_FOOTNOTE_SCHEMA');
        editor.state.schema.validate(document);
        const owned = definitions(document);
        for (const id of references(document)) if (!owned.has(id)) throw new Error('FOUNTAIN_CLIPBOARD_MISSING_FOOTNOTE');
        const notes = document.content.filter(isDefinition);
        const body = document.copy(document.content.filter(node => !isDefinition(node)));
        if (body.childCount && !insertDocument(editor, body)) return false;
        if (notes.length) {
          const transaction = editor.createTransaction(), last = transaction.doc.content.findLastIndex(isDefinition);
          const index = last >= 0 ? last + 1 : transaction.doc.childCount - (isAutomaticTrailingParagraph(transaction.doc.content.at(-1)) ? 1 : 0);
          transaction.replace(index, index, notes);
          if (!editor.dispatch(transaction)) return false;
        }
        options.validateDocument?.(editor.state.doc);
        return true;
      });
    },
  } });
}
