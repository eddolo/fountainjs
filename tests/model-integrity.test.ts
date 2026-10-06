import { describe, expect, it, vi } from 'vitest';
import {
  CoreSchemaSpec, Schema, Selection, createEditor, createHistoryPlugin,
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
