// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { CoreSchemaSpec, EditorView, createEditor, type Node as ModelNode, type ParagraphLayout } from '../src';

it('does not restore stale projected margins after a reused custom view writes its new plain layout', () => {
  class ParagraphView {
    readonly dom = document.createElement('p');
    readonly contentDOM = this.dom;
    constructor(node: ModelNode) { this.update(node); }
    update(node: ModelNode) {
      const layout = node.attrs.layout as ParagraphLayout;
      this.dom.style.marginBlockStart = `${layout.spacingBefore ?? 0}pt`;
      this.dom.style.marginBlockEnd = `${layout.spacingAfter ?? 0}pt`;
      return true;
    }
  }
  const layout = { unit: 'pt', spacingGroup: 'body', spacingBefore: 12, spacingAfter: 10, contextualSpacing: true };
  const p = (text: string) => ({ type: 'paragraph', attrs: { layout }, content: [{ type: 'text', text }] });
  const schema = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
    paragraph: { ...CoreSchemaSpec.nodes.paragraph, nodeView: ParagraphView } } };
  const editor = createEditor({ schema, content: { type: 'doc', content: [p('Before'), p('After')] } });
  const mount = document.body.appendChild(document.createElement('div'));
  const view = new EditorView(mount, editor);
  try {
    const target = view.dom.querySelectorAll('p')[1]!;
    expect(target.style.marginBlockStart).toBe('0pt');
    editor.dispatch(editor.createTransaction().setNodeAttrs([1], { ...editor.state.doc.child(1).attrs,
      layout: { unit: 'pt', spacingBefore: 0, spacingAfter: 0 } }));
    expect(view.dom.querySelectorAll('p')[1]).toBe(target);
    expect(target.style.marginBlockStart).toBe('0pt');
    expect(view.dom.querySelectorAll('p')[0]!.style.marginBlockEnd).toBe('10pt');
  } finally { view.destroy(); editor.destroy(); mount.remove(); }
});

it('projects current spacing after context-dependent custom view callbacks refresh their base styles', () => {
  class ContextView {
    readonly dom = document.createElement('p');
    readonly contentDOM = this.dom;
    private current: ModelNode;
    constructor(node: ModelNode) { this.current = node; }
    update(node: ModelNode) { this.current = node; return true; }
    updateDocument() {
      const layout = this.current.attrs.layout as ParagraphLayout;
      this.dom.style.marginBlockStart = `${layout.spacingBefore ?? 0}pt`;
      this.dom.style.marginBlockEnd = `${layout.spacingAfter ?? 0}pt`;
    }
  }
  const layout = { unit: 'pt', spacingGroup: 'body', spacingBefore: 12, spacingAfter: 10, contextualSpacing: true };
  const p = (text: string) => ({ type: 'paragraph', attrs: { layout }, content: [{ type: 'text', text }] });
  const editor = createEditor({ schema: { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
    paragraph: { ...CoreSchemaSpec.nodes.paragraph, nodeView: ContextView } } },
    content: { type: 'doc', content: [p('Before'), p('After')] } });
  const mount = document.body.appendChild(document.createElement('div'));
  const view = new EditorView(mount, editor);
  try {
    const target = view.dom.querySelectorAll('p')[1]!;
    expect(target.style.marginBlockStart).toBe('0pt');
    editor.dispatch(editor.createTransaction().setNodeAttrs([0], { ...editor.state.doc.child(0).attrs,
      layout: { ...layout, spacingGroup: 'other' } }));
    expect(target.style.marginBlockStart).toBe('12pt');
    editor.dispatch(editor.createTransaction().setNodeAttrs([0], { ...editor.state.doc.child(0).attrs, layout }));
    expect(view.dom.querySelectorAll('p')[1]).toBe(target);
    expect(target.style.marginBlockStart).toBe('0pt');
  } finally { view.destroy(); editor.destroy(); mount.remove(); }
});
