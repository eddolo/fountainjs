import { useEffect, useRef, useState } from 'react';
import { EditorView, StarterKit, composeExtensions, createEditor, EditorState, Schema,
  HTMLImporter, MarkdownImporter, MarkdownExporter, HTMLExporter, undo, redo,
  type Editor, type MarkdownSourceSnapshot } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';
import { appendInertHTMLBlockParagraph, createInertHTMLBlockExtension, createInertHTMLInlineExtension, createInertHTMLRawTextExtension } from 'fountainjs-editor/html/inert';
import './html-container-workshop.css';

const samples = {
  nested: "Before <FoO data-id='outer'>outside <bar data-id=inner>inside</bar> end</FOO> after.\n",
  empty: '<p><foo></foo> and <lab.measurement units="m">measurement</lab.measurement>.</p>',
  hostile: 'Before <fountain-unsafe onclick="globalThis.inertPwned=1" style="background:url(https://invalid.test/x)" href="javascript:alert(1)">Editable</fountain-unsafe> after.\n',
  incomplete: '<div id="private-example"\n*Keep these words*\n',
  raw: '<ScRiPt type="text/javascript">\n// 😀 <strong>literal source</strong>\nglobalThis.rawPwned=1;\n</SCRIPT>\n<style>body {color:red; background:url(https://invalid.test/raw);}</style>\n<textarea name="private-example">\n*literal* &amp; 😀\n</textarea>\n',
  rawEmpty: '<script></script>\n',
  blocks: '<LaB-Section onclick="globalThis.blockPwned=1" style="display:none" data-id=results>\n<h2>Trial results</h2>\n<p>Review this multiline research summary before publishing. The wrapper remains inert while its content is editable.</p>\n<ul><li>Check measurements</li><li>Confirm units</li></ul>\n<table><tr><th>Measure</th><th>Value</th></tr><tr><td>Sample A</td><td>12</td></tr></table>\n<p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPIdPn/HwAFcgKsyas2aQAAAABJRU5ErkJggg==" alt="Embedded purple sample" width="48" height="48"></p>\n<warning><p>Check the source data</p></warning>\n</LAB-SECTION>\n<lab-section data-empty="true"></lab-section>\n',
  links: '<p>Open <a href="folder\\\nreport">destination</a> after.</p>\n<p><a href="java&#10;script:globalThis.linkPwned=1">Blocked unsafe link</a> remains readable.</p>',
  htmlLinks: '<p><a href="/bar\\/)">HTML backslash path</a></p>\n<p><a href="foo  &#10;bar">HTML whitespace destination</a></p>\n<p><a href="foo\\&#10;bar">HTML mixed destination</a></p>\n<p><a href="folder/&#9;name">HTML tab destination</a></p>\n<p><a href="#note&#13;part">HTML CR destination</a></p>',
  literalLinks: '[Path](foo\\bar)\n\n<https://example.com?find=\\*>\n\n[Reference]\n\n[Reference]: /url\\bar\\*baz "Title"\n\n<https://example.com/\\[\\>\n',
};
const importer = new ServerHTMLImporter({ sourceTokens: true });
const options = { parseHTMLDocument: importer.parseTextBlockFlow.bind(importer) };

/** A real public demo of the optional package entry, not a private schema copy. */
export function HTMLInertWorkshop() {
  const mount = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | undefined>(undefined);
  const viewRef = useRef<EditorView | undefined>(undefined);
  const snapshot = useRef<MarkdownSourceSnapshot | undefined>(undefined);
  const [version, refresh] = useState(0);
  const [input, setInput] = useState(samples.nested);
  const [inputFormat, setInputFormat] = useState<'Markdown' | 'HTML'>('Markdown');
  const [status, setStatus] = useState('Explicitly registered tags: foo, bar, lab.measurement and fountain-unsafe.');
  const [saved, setSaved] = useState('');
  const [preview, setPreview] = useState('');
  const [importIssues, setImportIssues] = useState<string[]>([]);
  useEffect(() => {
    const kit = composeExtensions([...StarterKit.extensions,
      createInertHTMLInlineExtension({ tags: ['foo', 'bar', 'lab.measurement', 'fountain-unsafe'] }),
      createInertHTMLBlockExtension({ tags: ['lab-section', 'warning'] }),
      createInertHTMLRawTextExtension({ tags: ['script', 'style', 'textarea'] })]);
    const schema = new Schema(kit.schema);
    const captured = MarkdownImporter.parseWithSource(samples.nested, schema, options);
    snapshot.current = captured.source;
    const editor = createEditor({ schema: kit.schema, state: EditorState.create({ schema, doc: captured.document, plugins: kit.plugins }) });
    editorRef.current = editor;
    const view = new EditorView(mount.current!, editor, { ariaLabel: 'Inert HTML source editor' });
    viewRef.current = view;
    const unsubscribe = editor.subscribe(() => refresh(value => value + 1));
    refresh(value => value + 1);
    return () => { unsubscribe(); view.destroy(); editor.destroy(); editorRef.current = undefined; viewRef.current = undefined; };
  }, []);
  const editor = editorRef.current;
  const retained: unknown[] = [];
  const destinations: unknown[] = [];
  const blockChoices: { path: readonly number[]; label: string }[] = [];
  editor?.state.doc.descendants((node, path) => {
    if (['html_inert_inline', 'html_inert_raw_text', 'html_inert_block'].includes(node.type.name)) retained.push({ path, ...node.attrs });
    if (node.type.name === 'html_inert_block') blockChoices.push({ path: [...path], label: `${String(node.attrs.tag)} (${path.join('.')})${node.childCount ? '' : ' — empty'}` });
    node.marks.forEach(mark => {
      if (mark.type.name !== 'link') return;
      const rendered = mark.type.spec.toDOM?.(mark);
      const attrs = Array.isArray(rendered) && typeof rendered[1] === 'object' ? rendered[1] : undefined;
      destinations.push({ path, ...mark.attrs, renderedHref: attrs && 'href' in attrs ? attrs.href : undefined });
    });
  });
  const load = (source: string, format = inputFormat) => {
    if (!editor) return;
    try {
      const issues: string[] = [];
      const reportedOptions = {
        parseHTMLDocument: (...args: Parameters<typeof importer.parseTextBlockFlowWithReport>) => {
          const result = importer.parseTextBlockFlowWithReport(...args);
          issues.push(...result.issues.map(issue => `${issue.code}: ${issue.message}`));
          return result.nodes;
        },
        onHTMLFlowFallback: (issue: { reason: string; message: string }) => issues.push(`source-fallback (${issue.reason}): ${issue.message}`),
      };
      const captured = format === 'Markdown' ? MarkdownImporter.parseWithSource(source, editor.state.schema, reportedOptions) : undefined;
      const htmlResult = captured ? undefined : importer.parseWithReport(source, editor.state.schema);
      if (htmlResult) issues.push(...htmlResult.issues.map(issue => `${issue.code}: ${issue.message}`));
      snapshot.current = captured?.source;
      const doc = captured?.document ?? htmlResult!.document;
      editor.dispatch(editor.createTransaction().replaceDocument(doc).setMeta('addToHistory', false));
      setInput(source); setInputFormat(format); setSaved(''); setPreview('');
      setImportIssues([...new Set(issues)]);
      setStatus(issues.some(issue => issue.startsWith('source-fallback'))
        ? `Imported ${format} using a reported literal-source fallback. Review the conversion diagnostics.`
        : `Imported ${format}. Review the conversion diagnostics; unsupported tags are not automatically registered.`);
    } catch (error) { setStatus(`Import refused: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const reopen = (format: 'Markdown' | 'HTML' | 'JSON') => {
    if (!editor) return;
    try {
      const current = editor.getJSON();
      const exported = snapshot.current ? MarkdownExporter.exportWithSource(editor.state.doc, snapshot.current)
        : { markdown: MarkdownExporter.export(editor.state.doc), preservation: 'canonical' };
      const html = HTMLExporter.export(editor.state.doc, { document: false });
      const reopened = format === 'Markdown' ? MarkdownImporter.parse(exported.markdown, editor.state.schema, options)
        : format === 'HTML' ? HTMLImporter.parse(html, editor.state.schema)
          : editor.state.schema.nodeFromJSON(JSON.parse(JSON.stringify(current)));
      const equal = JSON.stringify(current) === JSON.stringify(reopened.toJSON());
      editor.dispatch(editor.createTransaction().replaceDocument(reopened).setMeta('addToHistory', false));
      setSaved(exported.markdown); setPreview(html);
      setStatus(`${format}: ${equal ? 'Complete native JSON retained.' : 'Round-trip mismatch — inspect the document.'} Source preservation: ${exported.preservation}.`);
    } catch (error) { setStatus(`Reopen refused: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const frame = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Inert source reader</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>body{font:16px/1.6 Arial;padding:16px;overflow-wrap:anywhere}p{min-height:1em;min-height:1lh}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px;text-align:left}img{max-width:100%}[data-fountain-inert-badge]{color:#574384;font-size:.8em}[data-fountain-inert-raw-text] code{white-space:pre-wrap;display:inline-block;max-width:100%;min-width:1ch;overflow-wrap:anywhere}</style></head><body><main>${preview}</main></body></html>`;
  return <section id="inert-source" className="section-workshop" aria-label="Inert HTML preservation workshop" data-version={version}>
    <h2>Keep registered HTML as inert data</h2>
    <p>Unreleased, opt-in preservation for explicitly registered tags. Edit the words; inspect the original opening and closing tokens below. The tag, attributes and source spelling remain data, never live HTML behavior or layout. This is not arbitrary website reproduction or full CommonMark conformance.</p>
    <p>Source data can include secrets and hostile URLs. Retained does not mean private or trusted. No offsets or full original-file round-trip are promised for reconstructed Markdown input.</p>
    <p>Raw-text capture is separately opted in for script, style and textarea bodies. These remain literal source data: no execution, CSS application, live form control, or automatic language service. HTML parser newline/entity rules still apply; the source snapshot preserves untouched Markdown separately.</p>
    <div className="section-actions">
      <button onClick={() => load(samples.nested, 'Markdown')}>Nested inline sample</button>
      <button onClick={() => load(samples.empty, 'HTML')}>Empty and dotted HTML tag sample</button>
      <button onClick={() => load(samples.hostile, 'Markdown')}>Hostile attribute sample</button>
      <button onClick={() => load(samples.incomplete, 'Markdown')}>Unfinished HTML source sample</button>
      <button onClick={() => load(samples.raw, 'Markdown')}>Inert script style textarea sample</button>
      <button onClick={() => load(samples.rawEmpty, 'Markdown')}>Empty inert script sample</button>
      <button onClick={() => load(samples.blocks, 'HTML')}>Structured inert block sample</button>
      <button onClick={() => load(samples.links, 'HTML')}>Safe link destination sample</button>
      <button onClick={() => load(samples.htmlLinks, 'HTML')}>HTML navigation intent sample</button>
      <button onClick={() => load(samples.literalLinks, 'Markdown')}>Literal Markdown link sample</button>
    </div>
    <label>Inert input format<select value={inputFormat} onChange={event => setInputFormat(event.target.value as 'Markdown' | 'HTML')}><option>Markdown</option><option>HTML</option></select></label>
    <p>Dotted names are accepted in HTML input; they are not inline HTML syntax in CommonMark. HTML input uses canonical Markdown export, not an exact Markdown-source snapshot.</p>
    <label htmlFor="inert-source-input">Inert source input</label><textarea id="inert-source-input" value={input} onChange={event => setInput(event.target.value)} rows={3} />
    <button onClick={() => load(input)}>Import inert source</button>
    <h3>Edit retained content</h3><div className="section-editor" ref={mount} />
    <p>Block wrappers retain structured children, not the original layout. Empty wrappers stay empty until you explicitly add content. Each button below adds one paragraph inside that wrapper and places the caret there.</p>
    <div className="section-actions">{blockChoices.map(choice => <button key={choice.path.join('.')} onClick={() => {
      if (editor && appendInertHTMLBlockParagraph(editor, choice.path)) viewRef.current?.focus();
    }}>Add paragraph to {choice.label}</button>)}</div>
    <div className="section-actions">
      <button onClick={() => { if (editor) undo(editor); }}>Undo inert edit</button>
      <button onClick={() => { if (editor) redo(editor); }}>Redo inert edit</button>
      <button disabled={!editor} onClick={() => {
        if (!editor) return;
        const url = URL.createObjectURL(new Blob([HTMLExporter.export(editor.state.doc)], { type: 'text/html;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url; link.download = 'fountain-inert-document.html'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>Download standalone HTML</button>
      {(['Markdown', 'HTML', 'JSON'] as const).map(format => <button key={format} onClick={() => reopen(format)}>Export {format} and reopen</button>)}
    </div>
    <p role="status">{status}</p>
    <aside aria-label="Inert import diagnostics">
      <h3>Conversion diagnostics</h3>
      <p>These are parser/schema diagnostics, not a guarantee of original appearance or complete retention. Markdown refuses unfinished-tag conversion and keeps literal text; direct HTML import follows HTML parser repair and can omit unfinished tokens.</p>
      {importIssues.length ? <ul>{importIssues.map(issue => <li key={issue}>{issue}</li>)}</ul> : <p>No conversion issues reported for the latest input.</p>}
    </aside>
    <details open><summary>Retained tag attributes and lexical tokens</summary><pre aria-label="Retained inert source data">{JSON.stringify(retained, null, 2)}</pre></details>
    <details open><summary>Current link destinations</summary><p>Imported HTML links retain bounded source spelling where needed to preserve browser navigation. Literal Markdown backslashes remain URL data instead. The rendered destination below comes from the actual link renderer. Unsafe or ambiguous destinations stay unlinked. Inspect before following a link.</p><pre aria-label="Imported link destinations">{JSON.stringify(destinations, null, 2)}</pre></details>
    <details><summary>Current complete native document</summary><textarea aria-label="Inert native document JSON" readOnly value={editor ? JSON.stringify(editor.getJSON(), null, 2) : ''} rows={8} /></details>
    <label htmlFor="inert-saved-markdown">Saved inert Markdown</label><textarea id="inert-saved-markdown" readOnly value={saved} rows={5} />
    {preview && <><h3>Reader fallback, not original appearance</h3><iframe key={frame} title="Inert source reader" sandbox="" srcDoc={frame} /></>}
  </section>;
}
