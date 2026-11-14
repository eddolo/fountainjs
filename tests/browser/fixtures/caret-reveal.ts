import { CoreExtension, EditorView, Selection, composeExtensions, createEditor } from 'fountainjs-editor';

/** Controlled embedding geometry, using the built public package and native input. */
export function mountCaretRevealFixture(horizontal = false) {
  document.getElementById('caret-reveal-fixture')?.remove();
  const host = document.createElement('section'); host.id = 'caret-reveal-fixture';
  host.style.cssText = 'position:fixed;inset:80px auto auto 24px;z-index:10000;width:440px;max-width:90vw;background:white;color:black;padding:12px;border:1px solid #777';
  const controls = document.createElement('div'), outer = document.createElement('div'), inner = document.createElement('div');
  outer.setAttribute('aria-label', 'Outer document scroller'); inner.setAttribute('aria-label', 'Inner document scroller');
  outer.style.cssText = 'height:300px;overflow:auto;scroll-padding:12px;border:3px solid #777';
  inner.style.cssText = 'height:180px;width:320px;overflow:auto;scroll-padding:8px;border:3px solid #444';
  const before = document.createElement('div'), after = document.createElement('div');
  before.style.height = '190px'; after.style.height = '190px';
  before.textContent = 'Content before the embedded editor'; after.textContent = 'Content after the embedded editor';
  outer.append(before, inner, after); host.append(controls, outer); document.body.prepend(host);
  const kit = composeExtensions([CoreExtension]);
  const editor = createEditor({ schema: kit.schema, content: { type: 'doc', content: [{ type: 'paragraph',
    content: [{ type: 'text', text: ('Long technical paragraph with source and references. ').repeat(100) }] }] } });
  const view = new EditorView(inner, editor, { ariaLabel: 'Nested caret editor' });
  if (horizontal) view.dom.style.cssText = 'width:max-content;max-width:none;white-space:pre';
  const review = document.createElement('button'); review.textContent = 'Review beginning';
  review.addEventListener('mousedown', event => event.preventDefault());
  review.addEventListener('click', () => {
    inner.scrollTo({ top: 0, left: 0, behavior: 'instant' }); outer.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  const field = document.createElement('input'); field.setAttribute('aria-label', 'External host field');
  const resume = document.createElement('button'); resume.textContent = 'Resume editing'; resume.addEventListener('click', () => view.focus());
  controls.append(review, field, resume);
  return {
    scroll: () => ({ innerTop: inner.scrollTop, innerLeft: inner.scrollLeft, outerTop: outer.scrollTop,
      outerLeft: outer.scrollLeft, windowTop: window.scrollY, windowLeft: window.scrollX }),
    update: (remote: boolean) => {
      const length = editor.state.doc.child(0).child(0).text!.length;
      editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Background ')
        .setSelection(Selection.cursor([0, 0], length + 11)).setMeta('fountain$collaborationRemote', remote));
    },
    destroy: () => { view.destroy(); editor.destroy(); host.remove(); },
  };
}
