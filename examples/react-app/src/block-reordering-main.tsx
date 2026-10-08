import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { composeExtensions, createEditor, defineExtension, EditorView, HTMLExporter, StarterKit, undo, redo, type Editor, type Node, type NodeJSON } from 'fountainjs-editor';
import { createStableNodeIdsExtension, selectNodeById } from 'fountainjs-editor/node-ids';
import { SitePageLink } from './SitePageLink';
import 'fountainjs-editor/styles.css';
import './block-reordering.css';

const note = defineExtension({
  name: 'reordering-runbook-note',
  nodes: {
    runbook_note: {
      group: 'block', content: 'inline*',
      attrs: { dir: { default: undefined }, label: { default: 'Operator note' } },
      toDOM: node => ['aside', { class: 'reorder-lab__note', 'data-runbook-note': '', ...(node.attrs.dir ? { dir: node.attrs.dir } : {}) },
        ['strong', {}, String(node.attrs.label)], ['div', {}, 0]],
    },
  },
});
const kit = composeExtensions([...StarterKit.extensions, createStableNodeIdsExtension(), note]);
// A code-drawn, embedded raster keeps this small sample's media visible in an
// offline JSON/HTML reader without relaxing the engine's SVG/data-URL policy.
function recoveryDiagram(): string {
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 100;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#f1edff'; context.fillRect(0, 0, 320, 100);
  context.fillStyle = '#251a4a'; context.font = '14px sans-serif'; context.textAlign = 'center';
  ['Detect', 'Restore', 'Verify'].forEach((text, index) => context.fillText(text, 53 + index * 107, 55));
  context.strokeStyle = '#6d4aff'; context.lineWidth = 2;
  [85, 195].forEach(x => { context.beginPath(); context.moveTo(x, 50); context.lineTo(x + 40, 50); context.moveTo(x + 32, 44); context.lineTo(x + 40, 50); context.lineTo(x + 32, 56); context.stroke(); });
  return canvas.toDataURL('image/png');
}
const paragraph = (text: string): NodeJSON => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const sample: NodeJSON = {
  type: 'doc', attrs: { title: 'Bilingual incident runbook' }, content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Service recovery runbook' }] },
    paragraph('Start with a clear handover. This deliberately long paragraph wraps onto multiple lines: hover its handle to see which complete block will move, not just which line is under the pointer.'),
    { type: 'blockquote', attrs: { dir: 'rtl' }, content: [paragraph('إجراءات الفريق — Keep this context'), paragraph('ملاحظة النقل — Move this handover note')] },
    { type: 'blockquote', attrs: { dir: 'ltr' }, content: [paragraph('Destination: operations team'), paragraph('Keep the rollback window open.')] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Recovery checklist' }] },
    { type: 'bullet_list', content: [
      { type: 'list_item', content: [paragraph('Check the affected region')] },
      { type: 'list_item', content: [paragraph('Confirm recovery with the on-call team')] },
    ] },
    { type: 'table', content: [
      { type: 'table_row', content: ['Service', 'State'].map(text => ({ type: 'table_header', content: [paragraph(text)] })) },
      { type: 'table_row', content: ['API', 'Monitoring'].map(text => ({ type: 'table_cell', content: [paragraph(text)] })) },
    ] },
    { type: 'image_super', attrs: { src: recoveryDiagram(), alt: 'Recovery flow: detect, restore, verify', caption: 'Recovery flow — an embedded media asset', width: '320px', height: '100px' } },
    { type: 'runbook_note', attrs: { label: 'Operator note' }, content: [{ type: 'text', text: 'A custom, editable extension block. Its label and node identity travel with it.' }] },
    { type: 'blockquote', attrs: { dir: 'auto' }, content: [paragraph('تلقائي — Automatic container'), paragraph('This Latin paragraph shares the container’s automatic scope. Move the whole quote to keep that scope intact.')] },
    paragraph('End of handover. Add a line, move a block, then undo to check the result.'),
  ],
};

function download(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Reader({ documentNode, direction }: { documentNode: Node; direction: string }) {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reader = createEditor({ schema: kit.schema, content: documentNode.toJSON(), editable: false });
    const view = new EditorView(mount.current!, reader, { ariaLabel: 'Runbook reader preview', attributes: { dir: direction } });
    return () => { view.destroy(); reader.destroy(); };
  }, [documentNode, direction]);
  return <section className="reorder-lab__reader" aria-label="Reader view"><h2>Reader preview</h2><p>Same document, no author handles. This is a read-only surface, not a backend access-control system.</p><div ref={mount} /></section>;
}

function ReorderingLab() {
  const mount = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [documentNode, setDocumentNode] = useState<Node>();
  const [direction, setDirection] = useState('ltr');
  const [reader, setReader] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const next = createEditor({ schema: kit.schema, plugins: kit.plugins, content: sample });
    const unsubscribe = next.subscribe(state => setDocumentNode(state.doc));
    setDocumentNode(next.state.doc); setEditor(next);
    return () => { unsubscribe(); next.destroy(); };
  }, []);
  useEffect(() => {
    if (!editor) return;
    const view = new EditorView(mount.current!, editor, { ariaLabel: 'Runbook reordering editor', blockHandles: true,
      attributes: { dir: direction }, onError: failure => setError(String(failure)) });
    return () => view.destroy();
  }, [editor, direction]);
  return <main className="demos-site reorder-lab">
    <header className="site-header"><a className="brand" href="./"><span>F</span> FountainJS</a><nav aria-label="Primary navigation"><SitePageLink href="./">Home</SitePageLink><SitePageLink href="./demos.html">10 demos</SitePageLink><SitePageLink href="./developers.html">Developers</SitePageLink></nav></header>
    <section className="reorder-lab__intro"><nav aria-label="Breadcrumb"><a href="./demos.html">← Demos</a><span> / Block reordering lab</span></nav><h1>Move the block. Keep its structure.</h1><p>Organize a bilingual incident runbook with paragraphs, headings, lists, a table, local media and a custom extension block. These are the supplied controls, not a separate drag engine.</p><p>Hover or focus the handle: the complete block is highlighted. Grab it: the stronger ring marks the source. The separate line marks the destination.</p></section>
    <section className="reorder-lab__workspace" aria-label="Runbook workspace">
      <div className="reorder-lab__controls"><label>Editor direction <select value={direction} onChange={event => setDirection(event.target.value)}><option value="ltr">Left to right</option><option value="rtl">Right to left</option><option value="auto">Automatic</option></select></label><button disabled={!editor} onClick={() => editor && undo(editor)}>Undo</button><button disabled={!editor} onClick={() => editor && redo(editor)}>Redo</button><button aria-pressed={reader} onClick={() => setReader(!reader)}>Reader preview</button><button disabled={!documentNode} onClick={() => documentNode && download('runbook.json', 'application/json', JSON.stringify(documentNode.toJSON(), null, 2))}>Download JSON</button><button disabled={!documentNode} onClick={() => documentNode && download('runbook.html', 'text/html', HTMLExporter.export(documentNode, { document: true, title: 'Recovery runbook', includeStyles: true }))}>Download HTML</button></div>
      <label className="reorder-lab__block-choice">Choose a whole block <select value="" onChange={event => editor && selectNodeById(editor, event.target.value)}><option value="" disabled>Select a paragraph, entire list, table or media block…</option>{documentNode?.content.map((node, index) => <option key={String(node.attrs.nodeId)} value={String(node.attrs.nodeId)}>{index + 1}. {node.type.name.replaceAll('_', ' ')} — {(node.textContent || String(node.attrs.alt || '')).slice(0, 48)}</option>)}</select></label>
      <p className="reorder-lab__help">Keyboard: choose a whole block above, focus its handle, Space/Enter to grab, ↑/↓ to move, Escape to release. Hover inside a container to target its inner paragraph; the selector lets you target the entire list/table instead. The labelled move buttons work without dragging. “Before/after” means document order, not left/right.</p>
      {error && <p role="alert">Editor error: {error}</p>}
      <div className="reorder-lab__mount" ref={mount} />
      <p>JSON keeps document data, stable IDs and the embedded diagram. HTML keeps structured content and the diagram, but not this page’s green note styling or editor-only direction setting. It is not a pixel-identical export.</p>
      {reader && documentNode && <Reader documentNode={documentNode} direction={direction} />}
      <details><summary>Stored document and stable node IDs</summary><pre>{documentNode && JSON.stringify(documentNode.toJSON(), null, 2)}</pre></details>
      <aside className="reorder-lab__boundary"><h2>Direction boundary</h2><p>Moving a block out of a known fixed LTR/RTL container retains that inherited direction when the new context differs. Explicit child direction and alignment remain independent. Surface direction above is a view setting, not a document attribute.</p><p>Moving an entire automatic quote retains its shared scope. Removing or reparenting a child of an automatic scope is not certified: copying <code>dir="auto"</code> onto each child can change how mixed text is resolved. Host CSS inheritance and direction-incapable custom blocks also remain separate work.</p></aside>
    </section>
    <section className="reorder-lab__intro"><h2>Use these controls in your product</h2><p>Pass <code>blockHandles: true</code> to <code>EditorView</code>, or supply your own labels and candidate policy. Moves use <code>canMoveNode</code> / <code>moveNode</code>, schema validation and ordinary undo. The example’s note is a registered custom node; the diagram is embedded in the document.</p><p><a href="./developers.html#surfaces">Developer guide →</a> · <a href="https://github.com/eddolo/fountainjs/blob/master/docs/BLOCK_REORDERING.md">Reordering contract →</a> · <a href="https://github.com/eddolo/fountainjs/blob/master/examples/react-app/src/block-reordering-main.tsx">Example source →</a></p></section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ReorderingLab /></React.StrictMode>);
