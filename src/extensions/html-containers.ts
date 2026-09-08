import type { NodeSpec, Node, Attributes } from '../core/schema';
import type { Editor } from '../core/editor';
import { NodeSelection, Selection } from '../core/selection';
import { getNodeAtPath, getTextLeaves } from '../core/transaction/path';
import { defineExtension } from './extension';

const tags = ['div', 'section', 'article', 'aside', 'nav', 'main', 'header', 'footer', 'address'] as const;
const attributes = { id: 'id', className: 'class', title: 'title', lang: 'lang', dir: 'dir' } as const;
const textAttribute = (limit: number) => ({ default: '', validate: (value: unknown) => typeof value === 'string' && value.length <= limit && !/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/u.test(value) });

/** Optional structured section wrappers, not arbitrary HTML or CSS execution.
 * Hosts opting in own their stylesheet and the meaning of imported IDs/classes.
 */
export const htmlContainer: NodeSpec = {
  group: 'block', content: 'block*',
  attrs: {
    tag: { default: 'div', validate: value => tags.includes(value as typeof tags[number]) },
    id: textAttribute(256), className: textAttribute(2048), title: textAttribute(2048), lang: textAttribute(128),
    dir: { default: '', validate: value => typeof value === 'string' && ['', 'ltr', 'rtl', 'auto'].includes(value) },
  },
  parseHTML: tags.map(tag => ({
    tag, priority: 10,
    getAttrs: element => {
      const names = element.getAttributeNames?.();
      if (!names || names.some(name => !Object.values(attributes).includes(name as typeof attributes[keyof typeof attributes]))) return false;
      return { tag, ...Object.fromEntries(Object.entries(attributes).map(([name, html]) => [name, element.getAttribute(html) ?? ''])) };
    },
  })),
  toDOM: node => [String(node.attrs.tag), Object.fromEntries(Object.entries(attributes)
    .filter(([name]) => node.attrs[name] !== '').map(([name, html]) => [html, node.attrs[name]])), 0],
};

function paragraph(editor: Editor): Node {
  return editor.state.schema.node('paragraph', {}, [editor.state.schema.text('')]);
}

function containerAt(editor: Editor, path: readonly number[]): Node | null {
  if (!editor.editable || !path.length || !path.every(index => Number.isInteger(index) && index >= 0)) return null;
  try {
    const node = getNodeAtPath(editor.state.doc, path);
    return node.type.name === 'html_container' ? node : null;
  } catch { return null; }
}

/** Insert a section with an editable paragraph AFTER the active top-level block.
 * Does not replace selected content. Imported empty sections remain untouched.
 */
export function insertHTMLContainer(editor: Editor, attrs: Attributes = { tag: 'section' }): boolean {
  if (!editor.editable || !editor.state.schema.nodes.html_container) return false;
  try {
    const node = editor.state.schema.node('html_container', attrs, [paragraph(editor)]);
    const selection = editor.state.selection;
    const index = Math.min((selection.endPath[0] ?? editor.state.doc.childCount - 1) + 1, editor.state.doc.childCount);
    return editor.dispatch(editor.createTransaction().replace(index, index, [node])
      .setSelection(Selection.cursor([index, 0, 0], 0)));
  } catch { return false; }
}

/** Append a paragraph, including to a preserved empty section. One undoable edit. */
export function appendHTMLContainerParagraph(editor: Editor, path: readonly number[]): boolean {
  const node = containerAt(editor, path);
  if (!node) return false;
  try {
    return editor.dispatch(editor.createTransaction().replaceNode(path, [node.copy([...node.content, paragraph(editor)])])
      .setSelection(Selection.cursor([...path, node.childCount, 0], 0)));
  } catch { return false; }
}

/** Remove only the wrapper, retaining its children and their attributes.
 * An empty section becomes a paragraph so a caret remains available.
 * Refuses schemas whose parent cannot contain the unwrapped children.
 */
export function unwrapHTMLContainer(editor: Editor, path: readonly number[]): boolean {
  const node = containerAt(editor, path);
  if (!node) return false;
  try {
    const content = node.childCount ? node.content : [paragraph(editor)];
    const transaction = editor.createTransaction().replaceNode(path, content);
    editor.state.schema.validate(transaction.doc);
    const selection = editor.state.selection;
    const inside = (candidate: readonly number[]) => candidate.length > path.length && path.every((index, depth) => candidate[depth] === index);
    const moved = (candidate: readonly number[]) => [...path.slice(0, -1), path.at(-1)! + candidate[path.length]!, ...candidate.slice(path.length + 1)];
    if (selection.kind === 'text' && inside(selection.path) && inside(selection.endPath)) {
      transaction.setSelection(new Selection(moved(selection.path), selection.from, selection.to, moved(selection.endPath)));
    } else if (selection instanceof NodeSelection && inside(selection.nodePath)) {
      transaction.setSelection(new NodeSelection(transaction.doc, moved(selection.nodePath)));
    } else {
      const leaf = getTextLeaves(content[0]!)[0];
      transaction.setSelection(leaf ? Selection.cursor([...path, ...leaf.path], 0) : new NodeSelection(transaction.doc, path));
    }
    return editor.dispatch(transaction);
  } catch { return false; }
}

/** Add explicitly with composeExtensions; StarterKit keeps its existing schema. */
export const HTMLContainerExtension = defineExtension({
  name: 'html-containers',
  nodes: { html_container: htmlContainer },
  commands: { insertHTMLContainer, appendHTMLContainerParagraph, unwrapHTMLContainer },
});
