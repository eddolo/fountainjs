import * as Y from 'yjs';
import { Editor as Tiptap } from '@tiptap/core';
import TipKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import { EditorView, StarterKit, createEditor, composeExtensions } from 'fountainjs-editor';
import { createYjsCollaborationExtension } from 'fountainjs-editor/yjs';

const params = new URLSearchParams(location.search);
const engine = params.get('engine');
const size = Number(params.get('size'));
const index = Number(params.get('index'));
const mode = params.get('mode');
const doc = new Y.Doc();
const mount = document.querySelector('main');
let editor, view, activeSample;
const updates = [];
const content = { type: 'doc', content: Array.from({ length: size }, (_, i) => ({
  type: 'paragraph', content: [{ type: 'text', text: 'Paragraph ' + i }],
})) };
const seed = mode === 'write' ? null : new Uint8Array(await (await fetch('/capture/seed')).arrayBuffer());
const seedStart = performance.now();
if (seed) Y.applyUpdate(doc, seed);
const seedApplyMs = performance.now() - seedStart;

function openEditor(withView) {
  if (engine === 'tiptap') {
    editor = new Tiptap({ element: mount, extensions: [
      TipKit.configure({ history: false }), Collaboration.configure({ document: doc }),
    ] });
    if (mode === 'write') editor.commands.setContent(content);
    return;
  }
  const kit = composeExtensions([...StarterKit.extensions.filter(e => e.name !== 'history'),
    createYjsCollaborationExtension({ document: doc, user: { id: mode, name: mode, color: '#5566aa' } })]);
  editor = createEditor({ schema: kit.schema, plugins: kit.plugins, ...(mode === 'write' ? { content } : {}) });
  if (withView) {
    editor.subscribe(() => { if (activeSample) activeSample.starts.push(performance.now()); });
    view = new EditorView(mount, editor);
    editor.subscribe(() => { if (activeSample) activeSample.ends.push(performance.now()); });
  }
}
const openStart = performance.now();
if (mode !== 'raw') openEditor(mode !== 'model');
const openMs = performance.now() - openStart;
const frame = () => new Promise(done => requestAnimationFrame(() => setTimeout(done, 0)));
const bytes = value => Array.from(value);
window.study = {
  async start() {
    await fetch('/capture/seed', { method: 'POST', body: Y.encodeStateAsUpdate(doc) });
    doc.on('update', update => updates.push(bytes(update)));
  },
  finish() {
    return { updates, json: editor.getJSON(), vector: bytes(Y.encodeStateVector(doc)) };
  },
  async apply(wire, word) {
    const samples = [];
    for (const [i, update] of wire.entries()) {
      await frame();
      const value = Uint8Array.from(update);
      const stamp = { starts: [], ends: [] };
      activeSample = stamp;
      const start = performance.now();
      Y.applyUpdate(doc, value);
      const end = performance.now();
      activeSample = undefined;
      if (stamp.starts.length !== stamp.ends.length) throw Error('Unpaired editor subscriber observations');
      const viewMs = stamp.ends.reduce((total, t, j) => total + t - stamp.starts[j], 0);
      samples.push({ applyMs: end - start, ...(mode === 'mounted' && engine === 'fountain' ? {
        viewSubscriberMs: viewMs, notifications: stamp.starts.length,
      } : {}) });
      if (mode !== 'raw') {
        const wanted = 'Paragraph ' + index + word.slice(0, i + 1);
        const node = editor.state.doc.child(index);
        if (node.textContent !== wanted) throw Error('Wrong live model after input ' + i);
        if (mode === 'mounted' && mount.querySelector('[contenteditable=true]').children[index].textContent !== wanted) {
          throw Error('Wrong live DOM after input ' + i);
        }
      }
    }
    const vector = bytes(Y.encodeStateVector(doc));
    if (mode === 'raw') openEditor(true);
    return { samples, vector, seedApplyMs, openMs, json: editor.getJSON(), visibility: document.visibilityState };
  },
};
