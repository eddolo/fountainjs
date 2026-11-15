import { insertDocument, NodeSelection, Selection, type Editor, type Node } from 'fountainjs-editor';
import { inspectFootnotes, removeFootnote, selectFootnoteDefinition } from 'fountainjs-editor/pages';
import { appendGitLabFootnoteDefinitions, type GitLabMarkdownInsertion } from './markdown_insertion';
import { namespaceGitLabFootnotes } from './footnote_labels';

const at = (doc: Node, path: readonly number[]) => path.reduce((node, index) => node.child(index), doc);
export function getGitLabFootnoteContext(editor: Editor) {
  try {
    const { doc, selection } = editor.state;
    const path = selection instanceof NodeSelection ? selection.nodePath : selection.path;
    let owner: { node: Node; path: readonly number[] } | undefined;
    for (let length = 1; length <= path.length; length++) {
      const node = at(doc, path.slice(0, length));
      if (['code_block', 'gitlab_media', 'inline_image', 'gitlab_reference'].includes(node.type.name)) return undefined;
      if (node.type.name.startsWith('footnote_')) owner = { node, path: path.slice(0, length) };
    }
    if (!owner) return undefined;
    const id = String(owner.node.attrs.id), report = inspectFootnotes(doc);
    const definition = report.definitions.find(note => note.id === id);
    if (!definition || definition.path.length !== 1) return undefined;
    return { id, path: owner.path, definitionPath: definition.path,
      referencePath: owner.node.type.name === 'footnote_reference' ? owner.path : undefined,
      label: String(at(doc, definition.path).attrs.gitlabFootnoteLabel ?? id),
      references: report.references.filter(note => note.id === id).length };
  } catch { return undefined; }
}

export function beginGitLabFootnoteInsertion(editor: Editor, insertions: GitLabMarkdownInsertion) {
  const selection = editor.state.selection;
  if (!editor.editable || !(selection instanceof Selection) || !selection.isSingleText) throw new Error('GITLAB_FOOTNOTE_INSERTION_SELECTION');
  const controller = new AbortController();
  let resolve!: (value: string) => void;
  let closed = false;
  let existing: string | undefined;
  const source = new Promise<string>(done => { resolve = done; });
  const completion = insertions.insertFrom(() => source, controller.signal, undefined, {
    selection: Selection.cursor(selection.endPath, selection.to),
    nativeDocument: () => existing ? editor.state.doc : undefined,
    project: document => {
      if (!existing) return namespaceGitLabFootnotes(document, editor.state.doc);
      const definition = inspectFootnotes(editor.state.doc).definitions.find(note => note.id === existing);
      if (!definition) throw new Error('GITLAB_FOOTNOTE_TARGET_REMOVED');
      const node = at(editor.state.doc, definition.path), label = String(node.attrs.gitlabFootnoteLabel ?? existing);
      return document.copy([editor.state.schema.node('paragraph', {}, [editor.state.schema.node('footnote_reference', {
        id: existing, gitlabFootnoteLabel: label, gitlabFootnoteOriginalLabel: label, gitlabFootnoteTargetLabel: label,
      })])]);
    },
    apply(document, target) {
      const paragraph = document.content.find(node => node.type.name === 'paragraph');
      const definition = document.content.find(node => node.type.name === 'footnote_definition');
      const reference = paragraph?.content[0];
      if ((existing ? document.childCount !== 1 : !definition || document.childCount !== 2)
        || paragraph?.childCount !== 1 || reference?.type.name !== 'footnote_reference')
        throw new Error('GITLAB_FOOTNOTE_INSERTION_SHAPE');
      if (!editor.dispatch(editor.createTransaction().setSelection(target)) || !insertDocument(editor, document.copy([paragraph]))) return false;
      if (existing) return true;
      const transaction = editor.createTransaction();
      appendGitLabFootnoteDefinitions(transaction, [definition!]);
      return editor.dispatch(transaction) && selectFootnoteDefinition(editor, String(definition!.attrs.id));
    },
  });
  // Keep cancellation/destroy from becoming an unhandled rejection while the
  // author is still typing. The original promise remains observable by apply.
  void completion.catch(() => {});
  return {
    async apply(markdown: string) {
      if (closed || !markdown.trim()) throw new Error('GITLAB_FOOTNOTE_BODY_REQUIRED');
      closed = true;
      resolve(`[^fountain-note]\n\n[^fountain-note]: ${markdown.replace(/\r\n?/gu, '\n').split('\n').join('\n    ')}`);
      return completion;
    },
    async applyExisting(id: string) {
      if (closed) throw new Error('GITLAB_FOOTNOTE_INSERTION_CLOSED');
      closed = true; existing = id; resolve(''); return completion;
    },
    cancel() { controller.abort(); if (!closed) { closed = true; resolve(''); } },
  };
}

export function deleteGitLabFootnote(editor: Editor, id: string): boolean { return removeFootnote(editor, id); }
export function deleteGitLabFootnoteReference(editor: Editor, path: readonly number[], id: string): boolean {
  if (!editor.editable) return false;
  const node = at(editor.state.doc, path);
  if (node.type.name !== 'footnote_reference' || node.attrs.id !== id) return false;
  return editor.dispatch(editor.createTransaction().replaceNode(path, []));
}
export { selectFootnoteDefinition };
