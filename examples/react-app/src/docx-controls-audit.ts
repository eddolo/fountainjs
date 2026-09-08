import { Schema, StarterKit, createEditor, EditorView } from 'fountainjs-editor';
import { exportDOCX, importDOCX } from 'fountainjs-editor/docx';
import { renderAsync } from 'docx-preview';
import { contentControlFixture } from '../../../tests/fixtures/docx-content-control-fixture';

let activeView: EditorView | undefined;
let activeEditor: ReturnType<typeof createEditor> | undefined;
export async function mountDOCXControlsAudit() {
  activeView?.destroy();
  activeEditor?.destroy();
  document.querySelector('#docx-controls-audit')?.remove();
  const schema = new Schema(StarterKit.schema);
  const p = schema.node('paragraph', {}, [schema.text('Envelope')]);
  const envelope = exportDOCX(schema.node('doc', {}, [schema.node('ordered_list', { start: 4 }, [schema.node('list_item', {}, [p])])]), { page: 'letter' });
  const bytes = contentControlFixture(envelope.bytes);
  const imported = importDOCX(bytes, schema);
  const root = document.createElement('section');
  root.id = 'docx-controls-audit';
  root.innerHTML = '<h2>Word content control handoff</h2><p>Left: independent DOCX viewer. Right: editable imported content. Control bindings and locks are not imported.</p><div class="control-grid"><article><h3>Original DOCX</h3><div data-word-styles></div><div data-word></div></article><article><h3>Fountain editor</h3><div data-editor></div><pre data-report></pre></article></div>';
  const style = document.createElement('style');
  style.textContent = '#docx-controls-audit{padding:24px;background:#eeeaf8;font-family:Arial,sans-serif}.control-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.control-grid article{min-width:0;background:white;padding:20px}.control-grid [data-word]{overflow:auto}.control-grid .docx-wrapper{padding:0;background:white}.control-grid .docx-wrapper>section.docx{box-shadow:none;margin:0}.control-grid pre{white-space:pre-wrap;font-size:12px}.control-grid .fountain-editor{min-height:500px;padding:30px}@media(max-width:700px){.control-grid{grid-template-columns:1fr}}';
  root.prepend(style);
  document.body.append(root);
  const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: imported.document.toJSON() });
  activeEditor = editor;
  activeView = new EditorView(root.querySelector<HTMLElement>('[data-editor]')!, editor, { ariaLabel: 'Imported control content' });
  const download = document.createElement('button');
  download.textContent = 'Download edited DOCX';
  download.onclick = () => {
    const exported = exportDOCX(editor.state.doc, { page: 'letter' });
    const url = URL.createObjectURL(new Blob([new Uint8Array(exported.bytes)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'edited-handover.docx';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  root.querySelector('[data-editor]')!.after(download);
  root.querySelector('[data-report]')!.textContent = imported.report.issues.map(issue => issue.message).join('\n');
  await renderAsync(bytes, root.querySelector<HTMLElement>('[data-word]')!, root.querySelector<HTMLElement>('[data-word-styles]')!, { inWrapper: true, useBase64URL: true });
  const viewerIssues = document.createElement('p');
  viewerIssues.dataset.viewerIssues = '';
  const missing = ['API gateway', 'Ready for review'].filter(text => !root.querySelector('[data-word]')!.textContent?.includes(text));
  viewerIssues.textContent = missing.length
    ? `Independent browser DOCX viewer omitted table-cell control content: ${missing.join('; ')}. The original archive retains it. This is not a native Word layout check.`
    : 'The browser viewer retained the sample content. This is not a native Word layout check.';
  root.querySelector('[data-word]')!.after(viewerIssues);
  root.scrollIntoView();
  return { bytes: Array.from(bytes), issues: imported.report.issues, document: imported.document.toJSON() };
}
