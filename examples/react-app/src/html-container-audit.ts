import { HTMLContainerExtension, StarterKit, composeExtensions, createEditor, EditorView, Schema, HTMLExporter, MarkdownImporter, MarkdownExporter } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';

let view: EditorView | undefined;
let editor: ReturnType<typeof createEditor> | undefined;
export function mountHTMLContainerAudit() {
  view?.destroy(); editor?.destroy();
  document.querySelector('#html-container-audit')?.remove();
  const kit = composeExtensions([...StarterKit.extensions, HTMLContainerExtension]);
  const source = '<section id="handover" lang="en">\n\n## Release handover\n\nInspect logs  \nCheck timestamps\n\n<div class="checks">\n\n- Review errors\n- Record outcome\n\n</div>\n\n</section>';
  const parsed = MarkdownImporter.parseWithSource(source, new Schema(kit.schema), { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow });
  const root = document.createElement('section');
  root.id = 'html-container-audit';
  root.innerHTML = '<h2>Structured section handoff</h2><p>This audit outlines section wrappers for inspection. The module does not impose a visual theme.</p><div data-editor></div><button type="button">Preview saved section</button><div data-reader></div>';
  const style = document.createElement('style');
  style.textContent = '#html-container-audit{max-width:900px;margin:30px auto;padding:30px;background:#f5f2ff;font-family:Arial}#html-container-audit .fountain-editor{padding:30px;background:white}#html-container-audit .fountain-editor section,#html-container-audit .fountain-editor .checks{outline:1px dashed #8676bf;padding:12px}#html-container-audit [data-reader]{padding:30px;background:white;margin-top:20px}';
  root.prepend(style); document.body.append(root);
  editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: parsed.document.toJSON() });
  view = new EditorView(root.querySelector<HTMLElement>('[data-editor]')!, editor, { ariaLabel: 'Structured section editor' });
  root.querySelector('button')!.onclick = () => {
    root.querySelector('[data-reader]')!.innerHTML = HTMLExporter.export(editor!.state.doc, { document: false });
  };
  root.scrollIntoView();
  return { source, retained: MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown };
}
