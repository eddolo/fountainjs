import { AllSelection, CoreSchemaSpec, EditorView, HTMLExporter, createEditor, createHistoryPlugin, selectNode, undo, redo } from 'fountainjs-editor';
import type { ExternalPasteReport } from 'fountainjs-editor';

// Test-only host UI built with public APIs. No clipboard or DOM-selection
// injection. It deliberately exposes selection of a nested whole block.
export function mountInheritedClipboardFixture() {
  const source = createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin()], content: { type: 'doc', content: [
    { type: 'blockquote', attrs: { dir: 'auto', directionGroup: 'outside-anchor' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'שלום anchor' }] }] },
    { type: 'blockquote', attrs: { dir: 'auto', directionGroup: 'outside-anchor' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'English child' }] }] },
  ] } });
  const target = createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin()] });
  const reports: ExternalPasteReport[] = [];
  const host = document.createElement('section'); host.id = 'inherited-clipboard-fixture';
  host.style.cssText = 'background:white;color:black;padding:24px;font:18px/1.6 sans-serif';
  const controls = document.createElement('div'), sourceMount = document.createElement('div'), targetMount = document.createElement('div');
  host.append(controls, sourceMount, targetMount); document.body.append(host);
  const sourceView = new EditorView(sourceMount, source, { ariaLabel: 'Source document' });
  const targetView = new EditorView(targetMount, target, { ariaLabel: 'Destination document', paste: { onReport: report => reports.push(report) } });
  const button = (name: string, action: () => void) => {
    const control = document.createElement('button'); control.textContent = name;
    control.addEventListener('click', action); controls.append(control);
  };
  button('Select nested child block', () => { selectNode(source, [1, 0]); sourceView.focus(); });
  button('Select destination', () => { target.dispatch(target.createTransaction().setSelection(new AllSelection(target.state.doc))); targetView.focus(); });
  button('Undo source', () => { undo(source); });
  button('Undo destination', () => { undo(target); });
  button('Redo destination', () => { redo(target); });
  return {
    inspect: () => ({ source: source.getJSON(), target: target.getJSON(), reports: [...reports], sourceSelection: source.state.selection.kind,
      sourceHTML: HTMLExporter.export(source.state.doc, { document: false }) }),
    destroy: () => { sourceView.destroy(); targetView.destroy(); source.destroy(); target.destroy(); host.remove(); },
  };
}
