import { CoreSchemaSpec, HTMLContainerExtension, Schema, MarkdownImporter, MarkdownExporter, HTMLExporter,
  EditorState, createEditor, createHistoryPlugin, EditorView } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';

let cleanup: (() => void) | undefined;
export function mountMarkdownDocumentAudit(referenceHTML: string) {
  cleanup?.();
  const spec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLContainerExtension.nodes } };
  const schema = new Schema(spec);
  const source = '<a href="/guide">First paragraph.\n\nSecond **paragraph**.</a>\n';
  const issues: string[] = [];
  const parsed = MarkdownImporter.parseWithSource(source, schema, { parseHTMLDocument: (segments, target, context) => {
    const result = new ServerHTMLImporter().parseTextBlockFlowWithReport(segments, target, context);
    issues.push(...result.issues.map(issue => issue.message));
    return result.nodes;
  } });
  const root = document.createElement('section'); root.id = 'markdown-document-audit';
  root.innerHTML = '<h2>HTML scope across paragraphs</h2><p data-warning></p><h3>Fountain editor</h3><div data-editor></div><button type="button" data-save>Save Markdown</button><label>Saved scope Markdown<textarea readonly></textarea></label><p role="status"></p><h3>Fountain reader projection</h3><iframe title="Fountain scope reader" sandbox=""></iframe><h3>CommonMark reference HTML (static, no scripts)</h3><iframe title="Reference scope reader" sandbox=""></iframe>';
  const style = document.createElement('style');
  style.textContent = '#markdown-document-audit{max-width:960px;margin:30px auto;padding:30px;background:#f5f2ff;font:16px/1.5 Arial}#markdown-document-audit .fountain-editor{min-height:200px;padding:24px;background:white}#markdown-document-audit textarea{display:block;width:100%;min-height:100px}#markdown-document-audit iframe{width:100%;height:230px;background:white;border:1px solid #b8acd4}#markdown-document-audit button{padding:10px;margin:12px 0}';
  root.prepend(style); document.body.append(root);
  root.querySelector('[data-warning]')!.textContent = [...new Set(issues)].join(' ');
  const frame = (html: string) => `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:16px/1.5 Arial;padding:20px}p{margin:16px 0}</style></head><body>${html}</body></html>`;
  root.querySelectorAll('iframe')[1].srcdoc = frame(referenceHTML);
  const editor = createEditor({ schema: spec, state: EditorState.create({ schema, doc: parsed.document, plugins: [createHistoryPlugin()] }) });
  const view = new EditorView(root.querySelector<HTMLElement>('[data-editor]')!, editor, { ariaLabel: 'Whole-document scope editor' });
  root.querySelector<HTMLButtonElement>('[data-save]')!.onclick = () => {
    const saved = MarkdownExporter.exportWithSource(editor.state.doc, parsed.source);
    root.querySelector('textarea')!.value = saved.markdown;
    root.querySelector('[role=status]')!.textContent = `Source preservation: ${saved.preservation}`;
    root.querySelectorAll('iframe')[0].srcdoc = frame(HTMLExporter.export(editor.state.doc, { document: false }));
  };
  cleanup = () => { view.destroy(); editor.destroy(); root.remove(); };
  root.scrollIntoView();
  return { source, paragraphs: parsed.document.childCount, issues };
}
