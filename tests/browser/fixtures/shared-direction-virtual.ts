import { CoreSchemaSpec, EditorView, Selection, createEditor, createHistoryPlugin, undo, redo } from '../../../src';

// Integration fixture only, not a production demo or editor API. Host controls
// simulate an offscreen update; visible fragment edits use native keyboard input.
export function mountSharedDirectionVirtualFixture() {
  const editor = createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin()], content: {
    type: 'doc', content: Array.from({ length: 100_000 }, (_, index) => ({
      type: 'paragraph', attrs: { dir: 'auto', directionGroup: 'virtual-shared' },
      content: [{ type: 'text', text: index === 99_999 ? 'שלום anchor' : `123 😀 ${index}` }],
    })),
  } });
  const host = document.createElement('section');
  host.id = 'shared-direction-virtual-fixture';
  host.style.cssText = 'background:white;color:black;padding:16px;font:18px/1.6 sans-serif';
  const label = document.createElement('label');
  label.textContent = 'Offscreen anchor text ';
  const input = document.createElement('input'); input.value = 'שלום anchor'; label.append(input);
  host.append(label);
  const timings: number[] = [];
  const button = (name: string, action: () => void) => {
    const control = document.createElement('button'); control.textContent = name;
    control.addEventListener('click', action); host.append(control);
  };
  button('Apply offscreen anchor', () => {
    const started = performance.now();
    const anchor = editor.state.doc.child(99_999);
    editor.dispatch(editor.createTransaction().replaceNode([99_999], [anchor.copy([editor.state.schema.text(input.value)])]));
    timings.push(performance.now() - started);
  });
  button('Show middle fragment', () => {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([50_000, 0], 0)));
    view.focus();
    // Pinning ensures the block is mounted, but a navigation control also has
    // to scroll to it. Mount presence alone is not visible-user evidence.
    view.dom.querySelector('[data-fountain-path="50000"]')?.scrollIntoView({ block: 'center' });
  });
  button('Undo virtual edit', () => { undo(editor); });
  button('Redo virtual edit', () => { redo(editor); });
  const scroll = document.createElement('div');
  scroll.style.cssText = 'height:320px;width:700px;overflow:auto;border:1px solid #aaa;margin-top:12px;position:relative';
  host.append(scroll); document.body.append(host);
  const view = new EditorView(scroll, editor, { ariaLabel: 'Shared virtual document', virtualization: {
    scrollContainer: scroll, minimumBlockCount: 0, estimatedBlockHeight: 48, overscanPx: 96, pinnedOverscanBlocks: 1,
  } });
  return {
    inspect: () => ({
      blockCount: editor.state.doc.childCount,
      mountedCount: view.dom.querySelectorAll(':scope > [data-fountain-path]').length,
      anchorMounted: Boolean(view.dom.querySelector('[data-fountain-path="99999"]')),
      scrollTop: scroll.scrollTop,
      anchorText: editor.state.doc.child(99_999).textContent,
      memberText: editor.state.doc.child(50_000).textContent,
      anchorGroup: editor.state.doc.child(99_999).attrs.directionGroup,
      memberGroup: editor.state.doc.child(50_000).attrs.directionGroup,
      timings: [...timings],
    }),
    destroy: () => { view.destroy(); editor.destroy(); host.remove(); },
  };
}
