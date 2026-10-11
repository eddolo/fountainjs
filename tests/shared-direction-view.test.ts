// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createEditor, createHistoryPlugin, EditorView, HTMLImporter, HTMLExporter, Schema, Selection,
  outdentListItem, moveNode, NodeSelection, AllSelection, setTextDirection, undo, redo, type Node } from '../src';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import { textDirectionAttribute, sharedDirectionGroupAttribute } from '../src/core/text-direction';

const source = '<ul dir="ltr"><li><p>Outer parent</p><ol dir="auto" start="0"><li><p>שלום anchor</p></li><li><p>English selected</p></li><li><p>English tail</p></li></ol></li><li><p>Outer after</p></li></ul>';

it('refreshes nested DOM carriers when another fragment supplies the first strong text', () => {
  // jsdom checks attributes/identity only; native direction/layout is separately
  // covered by the unchanged recorded public browser audit.
  const editor = createEditor({ schema: CoreSchemaSpec, content: ServerHTMLImporter.parse(source, new Schema(CoreSchemaSpec)).toJSON(), plugins: [createHistoryPlugin()] });
  const mount = document.createElement('div'); document.body.appendChild(mount);
  const view = new EditorView(mount, editor);
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0, 1, 1, 0, 0], 0)));
  expect(outdentListItem(editor)).toBe(true);
  let moved = mount.querySelector<HTMLElement>('[data-fountain-path="0.1"]')!;
  let suffix = mount.querySelector<HTMLElement>('[data-fountain-path="0.1.1"]')!;
  expect(moved.dir).toBe('rtl'); expect(suffix.dir).toBe('rtl');
  expect(moved.dataset.fountainDirectionOrigin).toBe('auto');
  const paragraph = editor.state.doc.child(0).child(0).child(1).child(0).child(0);
  editor.dispatch(editor.createTransaction().replaceNode([0, 0, 1, 0, 0], [paragraph.copy([editor.state.schema.text('English שלום anchor')])]));
  moved = mount.querySelector<HTMLElement>('[data-fountain-path="0.1"]')!;
  suffix = mount.querySelector<HTMLElement>('[data-fountain-path="0.1.1"]')!;
  expect(moved.dir).toBe('ltr'); expect(suffix.dir).toBe('ltr');
  expect(undo(editor)).toBe(true); expect(mount.querySelector('[data-fountain-path="0.1"]')?.getAttribute('dir')).toBe('rtl');
  expect(redo(editor)).toBe(true); expect(mount.querySelector('[data-fountain-path="0.1"]')?.getAttribute('dir')).toBe('ltr');
  view.destroy(); editor.destroy(); mount.remove();
});

it('updates a genuinely reused top-level fragment after an external anchor edit', () => {
  const schema = new Schema(CoreSchemaSpec);
  const content = ServerHTMLImporter.parse('<blockquote dir="auto"><p>שלום anchor</p><p>English selected</p></blockquote><blockquote dir="ltr"><p>Destination</p></blockquote>', schema);
  const editor = createEditor({ schema: CoreSchemaSpec, content: content.toJSON(), plugins: [createHistoryPlugin()] });
  const mount = document.createElement('div'); document.body.appendChild(mount);
  const view = new EditorView(mount, editor);
  expect(moveNode(editor, { fromPath: [0, 1], toParentPath: [1], toIndex: 1 })).toBe(true);
  const reusedTop = mount.querySelector('[data-fountain-path="1"]');
  const member = mount.querySelector<HTMLElement>('[data-fountain-path="1.1"]')!;
  expect(member.dir).toBe('rtl');
  const anchor = editor.state.doc.child(0).child(0);
  editor.dispatch(editor.createTransaction().replaceNode([0, 0], [anchor.copy([editor.state.schema.text('English שלום anchor')])]));
  expect(mount.querySelector('[data-fountain-path="1"]')).toBe(reusedTop);
  expect(mount.querySelector('[data-fountain-path="1.1"]')).toBe(member);
  expect(member.dir).toBe('ltr');
  expect(undo(editor)).toBe(true); expect(member.dir).toBe('rtl');
  view.destroy(); editor.destroy(); mount.remove();
});

it('reopens generated ownership markers identically in browser and server importers', () => {
  const editor = createEditor({ schema: CoreSchemaSpec, content: ServerHTMLImporter.parse(source, new Schema(CoreSchemaSpec)).toJSON() });
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0, 1, 1, 0, 0], 0)));
  expect(outdentListItem(editor)).toBe(true);
  const html = HTMLExporter.export(editor.state.doc, { document: false });
  const browser = HTMLImporter.parse(html, editor.state.schema), server = ServerHTMLImporter.parse(html, editor.state.schema);
  expect(browser.toJSON()).toEqual(server.toJSON());
  expect(browser.toJSON()).toEqual(editor.getJSON());
  editor.destroy();
});

it('cleans engine projection attributes on a reused custom NodeView after an explicit override', () => {
  class CustomView {
    dom = document.createElement('div');
    constructor(node: Node) { this.update(node); }
    update(node: Node) { this.dom.textContent = String(node.attrs.label); return true; }
  }
  const editor = createEditor({ schema: { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, custom: {
    group: 'block', atom: true, attrs: { dir: textDirectionAttribute, directionGroup: sharedDirectionGroupAttribute, label: { default: '' } },
    nodeView: CustomView,
  } } }, content: { type: 'doc', content: [
    { type: 'blockquote', attrs: { dir: 'auto', directionGroup: 'shared' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'שלום' }] }] },
    { type: 'custom', attrs: { dir: 'auto', directionGroup: 'shared', label: 'UI label is not model text' } },
  ] } });
  const mount = document.createElement('div'); document.body.appendChild(mount);
  const view = new EditorView(mount, editor);
  const member = mount.querySelector<HTMLElement>('[data-fountain-path="1"]')!;
  expect(member.dir).toBe('rtl');
  editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [1])));
  expect(setTextDirection(editor, 'auto')).toBe(true);
  expect(mount.querySelector('[data-fountain-path="1"]')).toBe(member);
  expect(member.dir).toBe('auto');
  expect(member.dataset.fountainDirectionGroup).toBeUndefined();
  expect(member.dataset.fountainDirectionOrigin).toBeUndefined();
  view.destroy(); editor.destroy(); mount.remove();
});

it.each(['fountain', 'html'])('gives each pasted complete context its own identity (%s)', format => {
  const editor = createEditor({ schema: CoreSchemaSpec, content: { type: 'doc', content: [
    { type: 'blockquote', attrs: { dir: 'auto', directionGroup: 'original' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'שלום anchor' }] }] },
    { type: 'blockquote', attrs: { dir: 'auto', directionGroup: 'original' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'English member' }] }] },
  ] }, plugins: [createHistoryPlugin()] });
  const mount = document.createElement('div'); document.body.appendChild(mount);
  const view = new EditorView(mount, editor);
  const values = new Map<string, string>();
  const copy = new Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(copy, 'clipboardData', { value: { setData: (type: string, value: string) => values.set(type, value) } });
  editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
  view.dom.dispatchEvent(copy);
  expect(copy.defaultPrevented).toBe(true);
  if (format === 'html') values.delete('application/x-fountainjs+json');
  const paste = () => {
    const index = editor.state.doc.childCount;
    const transaction = editor.createTransaction().replace(index, index, [editor.state.schema.node('paragraph')]);
    transaction.setSelection(new NodeSelection(transaction.doc, [index]));
    editor.dispatch(transaction);
    const before = editor.getJSON();
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { types: [...values.keys()], files: [], getData: (type: string) => values.get(type) ?? '' } });
    view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const after = editor.getJSON();
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
    expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(after);
    return index;
  };
  try {
    const first = paste(), second = paste();
    const groups = [0, first, second].map(index => editor.state.doc.child(index).attrs.directionGroup);
    expect(new Set(groups).size).toBe(3);
    expect(editor.state.doc.child(first + 1).attrs.directionGroup).toBe(groups[1]);
    expect(editor.state.doc.child(second + 1).attrs.directionGroup).toBe(groups[2]);
    const anchor = editor.state.doc.child(first).child(0);
    editor.dispatch(editor.createTransaction().replaceNode([first, 0], [anchor.copy([editor.state.schema.text('Latin anchor')])]));
    const direction = (index: number) => mount.querySelector(`[data-fountain-path="${index}"]`)?.getAttribute('dir');
    expect([direction(1), direction(first + 1), direction(second + 1)]).toEqual(['rtl', 'ltr', 'rtl']);
    expect(editor.state.doc.child(0).child(0).textContent).toBe('שלום anchor');
  } finally { view.destroy(); editor.destroy(); mount.remove(); }
});

it.each(['fountain', 'html'])('copies a fragment without its anchor as an explicit reported direction snapshot (%s)', format => {
  const content = { type: 'doc', content: [
    { type: 'blockquote', attrs: { dir: 'auto', directionGroup: 'original' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'שלום anchor' }] }] },
    { type: 'blockquote', attrs: { dir: 'auto', directionGroup: 'original' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'English member' }] }] },
  ] };
  const source = createEditor({ schema: CoreSchemaSpec, content });
  const target = createEditor({ schema: CoreSchemaSpec, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Replace' }] }] } });
  const sourceMount = document.createElement('div'), targetMount = document.createElement('div');
  document.body.append(sourceMount, targetMount);
  const reports: import('../src').ExternalPasteReport[] = [];
  const sourceView = new EditorView(sourceMount, source), targetView = new EditorView(targetMount, target, { paste: { onReport: report => reports.push(report) } });
  try {
    const before = source.getJSON(), values = new Map<string, string>();
    source.dispatch(source.createTransaction().setSelection(new NodeSelection(source.state.doc, [1])));
    const copy = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(copy, 'clipboardData', { value: { setData: (type: string, value: string) => values.set(type, value) } });
    sourceView.dom.dispatchEvent(copy);
    expect(source.getJSON()).toEqual(before);
    expect(values.get('text/plain')).toBe('> English member');
    const standalone = ServerHTMLImporter.parse(values.get('text/html')!, target.state.schema);
    expect(standalone.child(0).attrs.dir).toBe('rtl');
    expect(standalone.child(0).attrs.directionGroup).toBeUndefined();
    if (format === 'html') values.delete('application/x-fountainjs+json');
    target.dispatch(target.createTransaction().setSelection(new AllSelection(target.state.doc)));
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { types: [...values.keys()], files: [], getData: (type: string) => values.get(type) ?? '' } });
    targetView.dom.dispatchEvent(paste);
    expect(target.state.doc.child(0).attrs.dir).toBe('rtl');
    expect(target.getText()).toBe('English member');
    expect(reports.at(-1)?.issues).toContainEqual(expect.objectContaining({ lossy: true, message: expect.stringContaining('direction snapshot') }));
  } finally { sourceView.destroy(); targetView.destroy(); source.destroy(); target.destroy(); sourceMount.remove(); targetMount.remove(); }
});
