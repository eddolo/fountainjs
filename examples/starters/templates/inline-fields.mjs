import {
  resolveDocumentPoint,
  Selection,
  ReplaceNodeStep,
  StepMap,
  textPointToPosition,
} from 'fountainjs-editor/core';

export const validFieldKey = (key) =>
  typeof key === 'string' && /^[a-z][a-z0-9_]{0,47}$/.test(key) && !Object.hasOwn(Object.prototype, key);

export const templateFieldExtension = {
  name: 'template-fields',
  nodes: {
    template_field: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { key: { validate: validFieldKey } },
      toText: (node) => '{{' + node.attrs.key + '}}',
      toDOM: (node) => [
        'span',
        { 'data-template-field': node.attrs.key, contenteditable: 'false' },
        '{{' + node.attrs.key + '}}',
      ],
    },
  },
  commands: { insertTemplateField },
};

// Replacing a paragraph's children must leave anchors in its untouched prose intact.
class InsertFieldStep extends ReplaceNodeStep {
  constructor(path, paragraph, start, removed, inserted) {
    super(path, [paragraph]);
    this.fieldMap = new StepMap([start, removed, inserted]);
  }
  getMap() {
    return this.fieldMap;
  }
}

export function insertTemplateField(editor, key) {
  const { state } = editor;
  const { selection, schema } = state;
  const type = schema.nodes.template_field;
  if (!editor.editable || !type || !validFieldKey(key)) return false;
  const tr = state.createTransaction();
  const nodeAt = (path) => path.reduce((node, index) => node.child(index), state.doc);
  let after;
  if (selection.kind === 'text') {
    const { path, endPath, from, to } = selection;
    const parentPath = path.slice(0, -1);
    if (
      !parentPath.length ||
      endPath.length !== path.length ||
      parentPath.some((value, i) => value !== endPath[i])
    )
      return false;
    const parent = nodeAt(parentPath);
    const first = path.at(-1),
      last = endPath.at(-1);
    const runs = parent.content.slice(first, last + 1);
    if (!runs.length || runs.some((node) => !node.isText)) return false;
    const head = runs[0],
      tail = runs.at(-1);
    const prefix = head.text.slice(0, from);
    const slot = type.create({ key }, [], undefined, head.marks);
    const content = [
      ...parent.content.slice(0, first),
      ...(prefix ? [head.withText(prefix)] : []),
      slot,
      tail.withText(tail.text.slice(to)),
      ...parent.content.slice(last + 1),
    ];
    const start = textPointToPosition(state.doc, path, from);
    const removed = textPointToPosition(state.doc, endPath, to) - start;
    tr.step(new InsertFieldStep(parentPath, parent.copy(content), start, removed, slot.nodeSize));
    after = [...parentPath, first + (prefix ? 2 : 1)];
  } else {
    // An empty text block may have a node selection or a structural caret.
    const point =
      selection.kind === 'range' && selection.isCollapsed
        ? resolveDocumentPoint(state.doc, selection.head)
        : undefined;
    const path =
      selection.kind === 'node'
        ? selection.nodePath
        : point?.kind === 'boundary'
          ? point.parentPath
          : undefined;
    if (!path?.length) return false;
    const block = nodeAt(path);
    if (block.childCount || block.type.spec.atom || block.isText) return false;
    tr.replaceNode(path, [block.copy([type.create({ key }), schema.text('')])]);
    after = [...path, 1];
  }
  try {
    schema.validate(tr.doc);
  } catch {
    return false;
  }
  tr.setSelection(Selection.cursor(after, 0));
  return editor.dispatch(tr);
}

// The host supplies a full document and its own key lookup. Only content is
// traversed: unrelated attributes, marks, and extension data stay intact.
export function resolveTemplateFields(document, lookup) {
  function children(nodes) {
    return nodes.flatMap((node) => {
      if (node.type === 'template_field') {
        const key = node.attrs?.key;
        if (!validFieldKey(key)) throw new TypeError('Invalid inline field key.');
        const text = lookup(key);
        if (typeof text !== 'string') throw new TypeError('Expected a text answer for ' + key + '.');
        return text ? [{ type: 'text', text, ...(node.marks ? { marks: node.marks } : {}) }] : [];
      }
      return [node.content ? { ...node, content: children(node.content) } : node];
    });
  }
  return document.content ? { ...document, content: children(document.content) } : document;
}
