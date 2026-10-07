import { describe, expect, it, vi } from 'vitest';
import {
  CoreSchemaSpec, Node, Schema, Selection, createEditor, createHistoryPlugin,
  insertText, redo, undo,
} from '../src';
import { freezeAttributes } from '../src/core/schema/node-spec';

describe('attribute allocation and deep immutability', () => {
  it('does not allocate ancestor sets for primitive attribute values', () => {
    const OriginalSet = globalThis.Set;
    let allocations = 0;
    globalThis.Set = new Proxy(OriginalSet, { construct(target, args) {
      allocations++;
      return Reflect.construct(target, args);
    } });
    let attrs;
    try { attrs = freezeAttributes({ text: 'Literal', zero: 0, flag: false, nil: null, optional: undefined }); }
    finally { globalThis.Set = OriginalSet; }
    expect(allocations).toBe(0);
    expect(attrs).toEqual({ text: 'Literal', zero: 0, flag: false, nil: null, optional: undefined });
    expect(Object.isFrozen(attrs)).toBe(true);
  });

  it('clones/freezes portable aliases without freezing the caller or mistaking siblings for cycles', () => {
    const shared = { nested: ['α', { literal: 'value\r\n\u200b' }] };
    const supplied = { first: shared, second: shared };
    const attrs = freezeAttributes(supplied) as typeof supplied;
    expect(attrs).toEqual(supplied);
    expect(attrs.first).not.toBe(shared);
    expect(attrs.second).not.toBe(shared);
    expect(Object.isFrozen(attrs.first)).toBe(true);
    expect(Object.isFrozen(attrs.first.nested)).toBe(true);
    expect(Object.isFrozen(attrs.first.nested[1])).toBe(true);
    expect(Object.isFrozen(supplied)).toBe(false);
    expect(Object.isFrozen(shared)).toBe(false);
    shared.nested.push('Caller change');
    expect(attrs.first.nested).toHaveLength(2);
    expect(attrs.second.nested).toHaveLength(2);
  });

  it('still rejects real object/array cycles and preserves non-portable instance identity', () => {
    const object: Record<string, unknown> = {}; object.self = object;
    const array: unknown[] = []; array.push(array);
    expect(() => freezeAttributes({ value: object })).toThrow('cannot contain circular values');
    expect(() => freezeAttributes({ value: array })).toThrow('cannot contain circular values');
    class MutableState { value = 'Original'; }
    const state = new MutableState();
    const attrs = freezeAttributes({ state });
    expect(attrs.state).toBe(state);
    expect(Object.isFrozen(state)).toBe(false);
    state.value = 'Changed';
    expect((attrs.state as MutableState).value).toBe('Changed');
  });
});

describe('native model snapshot integrity', () => {
  it('compares shared sibling identity without invoking deep equality on every block', () => {
    const schema = new Schema(CoreSchemaSpec);
    const doc = schema.node('doc', {}, Array.from({ length: 1000 }, () =>
      schema.node('paragraph', {}, [schema.text('Original')])));
    const content = [...doc.content];
    content[999] = content[999]!.copy([schema.text('Changed')]);
    const edited = doc.copy(content);
    const eq = vi.spyOn(Node.prototype, 'eq');
    let equal; let calls;
    try { equal = doc.eq(edited); calls = eq.mock.calls.length; }
    finally { eq.mockRestore(); }
    expect(equal).toBe(false);
    expect(calls).toBe(3);
    expect(doc.eq(schema.nodeFromJSON(doc.toJSON()))).toBe(true);
    expect(doc.eq(doc.withAttrs({ title: 'Different' }))).toBe(false);
    const marked = [...doc.content];
    marked[999] = marked[999]!.copy([schema.text('Original', [schema.mark('em')])]);
    expect(doc.eq(doc.copy(marked))).toBe(false);
    expect(doc.eq(new Schema(CoreSchemaSpec).nodeFromJSON(doc.toJSON()))).toBe(false);
  });

  it('validates edited shared documents without per-child map allocations', () => {
    const schema = new Schema(CoreSchemaSpec);
    const doc = schema.node('doc', {}, Array.from({ length: 1000 }, () =>
      schema.node('paragraph', {}, [schema.text('Original')])));
    schema.validate(doc);
    const content = [...doc.content];
    content[999] = content[999]!.copy([schema.text('Changed')]);
    const edited = doc.copy(content);
    const map = vi.spyOn(Array.prototype, 'map');
    let allocations;
    try { schema.validate(edited); allocations = map.mock.calls.length; }
    finally { map.mockRestore(); }
    expect(allocations).toBe(0);
    expect(edited.child(0)).toBe(doc.child(0));
    expect(edited.child(999).textContent).toBe('Changed');
  });

  it('revalidates mutable host attributes and checks siblings after an uncacheable child', () => {
    const schema = new Schema({ nodes: {
      doc: { content: 'block*' }, text: { inline: true },
      paragraph: { group: 'block', content: 'text*', attrs: {
        hostDate: { default: undefined, validate: value => value instanceof Date && value.getTime() === 0 },
      } },
    } });
    const date = new Date(0);
    const mutable = schema.node('paragraph', { hostDate: date }, [schema.text('Host value')]);
    const doc = schema.node('doc', {}, [mutable]);
    schema.validate(doc);
    date.setTime(1);
    expect(() => schema.validate(doc)).toThrow('Invalid value for attribute: hostDate');
    date.setTime(0);
    const foreign = new Schema(CoreSchemaSpec);
    const bad = schema.node('doc', {}, [mutable, foreign.node('paragraph', {}, [foreign.text('Foreign')])]);
    expect(() => schema.validate(bad)).toThrow('Foreign node at 1.');
  });

  const fields = ['type', 'attrs', 'content', 'text', 'marks'] as const;
  for (const field of fields) {
    it(`locks the node ${field} field against assignment, deletion and redefinition`, () => {
      const schema = new Schema(CoreSchemaSpec);
      const text = schema.text('Original', [schema.mark('em')]);
      const original = text.toJSON();
      const value = text[field];
      expect(Reflect.set(text, field, null)).toBe(false);
      expect(Reflect.deleteProperty(text, field)).toBe(false);
      expect(Reflect.defineProperty(text, field, { value: null })).toBe(false);
      expect(text[field]).toBe(value);
      expect(text.toJSON()).toEqual(original);
      expect(Object.isFrozen(text)).toBe(true);
    });
  }
  for (const field of ['type', 'attrs'] as const) {
    it(`locks the mark ${field} field`, () => {
      const schema = new Schema(CoreSchemaSpec);
      const mark = schema.mark('link', { href: '/allowed' });
      const original = mark.toJSON();
      expect(Reflect.set(mark, field, null)).toBe(false);
      expect(Reflect.deleteProperty(mark, field)).toBe(false);
      expect(Reflect.defineProperty(mark, field, { value: null })).toBe(false);
      expect(mark.toJSON()).toEqual(original);
      expect(Object.isFrozen(mark)).toBe(true);
    });
  }

  it('cannot change a cached child to a foreign schema, and still rejects genuinely foreign children/marks', () => {
    const schema = new Schema(CoreSchemaSpec);
    const foreign = new Schema(CoreSchemaSpec);
    const text = schema.text('Owned');
    schema.validate(schema.node('doc', {}, [schema.node('paragraph', {}, [text])]));
    expect(Reflect.set(text, 'type', foreign.nodes.text)).toBe(false);
    expect(() => schema.validate(schema.node('doc', {}, [schema.node('paragraph', {}, [text])]))).not.toThrow();
    expect(() => schema.validate(schema.node('doc', {}, [schema.node('paragraph', {}, [foreign.text('Foreign')])]))).toThrow('Foreign node');
    expect(() => schema.validate(schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Foreign mark', [foreign.mark('em')])])]))).toThrow('Foreign mark');
  });

  it('preserves old state, normal editing, one-step undo/redo and native JSON reopening after attempted mutation', () => {
    const update = vi.fn();
    const editor = createEditor({
      schema: CoreSchemaSpec, plugins: [createHistoryPlugin()], onUpdate: update,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original' }] }] },
    });
    try {
      const snapshot = editor.state;
      const before = snapshot.doc.toJSON();
      expect(Reflect.set(snapshot.doc.child(0).child(0), 'text', 'Tampered')).toBe(false);
      expect(Reflect.set(snapshot.doc, 'content', [])).toBe(false);
      expect(update).not.toHaveBeenCalled();
      editor.dispatch(editor.state.createTransaction().setSelection(new Selection([0, 0], 8)));
      expect(insertText(editor, '!')).toBe(true);
      expect(editor.getText()).toBe('Original!');
      expect(snapshot.doc.toJSON()).toEqual(before);
      expect(undo(editor)).toBe(true);
      expect(editor.getText()).toBe('Original');
      expect(redo(editor)).toBe(true);
      expect(editor.getText()).toBe('Original!');
      expect(editor.state.schema.nodeFromJSON(editor.getJSON()).toJSON()).toEqual(editor.getJSON());
    } finally { editor.destroy(); }
  });

  it('keeps functional update methods usable without modifying their original node', () => {
    const schema = new Schema(CoreSchemaSpec);
    const original = schema.text('Original');
    expect(original.withText('Changed').text).toBe('Changed');
    expect(original.withMarks([schema.mark('strong')]).marks[0].type.name).toBe('strong');
    const paragraph = schema.node('paragraph', {}, [original]);
    expect(paragraph.withAttrs({ align: 'right' }).attrs.align).toBe('right');
    expect(paragraph.copy([schema.text('Replacement')]).textContent).toBe('Replacement');
    expect(original.text).toBe('Original');
    expect(original.marks).toEqual([]);
    expect(paragraph.attrs.align).toBe('left');
  });

  it('does not cache mutable non-portable values merely because their containing node is frozen', () => {
    class MutableFlag { valid = true; }
    const schema = new Schema({ nodes: {
      doc: { content: 'widget' }, text: { inline: true },
      widget: { attrs: { state: { validate: value => value instanceof MutableFlag } },
        validate: node => (node.attrs.state as MutableFlag).valid },
    } });
    const flag = new MutableFlag();
    const doc = schema.node('doc', {}, [schema.node('widget', { state: flag })]);
    schema.validate(doc);
    flag.valid = false;
    expect(() => schema.validate(doc)).toThrow('Invalid node invariant: widget');
  });
});

describe('owned portable model attributes', () => {
  it('retains native text attributes and validates supplied values rather than replacing them with defaults on reopen', () => {
    const schema = new Schema({ nodes: {
      doc: { content: 'paragraph' }, paragraph: { content: 'text*' },
      text: { inline: true, attrs: { sourceLanguage: { validate: value => value === 'verbatim' } } },
    } });
    const text = schema.nodes.text.create({ sourceLanguage: 'verbatim', metadata: { origin: 'author' } }, [], 'Literal\r\n\u200b');
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [text])]);
    expect(schema.nodeFromJSON(JSON.parse(JSON.stringify(doc.toJSON()))).toJSON()).toEqual(doc.toJSON());
    expect(() => schema.nodeFromJSON({ type: 'text', text: 'Literal', attrs: { sourceLanguage: 'wrong' } })).toThrow('Invalid value for attribute: sourceLanguage');
  });

  const keys = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf',
    'isPrototypeOf', 'propertyIsEnumerable', '__defineGetter__', '__defineSetter__',
    '__lookupGetter__', '__lookupSetter__', 'toLocaleString', 'toJSON', 'metadata', '', '标签'];
  const values = [null, false, 0, 'literal\u200b\r\ntext',
    JSON.parse('{"constructor":"nested","__proto__":{"ordinary":true}}'), ['α', '\ufeff', 'line\r\nend']];
  for (const key of keys) {
    it(`retains own ${JSON.stringify(key)} data in node/mark attributes and native JSON reopening`, () => {
      const schema = new Schema(CoreSchemaSpec);
      for (const value of values) {
        const supplied = Object.fromEntries([[key, value]]);
        const paragraph = schema.node('paragraph', supplied, [schema.text('Text')]);
        const mark = schema.mark('em', supplied);
        const text = schema.text('Literal\r\n\u200b').withAttrs(supplied);
        for (const [actual, expected] of [
          [paragraph.attrs, { align: 'left', ...supplied }],
          [mark.attrs, supplied],
          [schema.nodeFromJSON(JSON.parse(JSON.stringify(paragraph.toJSON()))).attrs, { align: 'left', ...supplied }],
          [schema.markFromJSON(JSON.parse(JSON.stringify(mark.toJSON()))).attrs, supplied],
          [text.attrs, supplied],
          [schema.nodeFromJSON(JSON.parse(JSON.stringify(text.toJSON()))).attrs, supplied],
        ]) {
          expect(actual).toEqual(expected);
          expect(Object.hasOwn(actual, key)).toBe(true);
          expect(Object.getPrototypeOf(actual)).toBe(Object.prototype);
          expect(Object.isFrozen(actual)).toBe(true);
        }
      }
    });
  }

  it('does not read inherited supplied attributes as default overrides or required values', () => {
    const schema = new Schema(CoreSchemaSpec);
    const heading = schema.node('heading', Object.create({ level: 6, align: 'right' }), [schema.text('Title')]);
    expect(heading.attrs).toMatchObject({ level: 1, align: 'left' });
    expect(() => schema.mark('link', Object.create({ href: '/inherited' }))).toThrow('Missing required attribute: href');
    expect(() => schema.node('image_super', Object.create({ src: '/inherited.png' }))).toThrow('Invalid value for attribute: src');
    const required = new Schema({ nodes: {
      doc: { content: 'widget' }, text: { inline: true }, widget: { attrs: { value: {} } },
    } });
    expect(() => required.node('widget', Object.create({ value: 'Inherited' }))).toThrow('Missing required attribute: value');
    expect(schema.mark('em', Object.create({ unknown: 'inherited' })).attrs).toEqual({});
  });

  it('validates declared reserved keys, uses their own defaults and preserves explicit optional absence', () => {
    const attrs = Object.fromEntries(keys.map(key => [key, { default: 'Default', validate: (value: unknown) => typeof value === 'string' }]));
    const schema = new Schema({ nodes: {
      doc: { content: 'widget' }, text: { inline: true }, widget: { attrs },
    }, marks: { tag: { attrs }, optional: { attrs: { value: { default: undefined } } } } });
    const expected = Object.fromEntries(keys.map(key => [key, 'Default']));
    expect(schema.node('widget').attrs).toEqual(expected);
    expect(schema.mark('tag').attrs).toEqual(expected);
    for (const key of keys) {
      expect(schema.node('widget', Object.fromEntries([[key, 'Own']])).attrs[key]).toBe('Own');
      expect(schema.mark('tag', Object.fromEntries([[key, 'Own']])).attrs[key]).toBe('Own');
      expect(() => schema.node('widget', Object.fromEntries([[key, false]]))).toThrow('Invalid value for attribute');
      expect(() => schema.mark('tag', Object.fromEntries([[key, false]]))).toThrow('Invalid value for attribute');
    }
    expect(schema.mark('optional').attrs).toEqual({});
    expect(Object.hasOwn(schema.mark('optional').attrs, 'value')).toBe(false);
  });
});
