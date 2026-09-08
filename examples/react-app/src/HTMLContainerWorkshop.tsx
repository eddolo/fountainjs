import { useEffect, useRef, useState } from 'react';
import { EditorView, StarterKit, HTMLContainerExtension, composeExtensions, createEditor, HTMLExporter,
  insertHTMLContainer, appendHTMLContainerParagraph, unwrapHTMLContainer, setNodeAttributes, undo, redo,
  canUndo, canRedo, type Editor, type Attributes } from 'fountainjs-editor';
import './html-container-workshop.css';

function Properties({ attrs, apply }: { attrs: Attributes; apply: (attrs: Attributes) => void }) {
  const [draft, setDraft] = useState(attrs);
  const change = (key: string, value: string) => setDraft(current => ({ ...current, [key]: value }));
  return <form className="section-properties" onSubmit={event => { event.preventDefault(); apply(draft); }}>
    <label>Element<select value={String(draft.tag)} onChange={event => change('tag', event.target.value)}>
      {['div', 'section', 'article', 'aside', 'nav', 'main', 'header', 'footer', 'address'].map(tag => <option key={tag}>{tag}</option>)}
    </select></label>
    {(['id', 'className', 'title', 'lang'] as const).map(key => <label key={key}>{({ id: 'HTML ID', className: 'CSS classes', title: 'Section title', lang: 'Language' })[key]}
      <input value={String(draft[key] ?? '')} maxLength={key === 'id' ? 256 : key === 'lang' ? 128 : 2048} onChange={event => change(key, event.target.value)} />
    </label>)}
    <label>Direction<select value={String(draft.dir)} onChange={event => change('dir', event.target.value)}>
      <option value="">Inherit</option><option value="ltr">Left to right</option><option value="rtl">Right to left</option><option value="auto">Automatic</option>
    </select></label>
    <button type="submit">Apply section properties</button>
  </form>;
}

/** A separate editable example: changing import options above never discards this draft. */
export function HTMLContainerWorkshop() {
  const mount = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const [editor, setEditor] = useState<Editor>();
  const [, refresh] = useState(0);
  const [target, setTarget] = useState('0');
  const [status, setStatus] = useState('The second section is deliberately empty. Select it below to add a paragraph.');
  const [preview, setPreview] = useState('');
  useEffect(() => {
    const kit = composeExtensions([...StarterKit.extensions, HTMLContainerExtension]);
    const instance = createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: [
      { type: 'html_container', attrs: { tag: 'section', id: 'handover', title: 'Release handover' }, content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Release handover' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Inspect logs and record the outcome.' }] },
      ] },
      { type: 'html_container', attrs: { tag: 'section', id: 'next', title: 'Next steps' }, content: [] },
    ] } });
    view.current = new EditorView(mount.current!, instance, { ariaLabel: 'Section authoring editor' });
    const unsubscribe = instance.subscribe(() => refresh(value => value + 1));
    setEditor(instance);
    return () => { unsubscribe(); view.current?.destroy(); instance.destroy(); };
  }, []);
  const containers: { key: string; attrs: Attributes; label: string }[] = [];
  editor?.state.doc.descendants((node, path) => {
    if (node.type.name === 'html_container') containers.push({ key: path.join('.'), attrs: node.attrs,
      label: `${path.map(index => index + 1).join('.')} · ${node.attrs.tag} · ${node.attrs.title || node.attrs.id || 'Untitled'}${node.childCount ? '' : ' (empty)'}` });
  });
  const selected = containers.find(item => item.key === target);
  const path = target.split('.').map(Number);
  const run = (command: (editor: Editor) => boolean, message: string, focus = true) => {
    if (!editor) return;
    const changed = command(editor);
    setStatus(changed ? message : 'No change: select a valid section or check its properties.');
    if (changed && focus) view.current?.focus();
  };
  return <section id="section-authoring" className="section-workshop" aria-label="Section authoring workshop">
    <h2>Create and edit sections</h2>
    <p>A separate editable example, not the import result above. Sections group blocks; they are not page breaks. Outlines help authors see the groups here and are absent from the reader preview.</p>
    <div className="section-actions">
      <button disabled={!editor || !canUndo(editor)} onClick={() => run(undo, 'Undid the last edit.')}>Undo section edit</button>
      <button disabled={!editor || !canRedo(editor)} onClick={() => run(redo, 'Redid the last edit.')}>Redo section edit</button>
      <button disabled={!editor} onClick={() => run(instance => {
        const result = insertHTMLContainer(instance);
        if (result) setTarget(String(instance.state.selection.path[0]));
        return result;
      }, 'Added a section after the active top-level block. Type into its new paragraph.')}>Insert new section</button>
    </div>
    <div ref={mount} className="section-editor" />
    <label className="section-picker">Section to configure<select value={selected ? target : ''} onChange={event => setTarget(event.target.value)}>
      <option value="" disabled>Choose a section</option>{containers.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
    </select></label>
    {selected && <Properties key={`${selected.key}:${JSON.stringify(selected.attrs)}`} attrs={selected.attrs} apply={attrs => run(instance => setNodeAttributes(instance, path, attrs), 'Updated section properties. Other content is unchanged.', false)} />}
    <div className="section-actions">
      <button disabled={!selected} onClick={() => run(instance => appendHTMLContainerParagraph(instance, path), 'Added a paragraph to the chosen section. Type in the editor now.')}>Add paragraph to section</button>
      <button disabled={!selected} onClick={() => run(instance => unwrapHTMLContainer(instance, path), 'Removed only the wrapper; its content is still here. Undo restores it.')}>Remove wrapper, keep content</button>
      <button disabled={!editor} onClick={() => {
        setPreview(HTMLExporter.export(editor!.state.doc, { document: false }));
        setStatus('Reader snapshot refreshed. Later edits do not change it until you preview again.');
      }}>Preview sections for readers</button>
    </div>
    <p role="status">{status}</p>
    <p>Properties belong to the document. CSS classes need a host stylesheet; they do not apply styles by themselves. HTML IDs are host-managed, not Fountain stable node identities. Removing a wrapper removes its properties, not its child blocks.</p>
    {preview && <iframe title="Section reader snapshot" sandbox="" srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:16px/1.6 system-ui;padding:20px;color:#201d35}h2{line-height:1.2}</style></head><body>${preview}</body></html>`} />}
    <details><summary>Commands and document JSON</summary><p>Uses HTMLContainerExtension with insertHTMLContainer, appendHTMLContainerParagraph, setNodeAttributes and unwrapHTMLContainer. Each accepted edit uses the existing transaction/history pipeline. <a href="https://github.com/eddolo/fountainjs/blob/master/docs/HTML_CONTAINERS.md">Read the section module guide →</a></p><pre>{JSON.stringify(editor?.state.doc.toJSON(), null, 2)}</pre></details>
  </section>;
}
