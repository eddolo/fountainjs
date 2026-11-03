import { performance } from 'node:perf_hooks';
import { CoreExtension, Schema, composeExtensions, createEditor, createCollaborationExtension } from '../dist/index.js';

const original = Schema.prototype.validate;
let validationMs = 0, validations = 0;
Schema.prototype.validate = function (...args) {
  const start = performance.now();
  try { return original.apply(this, args); }
  finally { validationMs += performance.now() - start; validations++; }
};
for (const size of [1000, 10000, 100000]) {
  let context;
  const kit = composeExtensions([CoreExtension, createCollaborationExtension({ adapter: () => ({ connect(value) { context = value; } }) })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins,
    content: { type: 'doc', content: Array.from({ length: size }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `Paragraph ${i}` }] })) } });
  let offset = `Paragraph ${size - 1}`.length;
  for (let i = 0; i < 20; i++) context.applyRemoteTransaction(editor.state.createTransaction().insertText([size - 1, 0], offset++, '!'));
  validationMs = validations = 0;
  let createMs = 0, dispatchMs = 0;
  const count = size === 100000 ? 100 : 500;
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    const tr = editor.state.createTransaction().insertText([size - 1, 0], offset++, '!');
    const created = performance.now();
    if (!context.applyRemoteTransaction(tr)) throw new Error('Rejected edit');
    createMs += created - start;
    dispatchMs += performance.now() - created;
  }
  console.log(JSON.stringify({ size, count, createMeanMs: createMs / count, dispatchMeanMs: dispatchMs / count,
    validationMeanMs: validationMs / count, validationsPerEdit: validations / count }));
  editor.destroy();
}
