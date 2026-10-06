import { useEffect, useRef, useState } from 'react';
import { EditorView, StarterKit, HTMLCommentExtension, composeExtensions, createEditor, EditorState, Schema,
  MarkdownImporter, MarkdownExporter, HTMLExporter, setNodeAttributes, NodeSelection, deleteSelection,
  undo, redo, canUndo, canRedo, type Editor, type MarkdownSourceSnapshot } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';
import './html-container-workshop.css';

const original = 'Release **notes** <!-- provenance: imported draft --> remain editable.\n\nReview the rollout.\n';
export function HTMLCommentWorkshop() {
  const mount = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | undefined>(undefined);
  const snapshot = useRef<MarkdownSourceSnapshot | undefined>(undefined);
  const [version, refresh] = useState(0);
  const [data, setData] = useState(' provenance: imported draft ');
  const [status, setStatus] = useState('The badge is author-only; reader HTML contains an inert comment, not a badge.');
  const [saved, setSaved] = useState('');
  const [preview, setPreview] = useState('');
  useEffect(() => {
    const kit = composeExtensions([...StarterKit.extensions, HTMLCommentExtension]);
    const schema = new Schema(kit.schema);
    const captured = MarkdownImporter.parseWithSource(original, schema, { parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow });
    snapshot.current = captured.source;
    const editor = createEditor({ schema: kit.schema, state: EditorState.create({ schema, doc: captured.document, plugins: kit.plugins }) });
    editorRef.current = editor;
    const view = new EditorView(mount.current!, editor, { ariaLabel: 'HTML comment authoring editor' });
    const unsubscribe = editor.subscribe(() => refresh(value => value + 1));
    refresh(value => value + 1);
    return () => { unsubscribe(); view.destroy(); editor.destroy(); editorRef.current = undefined; };
  }, []);
  const editor = editorRef.current;
  let path: number[] | undefined;
  let currentData: string | undefined;
  editor?.state.doc.descendants((node, current) => {
    if (node.type.name === 'html_comment' && !path) { path = [...current]; currentData = String(node.attrs.data); }
  });
  useEffect(() => { if (currentData !== undefined) setData(currentData); }, [currentData]);
  const save = () => {
    if (!editor || !snapshot.current) return;
    const result = MarkdownExporter.exportWithSource(editor.state.doc, snapshot.current);
    setSaved(result.markdown);
    setStatus(`Source preservation: ${result.preservation}`);
    setPreview(HTMLExporter.export(editor.state.doc, { document: false }));
  };
  const frame = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>HTML comment reader snapshot</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:16px/1.6 Arial;padding:20px}</style></head><body><main>${preview}</main></body></html>`;
  return <section id="comment-authoring" className="section-workshop" aria-label="HTML comment authoring workshop" data-version={version}>
    <h2>Preserve inert HTML comments</h2>
    <p>This separate draft demonstrates an author-only source badge. Readers see the prose, not the badge. HTML comments are not threaded review comments or executable content. The editable data below is preserved in JSON, HTML and opted-in Markdown conversion.</p>
    <p>Hidden is not private: exported HTML still contains the comment data. Remove sensitive comments before publishing.</p>
    <div className="section-editor" ref={mount} />
    <form className="section-properties" onSubmit={event => {
      event.preventDefault();
      setStatus(editor && path && setNodeAttributes(editor, path, { data }) ? 'Updated comment data. Undo is available.' : 'No change: comment data must be safe and no longer than 65536 characters.');
    }}><div className="comment-data-field"><label htmlFor="comment-source-data">HTML comment data</label><textarea id="comment-source-data" value={data} onChange={event => setData(event.target.value)} rows={3} /></div><button disabled={!path}>Apply comment data</button></form>
    <div className="section-actions">
      <button disabled={!editor || !path} onClick={() => {
        if (!editor || !path) return;
        editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, path)));
        setStatus(deleteSelection(editor) ? 'Removed comment. Undo is available.' : 'No change.');
      }}>Remove HTML comment</button>
      <button disabled={!editor || !canUndo(editor)} onClick={() => { if (editor) undo(editor); }}>Undo comment edit</button>
      <button disabled={!editor || !canRedo(editor)} onClick={() => { if (editor) redo(editor); }}>Redo comment edit</button>
      <button onClick={save}>Save comment Markdown and preview</button>
    </div>
    <p role="status">{status}</p>
    <label htmlFor="comment-saved-markdown">Saved comment Markdown</label><textarea id="comment-saved-markdown" readOnly value={saved} rows={5} />
    {preview && <><iframe key={frame} title="HTML comment reader snapshot" sandbox="" srcDoc={frame} /><details><summary>Actual reader HTML</summary><pre>{preview}</pre></details></>}
  </section>;
}
