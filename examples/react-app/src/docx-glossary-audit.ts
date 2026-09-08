import { Schema, StarterKit, createEditor, EditorView } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';
import { exportDOCX } from 'fountainjs-editor/docx';
import { renderAsync } from 'docx-preview';

let activeView: EditorView | undefined;
let activeEditor: ReturnType<typeof createEditor> | undefined;

export async function mountDOCXGlossaryAudit() {
  activeView?.destroy();
  activeEditor?.destroy();
  document.querySelector('#docx-glossary-audit')?.remove();
  const schema = new Schema(StarterKit.schema);
  const content = ServerHTMLImporter.parse('<h2>Service glossary</h2><p>Use these definitions when reviewing service performance.</p><dl><dt>Latency</dt><dt><em>Response time</em></dt><dd><p>Time to respond.</p><p>Measured in milliseconds.</p><ol start="4"><li>Sample requests</li><li>Record results</li></ol></dd><dt>Throughput</dt><dd><p>Work completed per second.</p><dl><dt>Peak throughput</dt><dd>Highest sustained rate.</dd></dl></dd></dl>', schema);
  const exported = exportDOCX(content, { page: 'letter' });
  const root = document.createElement('section');
  root.id = 'docx-glossary-audit';
  root.innerHTML = '<h2>Glossary Word export audit</h2><p>The browser DOCX viewer is independent of Fountain. Native Word page layout remains unverified.</p><div class="glossary-grid"><article><h3>Fountain editor</h3><div data-editor></div><button type="button">Download edited glossary</button><pre data-report></pre></article><article><h3>Original Word export</h3><div data-word-styles></div><div data-word></div></article></div>';
  const style = document.createElement('style');
  style.textContent = '#docx-glossary-audit{padding:24px;background:#eeeaf8;font-family:Arial,sans-serif}.glossary-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.glossary-grid article{min-width:0;background:white;padding:20px}.glossary-grid [data-word]{overflow:auto}.glossary-grid .docx-wrapper{padding:0;background:white}.glossary-grid .docx-wrapper>section.docx{box-shadow:none;margin:0}.glossary-grid .fountain-editor{min-height:500px;padding:30px}.glossary-grid pre{white-space:pre-wrap;font-size:12px}';
  root.prepend(style);
  document.body.append(root);
  const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: content.toJSON() });
  activeEditor = editor;
  activeView = new EditorView(root.querySelector<HTMLElement>('[data-editor]')!, editor, { ariaLabel: 'Glossary export source' });
  root.querySelector('button')!.onclick = () => {
    const result = exportDOCX(editor.state.doc, { page: 'letter' });
    const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'edited-glossary.docx';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  root.querySelector('[data-report]')!.textContent = [...new Set(exported.report.issues.map(issue => issue.message))].join('\n');
  await renderAsync(exported.bytes, root.querySelector<HTMLElement>('[data-word]')!, root.querySelector<HTMLElement>('[data-word-styles]')!, { inWrapper: true, useBase64URL: true });
  root.scrollIntoView();
  return { bytes: Array.from(exported.bytes), issues: exported.report.issues };
}
