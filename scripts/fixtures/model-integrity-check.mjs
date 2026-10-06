// Exercise each actual consumer's constructors, not a separate model oracle.
// Deliberately avoid Node built-ins so this also runs in workerd.
export function checkModelIntegrity(core, spec = core.CoreSchemaSpec) {
  for (const name of ['window', 'document', 'DOMParser']) {
    if (name in globalThis) throw new Error(`Model runtime unexpectedly exposes ${name}.`);
  }
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const schema = new core.Schema(spec);
  const text = schema.text('Original', [schema.mark('em')]);
  const mark = text.marks[0];
  for (const [object, fields] of [[text, ['type', 'attrs', 'content', 'text', 'marks']], [mark, ['type', 'attrs']]]) {
    const original = JSON.stringify(object.toJSON());
    for (const field of fields) {
      assert(!Reflect.set(object, field, null), `Writable model field: ${field}`);
      assert(!Reflect.deleteProperty(object, field), `Deletable model field: ${field}`);
      assert(!Reflect.defineProperty(object, field, { value: null }), `Redefinable model field: ${field}`);
    }
    assert(Object.isFrozen(object) && JSON.stringify(object.toJSON()) === original, 'Native snapshot changed');
  }
  const owned = schema.node('doc', {}, [schema.node('paragraph', {}, [text])]);
  schema.validate(owned);
  const foreign = new core.Schema(spec);
  assert(!Reflect.set(text, 'type', foreign.nodes.text), 'Cached child ownership changed');
  schema.validate(schema.node('doc', {}, [schema.node('paragraph', {}, [text])]));
  let foreignRejected = false;
  try { schema.validate(schema.node('doc', {}, [schema.node('paragraph', {}, [foreign.text('Foreign')])])); }
  catch { foreignRejected = true; }
  assert(foreignRejected, 'Genuinely foreign child accepted');

  const keys = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'isPrototypeOf',
    'propertyIsEnumerable', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
    'toLocaleString', 'toJSON', 'metadata', '', '标签'];
  const values = [null, false, 0, 'literal\u200b\r\ntext',
    JSON.parse('{"constructor":"nested","__proto__":{"ordinary":true}}'), ['α', '\ufeff', 'line\r\nend']];
  let checked = 0;
  for (const key of keys) for (const value of values) {
    const supplied = Object.fromEntries([[key, value]]);
    const node = schema.node('paragraph', supplied, [schema.text('Text')]);
    const tag = schema.mark('em', supplied);
    const literal = schema.text('Literal\r\n\u200b').withAttrs(supplied);
    for (const [actual, expected] of [
      [node.attrs, { align: 'left', ...supplied }], [tag.attrs, supplied],
      [schema.nodeFromJSON(JSON.parse(JSON.stringify(node.toJSON()))).attrs, { align: 'left', ...supplied }],
      [schema.markFromJSON(JSON.parse(JSON.stringify(tag.toJSON()))).attrs, supplied],
      [literal.attrs, supplied],
      [schema.nodeFromJSON(JSON.parse(JSON.stringify(literal.toJSON()))).attrs, supplied],
    ]) {
      assert(Object.hasOwn(actual, key) && JSON.stringify(actual) === JSON.stringify(expected), `Lost own attribute ${key}`);
      assert(Object.getPrototypeOf(actual) === Object.prototype && Object.isFrozen(actual), 'Changed public attribute shape');
      checked++;
    }
  }
  let inheritedRejected = false;
  try { schema.mark('link', Object.create({ href: '/inherited' })); } catch { inheritedRejected = true; }
  assert(inheritedRejected, 'Inherited value satisfied a required field');
  assert(schema.node('heading', Object.create({ level: 6 })).attrs.level === 1, 'Inherited value overrode a default');

  const editor = core.createEditor({ schema: spec, plugins: [core.createHistoryPlugin()], content: owned.toJSON() });
  try {
    const snapshot = editor.state.doc;
    const original = JSON.stringify(snapshot.toJSON());
    assert(!Reflect.set(snapshot.child(0).child(0), 'text', 'Tampered'), 'Historical text replaced');
    editor.dispatch(editor.state.createTransaction().setSelection(new core.Selection([0, 0], 8)));
    assert(core.insertText(editor, '!') && editor.getText() === 'Original!', 'Ordinary editing failed');
    assert(JSON.stringify(snapshot.toJSON()) === original, 'Old snapshot changed after editing');
    assert(core.undo(editor) && editor.getText() === 'Original', 'Undo failed');
    assert(core.redo(editor) && editor.getText() === 'Original!', 'Redo failed');
  } finally { editor.destroy(); }

  class MutableFlag { valid = true; }
  const mutable = new core.Schema({ nodes: {
    doc: { content: 'widget' }, text: { inline: true },
    widget: { attrs: { state: { validate: value => value instanceof MutableFlag } }, validate: node => node.attrs.state.valid },
  } });
  const flag = new MutableFlag();
  const document = mutable.node('doc', {}, [mutable.node('widget', { state: flag })]);
  mutable.validate(document);
  flag.valid = false;
  let mutableRejected = false;
  try { mutable.validate(document); } catch { mutableRejected = true; }
  assert(mutableRejected, 'Mutable non-portable attributes were falsely cached');
  const requiredText = new core.Schema({ nodes: {
    doc: { content: 'text*' }, text: { inline: true, attrs: { sourceLanguage: { validate: value => value === 'verbatim' } } },
  } });
  const source = { type: 'text', text: 'Literal\r\n\u200b', attrs: { sourceLanguage: 'verbatim', metadata: { origin: 'author' } } };
  const reopened = requiredText.nodeFromJSON(source).toJSON();
  // JSON object field order is not document meaning; compare each field.
  assert(reopened.type === source.type && reopened.text === source.text
    && JSON.stringify(reopened.attrs) === JSON.stringify(source.attrs), 'Text attributes lost on native reopen');
  let invalidTextRejected = false;
  try { requiredText.nodeFromJSON({ ...source, attrs: { sourceLanguage: 'wrong' } }); } catch { invalidTextRejected = true; }
  assert(invalidTextRejected, 'Text attributes bypassed schema validation');
  assert(checked === 576, 'Review intentional model-integrity fixture coverage changes');
  return checked;
}
