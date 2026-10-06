import { CoreSchemaSpec, HTMLContainerExtension, HTMLFlowExtension, Schema, MarkdownImporter, MarkdownExporter, HTMLExporter,
  EditorState, createEditor, createHistoryPlugin, EditorView, Selection, NodeSelection } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';

let cleanup: (() => void) | undefined;
export function mountMarkdownDocumentAudit(referenceHTML: string, sample: 'html' | 'plain' | 'plain-flow' | 'empty-flow' | 'blocks' | 'tables' = 'html', inlineFlow = false, parent: HTMLElement = document.body) {
  cleanup?.();
  const spec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLContainerExtension.nodes, ...(inlineFlow ? HTMLFlowExtension.nodes : {}) } };
  const schema = new Schema(spec);
  const source = sample === 'plain'
    ? 'Heading\n=======\n\nKeep __this__ spelling.\n\n~~~~html\n<b>literal</b>\n~~~~\n\nEdit here.\n'
    : sample === 'plain-flow' ? '<div data-fountain-html-flow="true">Before</div>'
    : sample === 'empty-flow' ? '<div data-fountain-html-flow="true"></div>'
    : sample === 'blocks' ? '<section id="report">\n\nBefore.\n\n---\n\n![A & B](/demo-media.svg "Diagram")\n\nAfter **review**.\n\n</section>\n'
    : sample === 'tables' ? '<section id="results">\n\nBefore.\n\n| Name | Result |\n| :--- | ---: |\n| **Alpha** | [Ready][r] |\n| Beta | `x` |\n\nAfter.\n\n</section>\n\n[r]: /ready\n'
    : '<a href="/guide">First paragraph.\n\nSecond **paragraph**.</a>\n';
  const issues: string[] = [];
  const importOptions = { parseHTMLDocument: (segments: Parameters<ServerHTMLImporter['parseTextBlockFlowWithReport']>[0], target: Schema, context: Parameters<ServerHTMLImporter['parseTextBlockFlowWithReport']>[2]) => {
    const result = new ServerHTMLImporter().parseTextBlockFlowWithReport(segments, target, context);
    issues.push(...result.issues.map(issue => issue.message));
    return result.nodes;
  } };
  let parsed = MarkdownImporter.parseWithSource(source, schema, importOptions);
  const root = document.createElement('section'); root.id = 'markdown-document-audit';
  root.innerHTML = '<h2>HTML scope across paragraphs</h2><p data-warning></p><h3>Fountain editor</h3><div data-editor></div><button type="button" data-save>Save Markdown</button><label>Saved scope Markdown<textarea data-saved readonly></textarea></label><p data-save-status role="status"></p><h3>Fountain reader projection</h3><iframe title="Fountain scope reader" sandbox=""></iframe><h3>CommonMark reference HTML (static, no scripts)</h3><iframe title="Reference scope reader" sandbox=""></iframe>';
  const style = document.createElement('style');
  style.textContent = '#markdown-document-audit{box-sizing:border-box;max-width:960px;margin:30px auto;padding:30px;background:#f5f2ff;font:16px/1.5 Arial;scroll-margin-top:110px}#markdown-document-audit .fountain-editor{min-height:200px;padding:24px;background:white;font:16px/1.5 Arial}#markdown-document-audit .fountain-editor p{margin:16px 0}#markdown-document-audit textarea[data-saved]{box-sizing:border-box;display:block;width:100%;min-height:100px}#markdown-document-audit .fountain-editor .fountain-image img{max-height:220px;object-fit:contain}#markdown-document-audit iframe{box-sizing:border-box;width:100%;height:230px;background:white;border:1px solid #b8acd4}#markdown-document-audit button{padding:10px;margin:12px 0}';
  root.prepend(style); parent.append(root);
  root.querySelector('h2')!.textContent = sample === 'plain' ? 'Ordinary Markdown with document HTML conversion enabled'
    : sample === 'blocks' ? 'Markdown images and dividers inside HTML sections'
    : sample === 'tables' ? 'Editable Markdown tables inside HTML sections'
    : sample === 'plain-flow' || sample === 'empty-flow' ? 'Clear, save and reopen inline content' : 'HTML scope across paragraphs';
  root.querySelector('[data-warning]')!.textContent = issues.length ? [...new Set(issues)].join(' ')
    : sample === 'plain' ? 'No HTML conversion was needed. Editing one paragraph should preserve the other source blocks, including the heading underline, emphasis spelling and code fence.'
    : 'No conversion losses were reported for this sample. It still uses the explicitly enabled HTML adapter and schema.';
  const frame = (html: string) => `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${location.origin} data:"><style>body{font:16px/1.5 Arial;padding:20px}p{margin:16px 0}img{max-width:100%;max-height:140px;object-fit:contain}figure{margin:16px 0}figcaption:empty{display:none}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px;text-align:left}</style></head><body>${html}</body></html>`;
  root.querySelector<HTMLIFrameElement>('iframe[title="Reference scope reader"]')!.srcdoc = frame(referenceHTML);
  if (sample === 'blocks' || sample === 'tables') {
    root.querySelectorAll('iframe').forEach(element => { element.style.height = '400px'; });
    root.querySelector('[data-warning]')!.textContent += ' The sandboxed previews allow only local/demo and data images. Figure layout can differ; these are not a pixel-equivalence claim.';
  }
  if (sample === 'tables') root.querySelectorAll('h3')[2].textContent = 'Static table reference HTML (safe, no scripts; not a CommonMark table claim)';
  const editor = createEditor({ schema: spec, state: EditorState.create({ schema, doc: parsed.document, plugins: [createHistoryPlugin()] }) });
  const view = new EditorView(root.querySelector<HTMLElement>('[data-editor]')!, editor, { ariaLabel: 'Whole-document scope editor' });
  if (inlineFlow) {
    const focus = document.createElement('button'); focus.type = 'button'; focus.textContent = sample === 'html' ? 'Edit between paragraphs' : 'Edit inline content';
    focus.onclick = () => {
      const index = editor.state.doc.content.findIndex(node => node.type.name === 'html_flow');
      if (index < 0) return;
      const node = editor.state.doc.child(index);
      editor.dispatch(editor.createTransaction().setSelection(node.childCount && node.child(0).isText
        ? Selection.cursor([index, 0], 0) : new NodeSelection(editor.state.doc, [index])));
      view.focus();
    };
    if (sample !== 'blocks' && sample !== 'tables') root.querySelector('[data-save]')!.before(focus);
    const reopen = document.createElement('button'); reopen.type = 'button'; reopen.textContent = 'Reopen saved Markdown';
    reopen.onclick = () => {
      const value = root.querySelector<HTMLTextAreaElement>('textarea[data-saved]')!.value;
      if (!value) return;
      try {
        const next = MarkdownImporter.parseWithSource(value, schema, importOptions);
        const first = next.document.child(0);
        editor.dispatch(editor.createTransaction().replace(0, editor.state.doc.childCount, next.document.content)
          .setSelection(first.childCount && first.child(0).isText ? Selection.cursor([0, 0], 0) : new NodeSelection(next.document, [0])));
        parsed = next;
        root.querySelector('[data-save-status]')!.textContent = 'Saved Markdown reopened. Continue editing in the same editor.';
        view.focus();
      } catch { root.querySelector('[data-save-status]')!.textContent = 'Saved Markdown could not be reopened; the current document is unchanged.'; }
    };
    root.querySelector('[data-save]')!.after(reopen);
    const help = document.createElement('p'); help.textContent = sample === 'blocks'
      ? 'Edit the paragraphs around the divider and image, then save and reopen. The section, image source/description and divider remain structured document content. Image captions have their own control; Save Markdown does not overwrite it. This example is not general 1:1 HTML or print fidelity.'
      : sample === 'tables' ? 'Click a cell to edit. Tab/Shift+Tab move between cells. Save and reopen after editing to verify table structure, alignment and marks. The original uses Fountain’s pipe-table dialect, not CommonMark tables. Author controls and table spacing can differ from the static reader; this is not pixel-perfect reproduction.'
      : 'Optional anonymous inline flow retains inline content without inventing another paragraph. Edit between paragraphs to add text; Enter creates a real paragraph. Save and reopen canonical Markdown to continue editing, including after clearing the text. Native HTML is a reader projection, not an arbitrary-model backup. This example is not a general 1:1 HTML or print-fidelity claim.';
    root.querySelector('[data-warning]')!.before(help);
  }
  root.querySelector<HTMLButtonElement>('[data-save]')!.onclick = () => {
    const saved = MarkdownExporter.exportWithSource(editor.state.doc, parsed.source);
    root.querySelector<HTMLTextAreaElement>('textarea[data-saved]')!.value = saved.markdown;
    root.querySelector('[data-save-status]')!.textContent = `Source preservation: ${saved.preservation}`;
    // Give each snapshot its own sandboxed browsing context. Reassigning srcdoc
    // while a previous preview is still navigating can leave Firefox's frame
    // unresolved during rapid save/clear/reopen cycles. No scripts are enabled.
    const reader = root.querySelector<HTMLIFrameElement>('iframe[title="Fountain scope reader"]')!;
    const snapshot = reader.cloneNode(false) as HTMLIFrameElement;
    snapshot.srcdoc = frame(HTMLExporter.export(editor.state.doc, { document: false }));
    reader.replaceWith(snapshot);
  };
  cleanup = () => { view.destroy(); editor.destroy(); root.remove(); };
  root.scrollIntoView();
  return { source, paragraphs: parsed.document.childCount, issues, destroy: cleanup };
}
