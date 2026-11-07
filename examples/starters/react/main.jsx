import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StarterKit } from 'fountainjs-editor';
import { FountainComposer, useFountain } from 'fountainjs-editor/react';
import 'fountainjs-editor/styles.css';

const content = { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Edit this paragraph and try the toolbar.' }] },
] };

function App() {
  const [snapshot, setSnapshot] = useState(content);
  const editor = useFountain({
    schema: StarterKit.schema,
    plugins: StarterKit.plugins,
    content,
    onUpdate: state => setSnapshot(state.doc.toJSON()),
  });

  return <main>
    <h1>FountainJS with React</h1>
    <FountainComposer editor={editor} ariaLabel="Starter editor" />
    <details>
      <summary>Document JSON</summary>
      <pre>{JSON.stringify(snapshot, null, 2)}</pre>
    </details>
  </main>;
}

createRoot(document.querySelector('#root')).render(<StrictMode><App /></StrictMode>);
