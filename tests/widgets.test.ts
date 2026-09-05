import { describe, expect, it } from 'vitest';
import {
  CoreExtension,
  HTMLExporter,
  HistoryExtension,
  NodeSelection,
  Schema,
  Selection,
  composeExtensions,
  createEditor,
  redo,
  undo,
} from '../src';
import {
  WIDGET_TRANSACTION_META,
  createWidgetController,
  createWidgetExtension,
  defineWidget,
  exitWidget,
  getWidgetNode,
  insertWidget,
  updateWidget,
  validateWidgetAttributes,
  type WidgetTransactionMeta,
} from '../src/widgets';

const statusWidget = defineWidget({
  name: 'status_field',
  label: 'Incident status',
  attributes: {
    status: {
      default: 'Investigating',
      validate: (value) => value === 'Investigating' || value === 'Resolved',
    },
    owner: { default: '' },
  },
  validate: ({ attributes }) => (
    attributes.status === 'Resolved' && !String(attributes.owner).trim()
      ? 'Resolved incidents require an owner.'
      : true
  ),
  toText: (node) => `${String(node.attrs.status)} · ${String(node.attrs.owner)}`,
});

function paragraph(value: string) {
  return { type: 'paragraph', content: [{ type: 'text', text: value }] } as const;
}

function statusContent(attrs: Record<string, unknown> = {}) {
  return {
    type: 'doc',
    content: [
      paragraph('Before'),
      { type: 'status_field', attrs: { status: 'Investigating', owner: '', nodeId: 'stable-status', ...attrs } },
      paragraph('After'),
    ],
  } as const;
}

function statusKit() {
  return composeExtensions([CoreExtension, createWidgetExtension(statusWidget), HistoryExtension]);
}

describe('portable interactive widgets', () => {
  it('defines an immutable schema contract with defaults and useful validation issues', () => {
    expect(statusWidget).toMatchObject({
      name: 'status_field',
      label: 'Incident status',
      inline: false,
      atom: true,
      keyPolicy: { Tab: 'cycle', Enter: 'allow', Escape: 'select' },
    });
    expect(Object.isFrozen(statusWidget)).toBe(true);
    expect(Object.isFrozen(statusWidget.attributes)).toBe(true);
    expect(Object.isFrozen(statusWidget.attributes.status)).toBe(true);
    expect(Object.isFrozen(statusWidget.keyPolicy)).toBe(true);
    expect(validateWidgetAttributes(statusWidget, {}).attributes).toMatchObject({
      status: 'Investigating', owner: '',
    });
    expect(validateWidgetAttributes(statusWidget, { status: 'Resolved', owner: '' })).toMatchObject({
      valid: false,
      issues: ['Resolved incidents require an owner.'],
    });
    expect(validateWidgetAttributes(statusWidget, { status: 'Unknown' })).toMatchObject({
      valid: false,
      issues: ['Invalid widget attribute: status.'],
    });

    expect(() => defineWidget({ name: 'Not Safe' })).toThrow('Widget names');
    expect(() => defineWidget({ name: 'unsafe', attributes: { constructor: {} } })).toThrow('Unsafe widget attribute');
    expect(() => defineWidget({ name: 'bad_atom', atom: true, content: 'block+' })).toThrow('cannot be atomic');
    expect(() => defineWidget({ name: 'bad_key', keyPolicy: { Tab: 'invalid' as never } })).toThrow('Widget key actions');

    const defaultState = { phase: 'draft' };
    const mutableSpec = { default: defaultState as { phase: string } };
    const snapshotted = defineWidget({ name: 'snapshotted', attributes: { state: mutableSpec } });
    mutableSpec.default = { phase: 'replaced' };
    defaultState.phase = 'changed after definition';
    expect(snapshotted.attributes.state?.default).toEqual({ phase: 'draft' });
    expect(Object.isFrozen(snapshotted.attributes.state?.default)).toBe(true);
  });

  it('updates portable state in one transaction, validates it, protects identity, and undoes cleanly', () => {
    const kit = statusKit();
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: statusContent() });
    let transactionMeta: WidgetTransactionMeta | undefined;
    let stepCount = 0;
    editor.subscribe((_state, transaction) => {
      transactionMeta = transaction.getMeta(WIDGET_TRANSACTION_META) as WidgetTransactionMeta | undefined;
      stepCount = transaction.steps.length;
    });

    expect(updateWidget(editor, statusWidget, [1], { status: 'Resolved' })).toBe(false);
    expect(updateWidget(editor, statusWidget, [1], { status: 'Resolved', owner: 'Ada' })).toBe(true);
    expect(getWidgetNode(editor, statusWidget, [1])?.attrs).toMatchObject({
      status: 'Resolved', owner: 'Ada', nodeId: 'stable-status',
    });
    expect(stepCount).toBe(1);
    expect(transactionMeta).toEqual({
      action: 'update',
      widget: 'status_field',
      path: [1],
      attributes: ['status', 'owner'],
    });
    expect(updateWidget(editor, statusWidget, [1], { nodeId: 'replacement' })).toBe(false);
    expect(updateWidget(editor, statusWidget, [1], { owner: 'Ada' })).toBe(false);

    expect(undo(editor)).toBe(true);
    expect(getWidgetNode(editor, statusWidget, [1])?.attrs).toMatchObject({ status: 'Investigating', owner: '' });
    expect(redo(editor)).toBe(true);
    expect(getWidgetNode(editor, statusWidget, [1])?.attrs).toMatchObject({ status: 'Resolved', owner: 'Ada' });
  });

  it('exposes a mapped-path controller without private renderer state', () => {
    const kit = statusKit();
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: statusContent() });
    let path = [1];
    const controller = createWidgetController(editor, statusWidget, () => path);

    expect(controller.getAttributes()).toMatchObject({ status: 'Investigating' });
    expect(controller.validate({ status: 'Resolved' }).issues).toEqual(['Resolved incidents require an owner.']);
    expect(controller.set('owner', 'Grace')).toBe(true);
    expect(controller.set('status', 'Resolved')).toBe(true);
    expect(controller.getAttributes()).toMatchObject({ status: 'Resolved', owner: 'Grace' });

    const paragraphType = editor.state.schema.nodes.paragraph;
    const inserted = paragraphType?.create({}, [editor.state.schema.text('Inserted')]);
    expect(inserted).toBeTruthy();
    editor.dispatch(editor.state.createTransaction().replace(0, 0, [inserted!]));
    path = [2];
    expect(controller.getNode()?.type.name).toBe('status_field');
    expect(controller.getPath()).toEqual([2]);
    expect(controller.remove()).toBe(true);
    expect(controller.getNode()).toBeNull();
  });

  it('hands selection to the previous, next, or widget node through model paths', () => {
    const kit = statusKit();
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: statusContent() });

    expect(exitWidget(editor, statusWidget, [1], 'before')).toBe(true);
    expect(editor.state.selection).toMatchObject({ kind: 'text', path: [0, 0], from: 6 });
    expect(exitWidget(editor, statusWidget, [1], 'after')).toBe(true);
    expect(editor.state.selection).toMatchObject({ kind: 'text', path: [2, 0], from: 0 });
    expect(exitWidget(editor, statusWidget, [1], 'select')).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).nodePath).toEqual([1]);
    expect(exitWidget(editor, statusWidget, [99], 'select')).toBe(false);
  });

  it('inserts block and inline widgets with an explicit model selection', () => {
    const mentionWidget = defineWidget({
      name: 'person_chip',
      inline: true,
      label: 'Person',
      attributes: { personId: { validate: (value) => typeof value === 'string' && value.length > 0 } },
      toText: (node) => `@${String(node.attrs.personId)}`,
    });
    const kit = composeExtensions([
      CoreExtension,
      createWidgetExtension(statusWidget),
      createWidgetExtension(mentionWidget),
      HistoryExtension,
    ]);
    const inline = createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: [paragraph('Hello world')] } });
    inline.dispatch(inline.state.createTransaction().setSelection(Selection.cursor([0, 0], 6)));
    expect(insertWidget(inline, mentionWidget, { personId: 'ada' })).toBe(true);
    expect(inline.state.doc.child(0).content.map((node) => node.type.name)).toEqual(['text', 'person_chip', 'text']);
    expect(inline.state.doc.child(0).textContent).toBe('Hello @adaworld');
    expect((inline.state.selection as NodeSelection).nodePath).toEqual([0, 1]);

    const block = createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: [paragraph('Start')] } });
    block.dispatch(block.state.createTransaction().setSelection(Selection.cursor([0, 0], 5)));
    expect(insertWidget(block, statusWidget, { owner: 'Ada' })).toBe(true);
    expect(block.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'status_field', 'paragraph']);
    expect((block.state.selection as NodeSelection).nodePath).toEqual([1]);
    expect(undo(block)).toBe(true);
    expect(block.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph']);
  });

  it('round-trips widget state through JSON and remains inert in a read-only editor', () => {
    const kit = statusKit();
    const schema = new Schema(kit.schema);
    const source = schema.nodeFromJSON(statusContent({ owner: 'Lin' }));
    expect(schema.nodeFromJSON(source.toJSON()).toJSON()).toEqual(source.toJSON());

    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: source.toJSON(),
      editable: false,
    });
    const controller = createWidgetController(editor, statusWidget, () => [1]);
    expect(controller.editable).toBe(false);
    expect(controller.update({ owner: 'Changed' })).toBe(false);
    expect(controller.remove()).toBe(false);
    expect(controller.getAttributes()?.owner).toBe('Lin');
  });

  it('fails explicitly instead of silently losing oversized widget state in HTML', () => {
    const largeWidget = defineWidget({
      name: 'large_widget',
      attributes: { payload: { default: '' } },
    });
    const kit = composeExtensions([CoreExtension, createWidgetExtension(largeWidget)]);
    const schema = new Schema(kit.schema);
    const document = schema.nodeFromJSON({
      type: 'doc',
      content: [{ type: 'large_widget', attrs: { payload: 'x'.repeat(70_000) } }],
    });

    expect(() => HTMLExporter.export(document, { document: false }))
      .toThrow('Widget large_widget HTML state exceeds 65536 characters.');
  });
});
