import { CoreExtension, HTMLAnchorExtension, HTMLExporter, HTMLImporter, EditorView, composeExtensions, createEditor, createHistoryPlugin, selectNode, setContent, undo, redo } from 'fountainjs-editor';

/** Public-package host for actual typing, selection, history and save/reopen. */
export function mountHTMLAnchorFixture() {
  const kit = composeExtensions([CoreExtension, HTMLAnchorExtension]);
  const editor = createEditor({ schema: kit.schema, plugins: [createHistoryPlugin()] });
  const host = document.createElement('section'); host.id = 'html-anchor-fixture';
  host.style.cssText = 'background:white;color:#181729;padding:24px;font:18px/1.7 sans-serif;min-height:400px';
  const heading = document.createElement('h2'); heading.textContent = 'Bookmark editing audit';
  const controls = document.createElement('div'), mount = document.createElement('div'), output = document.createElement('pre');
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.html'; input.setAttribute('aria-label', 'Import bookmark document');
  host.append(heading, input, controls, mount, output); document.body.append(host);
  const view = new EditorView(mount, editor, { ariaLabel: 'Bookmark document' });
  const events: unknown[] = [];
  const nativePoint = (node: globalThis.Node | null | undefined, offset: number | undefined) => ({
    node: node?.nodeName, text: node?.textContent, offset,
    path: (node?.nodeType === 1 ? node as Element : node?.parentElement)?.closest('[data-fountain-path], [data-fountain-text-path]')?.outerHTML,
  });
  view.dom.addEventListener('beforeinput', event => {
    const selection = document.getSelection();
    events.push({ event: 'beforeinput', inputType: event.inputType, data: event.data, selection: editor.state.selection,
      anchor: nativePoint(selection?.anchorNode, selection?.anchorOffset), focus: nativePoint(selection?.focusNode, selection?.focusOffset) });
  }, true);
  const unsubscribe = editor.subscribe(state => { events.push({ event: 'state', doc: state.doc.toJSON(), selection: state.selection }); });
  input.addEventListener('change', async () => {
    if (input.files?.[0]) setContent(editor, HTMLImporter.parse(await input.files[0].text(), editor.state.schema));
  });
  const button = (label: string, action: () => void) => {
    const control = document.createElement('button'); control.textContent = label; control.style.margin = '8px';
    control.addEventListener('click', action); controls.append(control);
  };
  button('Undo', () => { undo(editor); });
  button('Redo', () => { redo(editor); });
  button('Select empty bookmark', () => { selectNode(editor, [1, 1]); view.focus(); });
  button('Reopen exported HTML', () => {
    const html = HTMLExporter.export(editor.state.doc, { document: false });
    output.textContent = html;
    setContent(editor, HTMLImporter.parse(html, editor.state.schema));
  });
  return {
    inspect: () => ({ doc: editor.getJSON(), html: HTMLExporter.export(editor.state.doc, { document: false }), events: [...events] }),
    destroy: () => { unsubscribe(); view.destroy(); editor.destroy(); host.remove(); },
  };
}
