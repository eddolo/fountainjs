// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  AllSelection,
  CellSelection,
  CoreExtension,
  composeExtensions,
  defineExtension,
  Decoration,
  DecorationSet,
  EditorView,
  GapSelection,
  NodeSelection,
  type Node,
  Plugin,
  PluginKey,
  Selection,
  StarterKit,
  createEditor,
  selectGap,
  setTextAlignment,
  toggleList,
  toggleQuote,
  topLevelPosition,
} from '../src';

const paragraph = (value: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

const settleSelection = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('semantic selection DOM bridge', () => {
  it('only restores the draggable attribute temporarily set by a node selection', async () => {
    class DragNodeView {
      dom = document.createElement('section');
      constructor(node: Node) {
        this.dom.setAttribute('draggable', String(node.attrs.draggable));
        const handle = document.createElement('button');
        handle.draggable = true;
        this.dom.append(handle);
      }
    }
    const kit = composeExtensions([CoreExtension, defineExtension({ name: 'native-drag-node',
      nodes: { drag_node: { group: 'block', atom: true, attrs: { draggable: { default: false } }, nodeView: DragNodeView } } })]);
    const editor = createEditor({ schema: kit.schema, content: { type: 'doc', content: [
      { type: 'drag_node', attrs: { draggable: true } }, { type: 'drag_node' }, paragraph('After'),
    ] } });
    const mount = document.createElement('div');
    document.body.append(mount);
    const view = new EditorView(mount, editor), native = document.getSelection()!;
    const host = view.dom.querySelector<HTMLElement>('[data-fountain-path="0"]')!;
    const selected = view.dom.querySelector<HTMLElement>('[data-fountain-path="1"]')!;
    const selectBlock = () => editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [1])));
    try {
      view.dom.focus();
      selectBlock();
      await settleSelection();
      expect(selected.getAttribute('draggable')).toBe('true');
      expect(host.getAttribute('draggable')).toBe('true');
      expect(host.querySelector('button')?.draggable).toBe(true);
      expect(selected.querySelector('button')?.draggable).toBe(true);
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([2, 0], 1)));
      await settleSelection();
      expect(selected.getAttribute('draggable')).toBe('false');
      selectBlock();
      await settleSelection();
      view.destroy();
      expect(selected.getAttribute('draggable')).toBe('false');
      expect(host.draggable).toBe(true);
    } finally { view.destroy(); editor.destroy(); mount.remove(); native.removeAllRanges(); }
  });

  it('finds exact text and block endpoints without enumerating all mounted paths', async () => {
    const content = Array.from({ length: 128 }, (_, index) => paragraph(`Paragraph ${index}`));
    const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content } });
    const mount = document.createElement('div');
    document.body.append(mount);
    const view = new EditorView(mount, editor);
    const native = document.getSelection()!;
    const scans = vi.spyOn(view.dom, 'querySelectorAll');
    try {
      view.dom.focus();
      editor.dispatch(editor.createTransaction().setSelection(Selection.range([1, 0], 2, [126, 0], 3)));
      await settleSelection();
      expect(native.anchorNode?.parentElement?.getAttribute('data-fountain-text-path')).toBe('1.0');
      expect(native.focusNode?.parentElement?.getAttribute('data-fountain-text-path')).toBe('126.0');
      expect(native.anchorOffset).toBe(2);
      expect(native.focusOffset).toBe(3);
      editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [126])));
      await settleSelection();
      expect(view.dom.querySelector('[data-fountain-selected-node]')?.getAttribute('data-fountain-path')).toBe('126');
      expect(scans).not.toHaveBeenCalledWith('[data-fountain-text-path]');
      expect(scans).not.toHaveBeenCalledWith('[data-fountain-path]');
    } finally {
      scans.mockRestore();
      view.destroy(); editor.destroy(); mount.remove(); native.removeAllRanges();
    }
  });

  it.each([...['after-movement', 'during-keydown'].flatMap(timing => [false, true].map(backward => ({ timing, backward, staleModel: false }))),
    { timing: 'during-keydown', backward: false, staleModel: true }])(
    'preserves pending native selection through metadata ($timing, backward: $backward, stale model: $staleModel)', async ({ timing, backward, staleModel }) => {
    const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [paragraph('Edit here')] } });
    const mount = document.createElement('div'); document.body.append(mount);
    const view = new EditorView(mount, editor), native = document.getSelection()!;
    try {
      view.dom.focus();
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], staleModel ? 0 : 1)));
      await settleSelection();
      const text = view.dom.querySelector('[data-fountain-text-path="0.0"]')!.firstChild!;
      if (staleModel) native.collapse(text, 1);
      // Browsers move the native caret before notifying selectionchange. A
      // presence/status update can run in that interval with the old model.
      const update = () => editor.dispatch(editor.createTransaction().setMeta('presence-update', []).setMeta('force', true));
      if (timing === 'during-keydown') {
        view.dom.addEventListener('keydown', update, { once: true });
        view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      }
      native.setBaseAndExtent(text, backward ? 5 : 2, text, 2);
      const range = native.getRangeAt(0);
      if (timing === 'after-movement') update();
      await settleSelection();
      expect(native.focusNode).toBe(text); expect(native.focusOffset).toBe(2);
      expect(native.anchorOffset).toBe(backward ? 5 : 2);
      expect(native.getRangeAt(0)).toBe(range);
      view.dom.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'X' }));
      expect(editor.state.doc.textContent).toBe(backward ? 'EdXhere' : 'EdXit here');
    } finally { view.destroy(); editor.destroy(); mount.remove(); native.removeAllRanges(); }
  });

  it.each([{ timing: 'after-movement', queuedCommand: false }, { timing: 'during-keydown', queuedCommand: false }, { timing: 'during-keydown', queuedCommand: true }])(
    'preserves native movement while metadata rerenders inline decorations ($timing, queued command: $queuedCommand)', async ({ timing, queuedCommand }) => {
    const key = new PluginKey<boolean>('selection-decoration-test');
    const plugin = new Plugin({ key, state: { init: () => false, apply: (transaction, previous) => transaction.getMeta<boolean>('show-range') ?? previous },
      props: { decorations: state => key.get(state) ? DecorationSet.create(state.doc, [Decoration.inline(2, 5, { class: 'test-comment-range' })]) : DecorationSet.empty } });
    const editor = createEditor({ schema: StarterKit.schema, plugins: [plugin], content: { type: 'doc', content: [paragraph('Edit here')] } });
    const mount = document.createElement('div'); document.body.append(mount);
    const view = new EditorView(mount, editor), native = document.getSelection()!;
    try {
      view.dom.focus(); editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], queuedCommand ? 0 : 1)));
      await settleSelection();
      if (queuedCommand) editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 1)));
      const text = view.dom.querySelector('[data-fountain-text-path="0.0"]')!.firstChild!;
      const update = () => editor.dispatch(editor.createTransaction().setMeta('show-range', true).setMeta('force', true));
      if (timing === 'during-keydown') {
        view.dom.addEventListener('keydown', update, { once: true });
        view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        // Simulate the browser default after a keydown handler changed the DOM.
        const current = view.dom.querySelector('[data-fountain-text-path="0.0"]')!;
        native.collapse(current.querySelector('.test-comment-range')!.firstChild!, 1);
      } else { native.collapse(text, 2); update(); }
      await settleSelection();
      expect(view.dom.querySelector('.test-comment-range')).not.toBeNull();
      view.dom.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'X' }));
      expect(editor.state.doc.textContent).toBe('EdXit here');
    } finally { view.destroy(); editor.destroy(); mount.remove(); native.removeAllRanges(); }
  });

  it.each([false, true])('defers a pending command caret when focus moves to an external button before metadata arrives (inline: %s)', async inline => {
    const key = new PluginKey<boolean>('focus-decoration-test');
    const plugin = new Plugin({ key, state: { init: () => false, apply: (transaction, previous) => transaction.getMeta<boolean>('presence-update') ?? previous },
      props: { decorations: state => inline && key.get(state) ? DecorationSet.create(state.doc, [Decoration.inline(2, 5, { class: 'test-comment-range' })]) : DecorationSet.empty } });
    const editor = createEditor({ schema: StarterKit.schema, plugins: [plugin], content: { type: 'doc', content: [paragraph('Edit here')] } });
    const mount = document.createElement('div'), button = document.createElement('button'); document.body.append(mount, button);
    const view = new EditorView(mount, editor), native = document.getSelection()!;
    try {
      view.dom.focus(); editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 1)));
      await settleSelection();
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
      button.focus();
      const held = { anchor: native.anchorNode, anchorOffset: native.anchorOffset, focus: native.focusNode, focusOffset: native.focusOffset };
      editor.dispatch(editor.createTransaction().setMeta('presence-update', true).setMeta('force', true));
      await settleSelection();
      expect(document.activeElement).toBe(button);
      if (!inline) expect({ anchor: native.anchorNode, anchorOffset: native.anchorOffset, focus: native.focusNode, focusOffset: native.focusOffset }).toEqual(held);
      view.dom.focus(); await settleSelection();
      const wrapper = view.dom.querySelector('[data-fountain-text-path="0.0"]')!;
      expect(wrapper.contains(native.focusNode)).toBe(true);
      const prefix = document.createRange(); prefix.setStart(wrapper, 0); prefix.setEnd(native.focusNode!, native.focusOffset);
      expect(prefix.toString().length).toBe(3);
    } finally { view.destroy(); editor.destroy(); mount.remove(); button.remove(); native.removeAllRanges(); }
  });

  it.each((['selection', 'document'] as const).flatMap(kind => [false, true].map(inline => ({ kind, inline }))))(
    'still completes a required $kind sync when metadata follows (inline: $inline)', async ({ kind, inline }) => {
    const key = new PluginKey<boolean>('pending-selection-decoration-test');
    const plugin = new Plugin({ key, state: { init: () => false, apply: (transaction, previous) => transaction.getMeta<boolean>('presence-update') ?? previous },
      props: { decorations: state => inline && key.get(state) ? DecorationSet.create(state.doc, [Decoration.inline(2, 5, { class: 'test-comment-range' })]) : DecorationSet.empty } });
    const editor = createEditor({ schema: StarterKit.schema, plugins: [plugin], content: { type: 'doc', content: [paragraph('Edit here')] } });
    const mount = document.createElement('div'); document.body.append(mount);
    const view = new EditorView(mount, editor), native = document.getSelection()!;
    try {
      view.dom.focus();
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 1)));
      await settleSelection();
      const transaction = editor.createTransaction();
      if (kind === 'document') transaction.insertText([0, 0], 0, 'New ');
      else transaction.setSelection(Selection.cursor([0, 0], 3));
      editor.dispatch(transaction);
      editor.dispatch(editor.createTransaction().setMeta('presence-update', true).setMeta('force', true));
      await settleSelection();
      const wrapper = view.dom.querySelector('[data-fountain-text-path="0.0"]')!;
      expect(wrapper.contains(native.focusNode)).toBe(true);
      const prefix = document.createRange(); prefix.setStart(wrapper, 0); prefix.setEnd(native.focusNode!, native.focusOffset);
      expect(prefix.toString().length).toBe(kind === 'document' ? 5 : 3);
    } finally { view.destroy(); editor.destroy(); mount.remove(); native.removeAllRanges(); }
  });

  it('honors a newer selection dispatched synchronously by a NodeView selection hook', async () => {
    let selectFromHook = () => {};
    class RedirectNodeView {
      dom = document.createElement('section');
      selectNode() { selectFromHook(); }
    }
    const kit = composeExtensions([CoreExtension, defineExtension({ name: 'selection-redirect',
      nodes: { redirect: { group: 'block', atom: true, nodeView: RedirectNodeView } } })]);
    const editor = createEditor({ schema: kit.schema, content: { type: 'doc', content: [{ type: 'redirect' }, paragraph('After')] } });
    const mount = document.createElement('div'); document.body.append(mount);
    const view = new EditorView(mount, editor), native = document.getSelection()!;
    try {
      view.dom.focus(); editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 1)));
      await settleSelection();
      selectFromHook = () => editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 3)));
      editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [0])));
      await settleSelection();
      expect(editor.state.selection).toEqual(Selection.cursor([1, 0], 3));
      expect(native.focusNode).toBe(view.dom.querySelector('[data-fountain-text-path="1.0"]')!.firstChild!);
      expect(native.focusOffset).toBe(3);
    } finally { view.destroy(); editor.destroy(); mount.remove(); native.removeAllRanges(); }
  });

  it('does not capture old DOM paths when presence metadata arrives before a document-change notification', async () => {
    const plugin = new Plugin({ props: { decorations: state => {
      const start = state.doc.child(0).type.name === 'blockquote' ? 3 : 2;
      return DecorationSet.create(state.doc, [Decoration.inline(start, start + 3, { class: 'test-presence-range' })]);
    } } });
    const editor = createEditor({ schema: StarterKit.schema, plugins: [plugin], content: { type: 'doc', content: [paragraph('Edit here')] } });
    // Collaboration subscribes before the view and may synchronously publish
    // presence while the original document notification is still in flight.
    let nativeCaptures = 0;
    const unsubscribe = editor.subscribe((_state, transaction) => {
      if (transaction.getMeta('fountain$selectionFromDOM') === true && ++nativeCaptures > 6) throw new Error('Repeated capture against unreconciled DOM');
      if (transaction.docChanged || transaction.selectionSet) editor.dispatch(editor.createTransaction().setMeta('presence-update', true).setMeta('force', true));
    });
    const mount = document.createElement('div'); document.body.append(mount);
    const view = new EditorView(mount, editor), native = document.getSelection()!;
    try {
      view.dom.focus(); editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
      await settleSelection(); nativeCaptures = 0;
      expect(() => toggleQuote(editor)).not.toThrow();
      await settleSelection();
      expect(nativeCaptures).toBe(0);
      expect(view.dom.querySelector('blockquote')?.textContent).toBe('Edit here');
      expect(editor.state.selection).toEqual(Selection.cursor([0, 0, 0], 3));
      view.dom.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'X' }));
      expect(editor.state.doc.textContent).toBe('EdiXt here');
    } finally { unsubscribe(); view.destroy(); editor.destroy(); mount.remove(); native.removeAllRanges(); }
  });

  it.each(['quote', 'bullet', 'ordered', 'task'].flatMap(kind => [false, true].map(backward => ({ kind, backward }))))(
    'keeps native selection direction while $kind wrapping moves text paths (backward: $backward)', async ({ kind, backward }) => {
      const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: { type: 'doc', content: [
        paragraph('Before'), paragraph('Left'), { type: 'image_super', attrs: { src: '/figure.png', alt: 'Figure' } }, paragraph(''),
      ] } });
      const mount = document.createElement('div'); document.body.append(mount);
      const view = new EditorView(mount, editor), native = document.getSelection()!;
      try {
        await settleSelection(); view.dom.focus();
        const left = view.dom.querySelector('[data-fountain-text-path="1.0"]')!.firstChild!;
        const end = view.dom.querySelector('[data-fountain-text-path="3.0"]')!;
        native.setBaseAndExtent(backward ? end : left, backward ? 0 : 2, backward ? left : end, backward ? 2 : 0);
        view.dom.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
        await settleSelection(); expect(editor.state.selection.kind).toBe('text');
        expect(kind === 'quote' ? toggleQuote(editor) : toggleList(editor, kind as 'bullet' | 'ordered' | 'task')).toBe(true);
        await settleSelection();
        expect(native.isCollapsed).toBe(false);
        expect(backward ? native.focusNode?.textContent : native.anchorNode?.textContent).toBe('Left');
        expect(backward ? native.focusOffset : native.anchorOffset).toBe(2);
        expect(backward ? native.anchorNode?.textContent : native.focusNode?.textContent).toBe('');
      } finally { view.destroy(); editor.destroy(); mount.remove(); native.removeAllRanges(); }
    });

  it.each(['text', 'gap'] as const)('selects the resize handle cell when focus arrives from a %s projection of that same cell', async kind => {
    const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [
      { type: 'table', content: [{ type: 'table_row', content: [{ type: 'table_cell', attrs: { colwidth: [120] }, content: [paragraph('Cell')] }] }] },
      paragraph('Outside'),
    ] } });
    const mount = document.createElement('div'); document.body.append(mount);
    const view = new EditorView(mount, editor);
    try {
      editor.dispatch(editor.createTransaction().setSelection(kind === 'gap'
        ? new GapSelection(editor.state.doc, 0) : Selection.cursor([0, 0, 0, 0, 0], 2)));
      await settleSelection();
      const handle = view.dom.querySelector<HTMLElement>('.fountain-table-cell__resize-handle')!;
      handle.focus(); await settleSelection();
      expect(editor.state.selection).toBeInstanceOf(CellSelection);
      expect((editor.state.selection as CellSelection).cellPaths).toEqual([[0, 0, 0]]);
      expect(document.activeElement).toBe(handle);
    } finally { view.destroy(); editor.destroy(); mount.remove(); }
  });

  it.each(['pointerup', 'pointercancel'] as const)('keeps a NodeView resize gesture owned through %s outside its handle, then accepts keyboard placement', async finish => {
    const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [
      { type: 'table', content: [{ type: 'table_row', content: [{ type: 'table_cell', attrs: { colwidth: [120] }, content: [paragraph('Cell')] }] }] },
      paragraph('Outside'),
    ] } });
    const mount = document.createElement('div'); document.body.append(mount);
    const view = new EditorView(mount, editor), native = document.getSelection()!;
    try {
      const handle = view.dom.querySelector<HTMLElement>('.fountain-table-cell__resize-handle')!;
      const content = view.dom.querySelector<HTMLElement>('.fountain-table-cell__content')!;
      const outside = view.dom.querySelector<HTMLElement>('[data-fountain-text-path="1.0"]')!;
      editor.dispatch(editor.createTransaction().setSelection(new CellSelection(editor.state.doc, [0, 0, 0])));
      handle.focus(); await settleSelection();
      expect(editor.state.selection).toBeInstanceOf(CellSelection);
      // A native control can retain unrelated endpoints from before focus.
      native.setBaseAndExtent(outside.firstChild!, 1, outside.firstChild!, 3);
      handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 120 }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 155 }));
      content.dispatchEvent(new MouseEvent(finish, { bubbles: true }));
      await settleSelection();
      expect(editor.state.selection).toBeInstanceOf(CellSelection);
      expect(document.activeElement).toBe(handle);
      view.dom.focus(); native.setBaseAndExtent(outside.firstChild!, 2, outside.firstChild!, 2);
      outside.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
      await settleSelection();
      expect(editor.state.selection).toEqual(Selection.cursor([1, 0], 2));
    } finally { view.destroy(); editor.destroy(); mount.remove(); native.removeAllRanges(); }
  });

  it.each([[false, false], [true, false], [false, true], [true, true]])('accepts an explicit native placement after a deferred command (range: %s, return focus: %s)', async (range, returnFocus) => {
    const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [paragraph('Before'), paragraph('Target')] } });
    const mount = document.createElement('div'), button = document.createElement('button'); document.body.append(mount, button);
    const view = new EditorView(mount, editor), native = document.getSelection()!;
    try {
      button.focus();
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 2)));
      if (returnFocus) view.dom.focus();
      const target = view.dom.querySelector('[data-fountain-text-path="0.0"]')!.firstChild!;
      native.setBaseAndExtent(target, range ? 5 : 3, target, range ? 1 : 3);
      document.dispatchEvent(new Event('selectionchange'));
      expect(editor.state.selection).toEqual(range ? Selection.range([0, 0], 1, [0, 0], 5) : Selection.cursor([0, 0], 3));
      await settleSelection();
      expect(editor.state.selection).toEqual(range ? Selection.range([0, 0], 1, [0, 0], 5) : Selection.cursor([0, 0], 3));
      expect(document.activeElement).toBe(returnFocus ? view.dom : button);
    } finally { view.destroy(); editor.destroy(); mount.remove(); button.remove(); native.removeAllRanges(); }
  });

  it('keeps an external native input focused when stale editor endpoints are reported', async () => {
    const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [paragraph('Before'), paragraph('Target')] } });
    const mount = document.createElement('div'), input = document.createElement('input'); document.body.append(mount, input);
    const view = new EditorView(mount, editor), native = document.getSelection()!;
    try {
      input.value = 'Native field'; input.focus(); input.setSelectionRange(2, 5);
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 2)));
      const target = view.dom.querySelector('[data-fountain-text-path="0.0"]')!.firstChild!;
      native.setBaseAndExtent(target, 1, target, 4);
      document.dispatchEvent(new Event('selectionchange'));
      await settleSelection();
      expect(editor.state.selection).toEqual(Selection.cursor([1, 0], 2));
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
    } finally { view.destroy(); editor.destroy(); mount.remove(); input.remove(); native.removeAllRanges(); }
  });

  it.each([false, true])('keeps a fresh native caret/range when host focus has no unapplied command selection (backward: %s)', async backward => {
    const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [paragraph('Before'), paragraph('Target')] } });
    const mount = document.createElement('div'); document.body.append(mount);
    const view = new EditorView(mount, editor), native = document.getSelection()!;
    try {
      await settleSelection();
      view.dom.focus();
      const target = view.dom.querySelector('[data-fountain-text-path="1.0"]')!.firstChild!;
      native.setBaseAndExtent(target, backward ? 5 : 2, target, backward ? 1 : 2);
      document.dispatchEvent(new Event('selectionchange'));
      await settleSelection(); await settleSelection();
      expect(native.anchorNode).toBe(target); expect(native.focusNode).toBe(target);
      expect(native.anchorOffset).toBe(backward ? 5 : 2); expect(native.focusOffset).toBe(backward ? 1 : 2);
      expect(editor.state.selection).toEqual(backward ? Selection.range([1, 0], 1, [1, 0], 5) : Selection.cursor([1, 0], 2));
    } finally { view.destroy(); editor.destroy(); mount.remove(); native.removeAllRanges(); }
  });

  it('restores the committed model caret when the editing host receives programmatic focus from a toolbar', async () => {
    const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [paragraph('Before'), paragraph('Target')] } });
    const mount = document.createElement('div'), toolbar = document.createElement('button');
    document.body.append(mount, toolbar);
    const view = new EditorView(mount, editor), native = document.getSelection()!;
    try {
      view.focus();
      toolbar.focus();
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 2)));
      await settleSelection();
      await settleSelection();
      // Native controls may leave old endpoints behind while the model moves.
      // Raw host focus must restore the requested model caret before typing.
      const old = view.dom.querySelector('[data-fountain-text-path="0.0"]')!;
      native.setBaseAndExtent(old.firstChild!, 0, old.firstChild!, 0);
      toolbar.focus();
      view.dom.focus();
      await settleSelection();
      expect(native.focusNode?.textContent).toBe('Target');
      expect(native.focusOffset).toBe(2);
      expect(editor.state.selection).toEqual(Selection.cursor([1, 0], 2));
    } finally { view.destroy(); editor.destroy(); mount.remove(); toolbar.remove(); native.removeAllRanges(); }
  });

  it.each([false, true])('leaves Shift-click text selection inside one cell to the browser (backward: %s)', async backward => {
    const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [{ type: 'table', content: [
      { type: 'table_row', content: [{ type: 'table_cell', content: [paragraph('Left'), paragraph('Right')] }] },
    ] }] } });
    const mount = document.createElement('div'); document.body.append(mount);
    const view = new EditorView(mount, editor), native = document.getSelection()!;
    try {
      const left = view.dom.querySelector('[data-fountain-text-path="0.0.0.0.0"]')!;
      const right = view.dom.querySelector('[data-fountain-text-path="0.0.0.1.0"]')!;
      const anchor = backward ? right : left, focus = backward ? left : right;
      editor.dispatch(editor.createTransaction().setSelection(new Selection(backward ? [0, 0, 0, 1, 0] : [0, 0, 0, 0, 0], backward ? 3 : 2)));
      await settleSelection();
      const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, shiftKey: true });
      focus.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(editor.state.selection).toBeInstanceOf(Selection);
      // jsdom has no native pointer placement; simulate only that browser
      // default, then verify the bridge captures the resulting text range.
      native.setBaseAndExtent(anchor.firstChild!, backward ? 3 : 2, focus.firstChild!, backward ? 2 : 3);
      focus.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
      await settleSelection();
      expect(editor.state.selection).toEqual(Selection.range([0, 0, 0, 0, 0], 2, [0, 0, 0, 1, 0], 3));
    } finally { view.destroy(); editor.destroy(); mount.remove(); native.removeAllRanges(); }
  });

  it('retains explicit whole-cell selection when Shift-click returns to its anchor cell', async () => {
    const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [{ type: 'table', content: [
      { type: 'table_row', content: [{ type: 'table_cell', content: [paragraph('Left')] }, { type: 'table_cell', content: [paragraph('Right')] }] },
    ] }] } });
    const mount = document.createElement('div'); document.body.append(mount);
    const view = new EditorView(mount, editor);
    try {
      editor.dispatch(editor.createTransaction().setSelection(new CellSelection(editor.state.doc, [0, 0, 0], [0, 0, 1])));
      await settleSelection();
      const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, shiftKey: true });
      view.dom.querySelector('[data-fountain-path="0.0.0"]')!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(editor.state.selection).toBeInstanceOf(CellSelection);
      expect((editor.state.selection as CellSelection).cellPaths).toEqual([[0, 0, 0]]);
    } finally { view.destroy(); editor.destroy(); mount.remove(); }
  });

  it.each([false, true])('preserves a native inline-node range but allows returning to text (delete: %s)', async remove => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'Before' },
        { type: 'inline_image', attrs: { src: 'https://example.com/image.png', alt: 'Status' } },
        { type: 'text', text: 'After' },
      ] }] },
    });
    const mount = document.createElement('div');
    document.body.append(mount);
    const view = new EditorView(mount, editor);
    view.dom.querySelector('[data-fountain-node="inline_image"]')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    await settleSelection();
    document.dispatchEvent(new Event('selectionchange'));
    await settleSelection();
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    if (remove) {
      view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
      expect(editor.state.doc.child(0).content.map(node => node.type.name)).toEqual(['text', 'text']);
      expect(editor.getText()).toBe('BeforeAfter');
    } else {
      const text = view.dom.querySelector('[data-fountain-text-path="0.2"]')!.firstChild!;
      document.getSelection()!.setBaseAndExtent(text, 2, text, 2);
      document.dispatchEvent(new Event('selectionchange'));
      await settleSelection();
      expect(editor.state.selection.eq(Selection.cursor([0, 2], 2))).toBe(true);
    }
    view.destroy();
    mount.remove();
  });

  it.each([false, true])('maps paragraph-element boundaries and preserves backward formatting (end boundary: %s)', async end => {
    const editor = createEditor({
      schema: StarterKit.schema, plugins: StarterKit.plugins,
      content: { type: 'doc', content: [paragraph('First'), paragraph('Second'), paragraph('Third')] },
    });
    const mount = document.createElement('div');
    document.body.append(mount);
    const view = new EditorView(mount, editor);
    await settleSelection();
    const second = view.dom.querySelector<HTMLElement>('[data-fountain-path="1"]')!;
    const firstText = view.dom.querySelector('[data-fountain-text-path="0.0"]')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(second, end ? second.childNodes.length : 0, firstText, 0);
    view.dom.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
    await settleSelection();
    expect(editor.state.selection.eq(Selection.range([0, 0], 0, [1, 0], end ? 6 : 0))).toBe(true);
    expect(setTextAlignment(editor, 'center')).toBe(true);
    await settleSelection();
    expect(editor.state.doc.content.map(node => node.attrs.align)).toEqual(['center', end ? 'center' : 'left', 'left']);
    const native = document.getSelection()!;
    expect(native.anchorNode?.parentElement?.getAttribute('data-fountain-text-path')).toBe('1.0');
    expect(native.focusNode?.parentElement?.getAttribute('data-fountain-text-path')).toBe('0.0');
    view.destroy();
    mount.remove();
  });

  it('uses Ctrl/Cmd+A as a document selection and replaces it through beforeinput', async () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: { type: 'doc', content: [paragraph('One'), paragraph('Two')] },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);

    const shortcut = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'a', ctrlKey: true });
    view.dom.dispatchEvent(shortcut);
    await settleSelection();
    expect(shortcut.defaultPrevented).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(AllSelection);
    expect(document.getSelection()?.toString()).toContain('One');
    expect(document.getSelection()?.toString()).toContain('Two');

    view.dom.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: 'Everything',
    }));
    expect(editor.getText()).toBe('Everything');
    view.destroy();
  });

  it('selects an atomic node by pointer and exposes an explicit visual marker', async () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: {
        type: 'doc',
        content: [
          paragraph('Before'),
          { type: 'image_super', attrs: { src: 'https://example.com/image.png', alt: '', title: '', caption: '', width: '100%' } },
          paragraph('After'),
        ],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const image = view.dom.querySelector<HTMLElement>('[data-fountain-node="image_super"]');
    image?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    await settleSelection();

    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).nodePath).toEqual([1]);
    expect(view.dom.querySelector('[data-fountain-selected-node="true"]')?.getAttribute('data-fountain-path')).toBe('1');

    view.dom.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'deleteContentBackward',
    }));
    expect(editor.state.doc.content.some((node) => node.type.name === 'image_super')).toBe(false);
    view.destroy();
  });

  it('extends a table selection with Shift+pointer and marks only its rectangle', async () => {
    const cell = (value: string, header = false) => ({
      type: header ? 'table_header' : 'table_cell',
      content: [paragraph(value)],
    });
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: {
        type: 'doc',
        content: [{
          type: 'table',
          content: [
            { type: 'table_row', content: [cell('A', true), cell('B', true), cell('C', true)] },
            { type: 'table_row', content: [cell('D'), cell('E'), cell('F')] },
          ],
        }],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const head = view.dom.querySelector<HTMLElement>('[data-fountain-path="0.1.2"]');
    head?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, shiftKey: true }));
    await settleSelection();

    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect((editor.state.selection as CellSelection).cellPaths).toEqual([
      [0, 0, 0], [0, 0, 1], [0, 0, 2],
      [0, 1, 0], [0, 1, 1], [0, 1, 2],
    ]);
    expect(view.dom.querySelectorAll('[data-fountain-selected-cell="true"]')).toHaveLength(6);
    document.dispatchEvent(new Event('selectionchange'));
    await settleSelection();
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    view.destroy();
  });

  it('renders a gap caret and inserts text as a real block at that boundary', async () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: { type: 'doc', content: [paragraph('A'), paragraph('B')] },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    expect(selectGap(editor, topLevelPosition(editor.state.doc, 1))).toBe(true);
    await settleSelection();
    expect(editor.state.selection).toBeInstanceOf(GapSelection);
    expect(view.dom.querySelector('[data-fountain-gap="before"]')?.getAttribute('data-fountain-path')).toBe('1');

    view.dom.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: 'Between',
    }));
    expect(editor.getText()).toBe('A\nBetween\nB');
    view.destroy();
  });

  it('maps both DOM sides of a view widget to one logical text boundary', async () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: { type: 'doc', content: [paragraph('ABCDE')] },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const wrapper = view.dom.querySelector<HTMLElement>('[data-fountain-text-path="0.0"]');
    const text = wrapper?.firstChild;
    if (!wrapper || !text || text.nodeType !== window.Node.TEXT_NODE) throw new Error('Expected rendered text.');
    const widget = document.createElement('span');
    widget.dataset.fountainWidget = 'page-gap';
    widget.contentEditable = 'false';
    widget.textContent = 'ignored';
    const insertion = document.createRange();
    insertion.setStart(text, 2);
    insertion.collapse(true);
    insertion.insertNode(widget);

    for (const side of ['before', 'after'] as const) {
      const index = Array.prototype.indexOf.call(wrapper.childNodes, widget) as number;
      const range = document.createRange();
      range.setStart(wrapper, index + (side === 'after' ? 1 : 0));
      range.collapse(true);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      await settleSelection();
      expect(editor.state.selection).toMatchObject({ path: [0, 0], from: 2, to: 2 });
    }

    const before = widget.previousSibling;
    const after = widget.nextSibling;
    if (!before || !after) throw new Error('Expected text on both sides of the widget.');
    const range = document.createRange();
    range.setStart(before, 1);
    range.setEnd(after, 1);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await settleSelection();
    expect(editor.state.selection).toMatchObject({ path: [0, 0], from: 1, to: 3 });
    expect(editor.state.doc.textContent).toBe('ABCDE');
    view.destroy();
  });
});
