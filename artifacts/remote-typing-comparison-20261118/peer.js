import * as Y from 'yjs';
import { Editor as Tiptap } from '@tiptap/core';
import TipKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import { EditorView, StarterKit, createEditor, composeExtensions } from 'fountainjs-editor';
import { createYjsCollaborationExtension } from 'fountainjs-editor/yjs';

const query = new URLSearchParams(location.search);
const size = Number(query.get('size'));
const role = query.get('role');
const engine = query.get('engine');
const doc = new Y.Doc();
const link = new WebSocket('ws://' + location.host + '/sync?room=' + encodeURIComponent(query.get('room')));
link.binaryType = 'arraybuffer';
let received = 0;
let latestUpdate;
doc.on('update', (bytes, origin) => { if (origin !== link) link.send(bytes); });
await new Promise((resolve, reject) => {
  link.onerror = () => reject(new Error('Room connection failed'));
  link.onmessage = e => {
    const start = performance.now();
    Y.applyUpdate(doc, new Uint8Array(e.data), link);
    received++;
    latestUpdate = { seq:received, applyMs:performance.now()-start };
    resolve();
  };
});
const json = { type: 'doc', content: Array.from({ length: size }, (_,i) => ({
  type: 'paragraph', content: [{ type: 'text', text: 'Paragraph ' + i }]
})) };
const mount = document.getElementById('editor');
let editor;
if (engine === 'tiptap') {
  editor = new Tiptap({ element: mount, extensions: [
    TipKit.configure({history:false}), Collaboration.configure({ document:doc })
  ] });
  if (role === 'writer') editor.commands.setContent(json);
} else {
  const kit = composeExtensions([...StarterKit.extensions.filter(e => e.name !== 'history'),
    createYjsCollaborationExtension({ document:doc, user:{ id:role, name:role, color:'#5566aa' } })]);
  editor = createEditor({schema:kit.schema, plugins:kit.plugins, ...(role==='writer' ? { content:json } : {})});
  new EditorView(mount,editor,{ariaLabel:'Editor'});
}
const root = mount.querySelector('[contenteditable=true]');
const samples = [];
const changes = [];
let lastText = root.lastElementChild?.textContent;
const atFrame = fn => requestAnimationFrame(() => setTimeout(fn,0));
const observer = new MutationObserver(() => {
  const text = root.lastElementChild?.textContent;
  if (text === lastText) return;
  lastText = text;
  const entry = { text, domAt:performance.timeOrigin+performance.now(), update:latestUpdate };
  changes.push(entry);
  atFrame(() => { entry.frameTaskAt = performance.timeOrigin + performance.now(); });
});
observer.observe(root,{subtree:true,childList:true,characterData:true});
document.addEventListener('keydown',event => {
  if (!event.isTrusted || !/^[a-z]$/.test(event.key)) return;
  const entry = {key:event.key,at:performance.timeOrigin+event.timeStamp};
  samples.push(entry);
  atFrame(() => {entry.frameTaskAt=performance.timeOrigin+performance.now();});
},{capture:true});
window.peer = { samples,changes, get received(){return received;},
  texts:() => editor.getJSON().content.map(n=>n.content?.map(c=>c.text).join('') ?? ''),
  version:() => Array.from(Y.encodeStateVector(doc)) };
