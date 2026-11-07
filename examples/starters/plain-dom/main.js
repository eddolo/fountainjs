import {
  EditorView, StarterKit, composeExtensions, createEditor, defineExtension, insertNode, redo, undo,
} from 'fountainjs-editor';
import 'fountainjs-editor/styles.css';

const callout = defineExtension({
  name: 'starter-callout',
  nodes: {
    callout: {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'aside[data-callout]' }],
      toDOM: () => ['aside', { 'data-callout': '' }, 0],
    },
  },
});

const kit = composeExtensions([...StarterKit.extensions, callout]);
const content = { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Edit this paragraph, then add a callout.' }] },
] };
const output = document.querySelector('#document-json');
const showDocument = doc => { output.textContent = JSON.stringify(doc.toJSON(), null, 2); };
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content, onUpdate: state => showDocument(state.doc) });
const view = new EditorView(document.querySelector('#editor'), editor, { ariaLabel: 'Starter editor' });
showDocument(editor.state.doc);

document.querySelector('#callout').addEventListener('click', () => {
  const { schema } = editor.state;
  if (insertNode(editor, schema.node('callout', {}, [schema.text('Write your callout here.')]))) view.focus();
});
document.querySelector('#undo').addEventListener('click', () => { if (undo(editor)) view.focus(); });
document.querySelector('#redo').addEventListener('click', () => { if (redo(editor)) view.focus(); });

if (import.meta.hot) import.meta.hot.dispose(() => {
  view.destroy();
  editor.destroy();
});
