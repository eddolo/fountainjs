import { describe, expect, it } from 'vitest';
import {
  CoreExtension,
  HistoryExtension,
  Schema,
  composeExtensions,
  createEditor,
  defineExtension,
  redo,
  undo,
} from '../src';
import {
  STRUCTURED_ATTRIBUTE_TRANSACTION_META,
  defineStructuredAttribute,
  deleteStructuredAttribute,
  deleteStructuredAttributeItems,
  getStructuredAttribute,
  insertStructuredAttributeItems,
  setStructuredAttribute,
  validateStructuredAttributeValue,
  type StructuredAttributeTransactionMeta,
} from '../src/structured-attributes';

const panelExtension = defineExtension({
  name: 'structured-panel',
  nodes: {
    structured_panel: {
      group: 'block',
      atom: true,
      attrs: {
        nodeId: { validate: (value) => typeof value === 'string' && value.length > 0 },
        config: {
          validate: (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
        },
      },
      validate: (node) => {
        const config = node.attrs.config as { layout?: { columns?: unknown } };
        return Number(config.layout?.columns) >= 1 && Number(config.layout?.columns) <= 6;
      },
      toDOM: () => ['div', { 'data-structured-panel': '' }, 'Panel'],
    },
  },
});

const configDefinition = defineStructuredAttribute({
  nodeType: 'structured_panel',
  attribute: 'config',
  root: 'object',
  validate: (value) => {
    const config = value as { title?: unknown };
    return typeof config.title === 'string' && config.title.trim() ? true : 'A panel title is required.';
  },
});

const content = {
  type: 'doc',
  content: [{
    type: 'structured_panel',
    attrs: {
      nodeId: 'panel-1',
      config: {
        title: 'Launch',
        layout: { columns: 2, compact: false },
        filters: [{ field: 'status', value: 'open' }],
        tags: ['release'],
      },
    },
  }],
} as const;

function kit() {
  return composeExtensions([CoreExtension, panelExtension, HistoryExtension]);
}

describe('structured attribute commands', () => {
  it('defines bounded portable contracts and rejects unsafe values', () => {
    expect(configDefinition).toMatchObject({
      nodeType: 'structured_panel',
      attribute: 'config',
      root: 'object',
      limits: { maxDepth: 32, maxEntries: 10_000 },
    });
    expect(Object.isFrozen(configDefinition)).toBe(true);
    expect(Object.isFrozen(configDefinition.limits)).toBe(true);

    const source = { title: 'Safe', nested: { enabled: true } };
    const report = validateStructuredAttributeValue(configDefinition, source);
    source.nested.enabled = false;
    expect(report).toMatchObject({ valid: true, value: { title: 'Safe', nested: { enabled: true } } });
    expect(Object.isFrozen(report.value)).toBe(true);
    expect(Object.isFrozen((report.value as { nested: object }).nested)).toBe(true);

    expect(validateStructuredAttributeValue(configDefinition, { title: 'Nope', value: Number.NaN }).valid).toBe(false);
    expect(validateStructuredAttributeValue(configDefinition, { title: 'Nope', value: new Date() }).valid).toBe(false);
    expect(validateStructuredAttributeValue(configDefinition, []).issues).toEqual([
      'Structured attribute config must have an object root.',
    ]);
    const circular: Record<string, unknown> = { title: 'Circular' };
    circular.self = circular;
    expect(validateStructuredAttributeValue(configDefinition, circular).valid).toBe(false);

    expect(() => defineStructuredAttribute({ nodeType: 'Bad name', attribute: 'config' })).toThrow('nodeType');
    expect(() => defineStructuredAttribute({ nodeType: 'panel', attribute: '__proto__' })).toThrow('attribute names');
    expect(() => defineStructuredAttribute({
      nodeType: 'panel', attribute: 'config', limits: { maxDepth: 101 },
    })).toThrow('maxDepth');
  });

  it('updates nested objects and arrays as one validated undoable transaction', () => {
    const composed = kit();
    const editor = createEditor({ schema: composed.schema, plugins: composed.plugins, content });
    let meta: StructuredAttributeTransactionMeta | undefined;
    let steps = 0;
    editor.subscribe((_state, transaction) => {
      meta = transaction.getMeta(STRUCTURED_ATTRIBUTE_TRANSACTION_META) as StructuredAttributeTransactionMeta | undefined;
      steps = transaction.steps.length;
    });

    expect(setStructuredAttribute(editor, [0], configDefinition, ['layout', 'columns'], 4)).toBe(true);
    expect((getStructuredAttribute(editor, [0], configDefinition) as any).layout.columns).toBe(4);
    expect(steps).toBe(1);
    expect(meta).toEqual({
      action: 'set',
      nodePath: [0],
      nodeType: 'structured_panel',
      attribute: 'config',
      path: ['layout', 'columns'],
    });
    expect(insertStructuredAttributeItems(editor, [0], configDefinition, ['filters'], 1, [
      { field: 'owner', value: 'ada' },
    ])).toBe(true);
    expect((editor.state.doc.child(0).attrs.config as any).filters).toHaveLength(2);
    expect(deleteStructuredAttribute(editor, [0], configDefinition, ['layout', 'compact'])).toBe(true);
    expect((editor.state.doc.child(0).attrs.config as any).layout).not.toHaveProperty('compact');
    expect(deleteStructuredAttributeItems(editor, [0], configDefinition, ['tags'], 0)).toBe(true);
    expect((editor.state.doc.child(0).attrs.config as any).tags).toEqual([]);

    expect(undo(editor)).toBe(true);
    expect((editor.state.doc.child(0).attrs.config as any).tags).toEqual(['release']);
    expect(redo(editor)).toBe(true);
    expect((editor.state.doc.child(0).attrs.config as any).tags).toEqual([]);
  });

  it('fails closed for stale paths, invalid roots, unsafe keys, schema violations, and read-only state', () => {
    const composed = kit();
    const editor = createEditor({ schema: composed.schema, plugins: composed.plugins, content });
    const before = editor.getJSON();

    expect(setStructuredAttribute(editor, [99], configDefinition, ['title'], 'Missing')).toBe(false);
    expect(setStructuredAttribute(editor, [0], configDefinition, ['missing', 'child'], true)).toBe(false);
    expect(setStructuredAttribute(editor, [0], configDefinition, ['__proto__'], {})).toBe(false);
    expect(setStructuredAttribute(editor, [0], configDefinition, ['layout', 'columns'], 0)).toBe(false);
    expect(setStructuredAttribute(editor, [0], configDefinition, ['title'], '')).toBe(false);
    expect(deleteStructuredAttribute(editor, [0], configDefinition, [])).toBe(false);
    expect(insertStructuredAttributeItems(editor, [0], configDefinition, ['filters'], 50, [{}])).toBe(false);
    expect(deleteStructuredAttributeItems(editor, [0], configDefinition, ['filters'], 0, 50)).toBe(false);
    expect(editor.getJSON()).toEqual(before);

    const readOnly = createEditor({
      schema: composed.schema,
      plugins: composed.plugins,
      content,
      editable: false,
    });
    expect(setStructuredAttribute(readOnly, [0], configDefinition, ['title'], 'Blocked')).toBe(false);
    expect(readOnly.getJSON()).toEqual(before);
  });

  it('keeps ordinary Fountain JSON exact', () => {
    const composed = kit();
    const editor = createEditor({ schema: composed.schema, plugins: composed.plugins, content });
    expect(setStructuredAttribute(editor, [0], configDefinition, ['filters', 0, 'value'], 'closed')).toBe(true);
    const json = editor.getJSON();
    const schema = new Schema(composed.schema);
    expect(schema.nodeFromJSON(json).toJSON()).toEqual(json);
    expect((json.content?.[0]?.attrs?.config as any).filters[0].value).toBe('closed');
  });
});
