import { createEditor, EditorView, NodeSelection, StarterKit, type SchemaSpec } from '../../src';
import '../../src/styles.css';

const schema: SchemaSpec = { ...StarterKit.schema, nodes: { ...StarterKit.schema.nodes } };
if (new URL(location.href).searchParams.has('custom')) {
  const image = schema.nodes.inline_image!;
  schema.nodes.inline_image = { ...image, toDOM: (node, context) => ['span', { 'data-custom-inline-image': 'true' }, image.toDOM!(node, context)] };
}
const editor = createEditor({ schema, plugins: StarterKit.plugins,
  content: { type: 'doc', content: [...Array.from({ length: 40 }, (_, index) => ({ type: 'paragraph', content: [{ type: 'text', text: `Earlier paragraph ${index + 1}` }] })), { type: 'paragraph', content: [{ type: 'inline_image',
    attrs: { src: '/cold-inline-image-a.png', alt: 'Cold test figure', width: 'auto', height: 'auto' } }] }] } });
const view = new EditorView(document.querySelector<HTMLElement>('#editor')!, editor, { ariaLabel: 'Inline image document' });
document.querySelector('#replace')!.addEventListener('click', () => {
  editor.dispatch(editor.createTransaction().setNodeAttrs([40, 0], { ...editor.state.doc.child(40).child(0).attrs, src: '/cold-inline-image-b.png' })
    .setSelection(new NodeSelection(editor.state.doc, [40, 0])));
  view.focus(); view.scrollSelectionIntoView();
});
Object.assign(window, { inlineImageLoadingAudit: { snapshot: () => editor.getJSON() } });
