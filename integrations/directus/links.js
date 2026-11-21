import { Selection, StarterKit, isSafeURL } from '../../src/index';
import { getNodeAtPath } from '../../src/core/transaction/path';

const link = StarterKit.schema.marks.link;
const attributeNames = ['target', 'rel', 'href', 'title'];
const output = mark => {
  const { href, title, target, rel, order } = mark.attrs;
  const attrs = { href, title: title || null, target, rel };
  return ['a', Object.fromEntries((order ?? attributeNames).map(key => [key, attrs[key]])), 0];
};
export const directusLink = {
  ...link,
  attrs: {
    ...link.attrs,
    target: { default: null, validate: value => value === null || value === '_self' || value === '_blank' },
    rel: { default: null, validate: value => value === null || typeof value === 'string' },
    order: { default: null, validate: value => value === null || Array.isArray(value) && value.every(key => attributeNames.includes(key)) },
  },
  parseDOM: [{ tag: 'a[href]', getAttrs(element) {
    const href = element.getAttribute('href');
    if (!isSafeURL(href)) return false;
    const keys = element.getAttributeNames().filter(key => attributeNames.includes(key));
    const canonical = attributeNames.filter(key => keys.includes(key));
    return { href, title: element.title, target: element.getAttribute('target'), rel: element.getAttribute('rel'),
      order: keys.every((key, index) => canonical[index] === key) ? null : keys };
  } }],
  toDOM: output,
  toHTML: output,
};

const linkOf = node => node.marks.find(mark => mark.type.name === 'link');
export function linkSelection(editor) {
  if (!editor?.editable) return null;
  const { doc, selection } = editor.state;
  if (!['text', 'range'].includes(selection.kind)) return null;
  const { path, endPath } = selection;
  const parentPath = path.slice(0, -1);
  if (!path.length || path.length !== endPath.length || !parentPath.every((part, i) => part === endPath[i])) return null;
  const parent = getNodeAtPath(doc, parentPath);
  let first = path.at(-1), last = endPath.at(-1), from = selection.from, to = selection.to;
  if (last >= parent.childCount || !parent.content.slice(first, last + 1).every(node => node.isText)) return null;
  const mark = linkOf(parent.child(first));
  if (mark && parent.content.slice(first, last + 1).every(node => linkOf(node)?.eq(mark))) {
    while (first > 0 && linkOf(parent.child(first - 1))?.eq(mark)) first--;
    while (last + 1 < parent.childCount && linkOf(parent.child(last + 1))?.eq(mark)) last++;
    from = 0;
    to = parent.child(last).text.length;
  }
  const runs = parent.content.slice(first, last + 1).map((node, i) =>
    node.withText(node.text.slice(i === 0 ? from : 0, first + i === last ? to : undefined)));
  return { doc, parent, parentPath, first, last, from, to, runs, text: runs.map(run => run.text).join(''),
    active: mark && parent.content.slice(first, last + 1).every(node => linkOf(node)?.eq(mark)) ? mark : null };
}

export function writeLink(editor, range, attrs, label) {
  if (!range || !editor?.editable || editor.state.doc !== range.doc) return false;
  const { parent, parentPath, first, last, from, to, text, runs } = range;
  const mark = attrs && editor.state.schema.mark('link', attrs);
  const start = parent.child(first), end = parent.child(last);
  const before = start.text.slice(0, from), after = end.text.slice(to);
  const parts = before ? [start.withText(before)] : [];
  if (label === text || !mark) {
    for (const node of runs) {
      if (!node.text) continue;
      const marks = node.marks.filter(m => m.type.name !== 'link');
      parts.push(node.withMarks(mark ? [mark, ...marks] : marks));
    }
  } else {
    parts.push(editor.state.schema.text(label, [mark]));
  }
  if (!parts.length) return false;
  const cursor = Selection.cursor([...parentPath, first + parts.length - 1], parts.at(-1).text.length);
  if (after) parts.push(end.withText(after));
  const siblings = [...parent.content.slice(0, first), ...parts, ...parent.content.slice(last + 1)];
  return editor.dispatch(editor.createTransaction().replaceNode(parentPath, [parent.copy(siblings)]).setSelection(cursor));
}
