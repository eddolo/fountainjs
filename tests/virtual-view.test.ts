// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CoreExtension,
  CoreSchemaSpec,
  Decoration,
  EditorView,
  NodeSelection,
  Plugin,
  Selection,
  composeExtensions,
  createCollaborationExtension,
  createEditor,
  defineExtension,
  selectNextMatch,
  type CollaborationAdapterContext,
} from '../src';

const content = (count: number) => ({
  type: 'doc',
  content: Array.from({ length: count }, (_value, index) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: `Virtual block ${index}` }],
  })),
});

afterEach(() => { document.body.replaceChildren(); });

function setup(count = 1_000) {
  const editor = createEditor({ schema: CoreSchemaSpec, content: content(count) });
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const view = new EditorView(mount, editor, {
    virtualization: {
      minimumBlockCount: 0,
      estimatedBlockHeight: 40,
      overscanPx: 0,
      pinnedOverscanBlocks: 1,
    },
  });
  return { editor, view };
}

describe('virtual EditorView', () => {
  it('captures native caret movement before a viewport render can restore an older model offset', async () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.push(callback); return callbacks.length; });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const { editor, view } = setup();
    try {
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
      view.focus();
      await Promise.resolve();
      callbacks.splice(0).forEach(callback => callback(0));
      await Promise.resolve();
      const text = view.dom.querySelector('[data-fountain-text-path="0.0"]')!.firstChild!;
      const native = document.getSelection()!;
      // Browser default navigation has advanced the caret, but keyup and
      // selectionchange have not yet published that position to the model.
      native.setBaseAndExtent(text, 3, text, 3);
      expect(editor.state.selection.from).toBe(2);
      window.dispatchEvent(new Event('scroll'));
      callbacks.splice(0).forEach(callback => callback(1));
      await Promise.resolve();
      expect(editor.state.selection).toMatchObject({ kind: 'text', path: [0, 0], from: 3, to: 3 });
      expect(native.anchorOffset).toBe(3);
      expect(native.focusOffset).toBe(3);
      expect(editor.state.doc.child(0).textContent).toBe('Virtual block 0');
    } finally { view.destroy(); editor.destroy(); vi.restoreAllMocks(); }
  });

  it.each([
    { key: 'End', ctrlKey: true, metaKey: false, index: 999, offset: 'Virtual block 999'.length },
    { key: 'Home', ctrlKey: true, metaKey: false, index: 0, offset: 0 },
    { key: 'ArrowDown', ctrlKey: false, metaKey: true, index: 999, offset: 'Virtual block 999'.length },
    { key: 'ArrowUp', ctrlKey: false, metaKey: true, index: 0, offset: 0 },
  ])('navigates the full virtual model with $key', async item => {
    const { editor, view } = setup();
    const before = editor.state.doc;
    view.focus();
    const event = new KeyboardEvent('keydown', { ...item, bubbles: true, cancelable: true });
    view.dom.dispatchEvent(event);
    await Promise.resolve();
    expect(event.defaultPrevented).toBe(true);
    expect(editor.state.selection.eq(Selection.cursor([item.index, 0], item.offset))).toBe(true);
    expect(view.dom.querySelector(`[data-fountain-path="${item.index}"]`)).not.toBeNull();
    // Visible rows plus at most three pinned blocks at each selection endpoint.
    expect(view.dom.querySelectorAll(':scope > [data-fountain-path]').length).toBeLessThanOrEqual(Math.ceil(window.innerHeight / 40) + 6);
    expect(editor.state.doc).toBe(before);
    view.destroy(); editor.destroy();
  });

  it.each(['Home', 'End'])('extends a native selection to document %s and retains its anchor', async key => {
    const { editor, view } = setup();
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([500, 0], 4)));
    view.focus();
    const event = new KeyboardEvent('keydown', { key, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    view.dom.dispatchEvent(event);
    await Promise.resolve();
    const expected = key === 'Home' ? Selection.range([0, 0], 0, [500, 0], 4)
      : Selection.range([500, 0], 4, [999, 0], 'Virtual block 999'.length);
    expect(editor.state.selection.eq(expected)).toBe(true);
    const native = document.getSelection()!;
    expect(native.anchorNode?.parentElement?.closest<HTMLElement>('[data-fountain-text-path]')?.dataset.fountainTextPath).toBe('500.0');
    expect(native.anchorOffset).toBe(4);
    const other = key === 'Home' ? 'End' : 'Home';
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: other, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(editor.state.selection.eq(other === 'Home' ? Selection.range([0, 0], 0, [500, 0], 4)
      : Selection.range([500, 0], 4, [999, 0], 'Virtual block 999'.length))).toBe(true);
    expect(document.getSelection()!.anchorOffset).toBe(4);
    // Visible rows plus at most three pinned blocks at each selection endpoint.
    expect(view.dom.querySelectorAll(':scope > [data-fountain-path]').length).toBeLessThanOrEqual(Math.ceil(window.innerHeight / 40) + 6);
    view.destroy(); editor.destroy();
  });

  it('navigates a read-only virtual reader without changing content', () => {
    const editor = createEditor({ schema: CoreSchemaSpec, content: content(1000), editable: false });
    const view = new EditorView(document.body.appendChild(document.createElement('div')), editor, { virtualization: true });
    const before = editor.state.doc;
    view.focus();
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(editor.state.selection.eq(Selection.cursor([999, 0], 'Virtual block 999'.length))).toBe(true);
    expect(editor.state.doc).toBe(before);
    view.destroy(); editor.destroy();
  });

  it('respects plugin ownership of document navigation', () => {
    const editor = createEditor({ schema: CoreSchemaSpec, content: content(1000), plugins: [new Plugin({
      props: { handleKeyDown: (_editor, event) => event.key === 'End' },
    })] });
    const view = new EditorView(document.body.appendChild(document.createElement('div')), editor, { virtualization: true });
    view.focus();
    const before = editor.state.selection;
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(editor.state.selection.eq(before)).toBe(true);
    view.destroy(); editor.destroy();
  });

  it('leaves composition and embedded control navigation alone and removes its listener on destroy', () => {
    const { editor, view } = setup();
    view.focus();
    const before = editor.state.selection;
    const composing = new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, isComposing: true, bubbles: true, cancelable: true });
    view.dom.dispatchEvent(composing);
    expect(composing.defaultPrevented).toBe(false);
    const control = view.dom.appendChild(document.createElement('textarea'));
    const local = new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true, cancelable: true });
    control.dispatchEvent(local);
    expect(local.defaultPrevented).toBe(false);
    expect(editor.state.selection.eq(before)).toBe(true);
    view.destroy();
    const detached = new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true, cancelable: true });
    view.dom.dispatchEvent(detached);
    expect(detached.defaultPrevented).toBe(false);
    editor.destroy();
  });

  it('rejects invalid options without leaving a half-mounted editor surface', () => {
    const editor = createEditor({ schema: CoreSchemaSpec, content: content(10) });
    const mount = document.body.appendChild(document.createElement('div'));

    expect(() => new EditorView(mount, editor, {
      virtualization: { minimumBlockCount: -1 },
    })).toThrow('virtualization.minimumBlockCount must be a non-negative integer.');
    expect(mount.childElementCount).toBe(0);
    editor.destroy();
  });

  it('mounts a bounded viewport while retaining the full scroll geometry', () => {
    const { view } = setup(100_000);
    const mounted = view.dom.querySelectorAll(':scope > [data-fountain-path]');
    const spacer = view.dom.querySelector<HTMLElement>('[data-fountain-virtual-spacer]');

    expect(view.virtualized).toBe(true);
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.length).toBeLessThan(30);
    expect(spacer?.dataset.fountainVirtualSpacer).toMatch(/:\d+$/);
    expect(view.dom.textContent).toContain('Virtual block 0');
    expect(view.dom.textContent).not.toContain('Virtual block 50000');
    view.destroy();
  });

  it('pins programmatic selections and edits far outside the viewport', async () => {
    const { editor, view } = setup();
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([500, 0], 0)));
    await Promise.resolve();

    const selected = view.dom.querySelector<HTMLElement>('[data-fountain-path="500"]');
    expect(selected?.textContent).toBe('Virtual block 500');
    expect(view.dom.querySelectorAll(':scope > [data-fountain-path]').length).toBeLessThan(30);

    editor.dispatch(editor.state.createTransaction().insertText([500, 0], 13, ' updated'));
    expect(view.dom.querySelector('[data-fountain-path="500"]')?.textContent).toBe('Virtual block updated 500');
    view.destroy();
  });

  it('mounts a complete cross-window selection for native copy, then restores the viewport', async () => {
    const { editor, view } = setup();
    editor.dispatch(editor.state.createTransaction().setSelection(
      Selection.range([0, 0], 0, [500, 0], 'Virtual block 500'.length),
    ));
    await Promise.resolve();
    expect(view.dom.querySelector('[data-fountain-path="250"]')).toBeNull();

    view.dom.dispatchEvent(new Event('copy', { bubbles: true, cancelable: true }));
    expect(view.dom.querySelector('[data-fountain-path="250"]')?.textContent).toBe('Virtual block 250');

    await new Promise((resolve) => window.setTimeout(resolve, 1));
    expect(view.dom.querySelector('[data-fountain-path="250"]')).toBeNull();
    expect(view.dom.querySelector('[data-fountain-path="500"]')).not.toBeNull();
    view.destroy();
  });

  it('offers explicit and print-time full rendering without changing document state', () => {
    const { editor, view } = setup();
    const before = editor.state.doc;

    view.setVirtualizationSuspended(true);
    expect(view.virtualized).toBe(false);
    expect(view.dom.querySelectorAll(':scope > [data-fountain-path]')).toHaveLength(1_000);
    expect(editor.state.doc).toBe(before);

    view.setVirtualizationSuspended(false);
    expect(view.virtualized).toBe(true);
    window.dispatchEvent(new Event('beforeprint'));
    expect(view.virtualized).toBe(false);
    expect(view.dom.querySelectorAll(':scope > [data-fountain-path]')).toHaveLength(1_000);
    window.dispatchEvent(new Event('afterprint'));
    expect(view.virtualized).toBe(true);
    expect(editor.state.doc).toBe(before);
    view.destroy();
  });

  it('keeps small documents fully mounted by default', () => {
    const editor = createEditor({ schema: CoreSchemaSpec, content: content(20) });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor, { virtualization: true });
    expect(view.virtualized).toBe(false);
    expect(view.dom.querySelectorAll(':scope > [data-fountain-path]')).toHaveLength(20);
    view.destroy();
  });

  it('mounts decorations and owns NodeView lifecycle only inside active windows', () => {
    let instances = 0;
    let destroyed = 0;
    class ProbeNodeView {
      dom = document.createElement('aside');
      constructor() {
        instances += 1;
        this.dom.dataset.virtualProbe = '';
      }
      destroy() { destroyed += 1; }
    }
    const probe = defineExtension({
      name: 'virtual-probe',
      nodes: { probe: { group: 'block', atom: true, nodeView: ProbeNodeView } },
    });
    const decoration = new Plugin({
      props: {
        decorations: (state) => {
          const from = state.doc.content.slice(0, 500).reduce((position, node) => position + node.nodeSize, 0);
          return [Decoration.node(from, from + state.doc.child(500).nodeSize, {
            class: 'virtual-decoration',
          }, { key: 'virtual-probe-decoration' })];
        },
      },
    });
    const kit = composeExtensions([CoreExtension, probe]);
    const documentContent = {
      type: 'doc',
      content: Array.from({ length: 1_000 }, (_value, index) => index === 500
        ? { type: 'probe' }
        : { type: 'paragraph', content: [{ type: 'text', text: `Virtual block ${index}` }] }),
    };
    const editor = createEditor({ schema: kit.schema, plugins: [...kit.plugins, decoration], content: documentContent });
    const mount = document.body.appendChild(document.createElement('div'));
    const view = new EditorView(mount, editor, {
      virtualization: { minimumBlockCount: 0, estimatedBlockHeight: 40, overscanPx: 0 },
    });

    expect(instances).toBe(0);
    editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, [500])));
    const rendered = view.dom.querySelector<HTMLElement>('[data-virtual-probe]');
    expect(rendered).not.toBeNull();
    expect(rendered?.classList.contains('virtual-decoration')).toBe(true);
    expect(instances).toBe(1);

    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    expect(view.dom.querySelector('[data-virtual-probe]')).toBeNull();
    expect(destroyed).toBe(1);
    editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, [500])));
    expect(instances).toBe(2);
    view.destroy();
    expect(destroyed).toBe(2);
  });

  it('brings model-backed search results into the viewport DOM', () => {
    const documentContent = content(1_000);
    documentContent.content[900] = {
      type: 'paragraph', content: [{ type: 'text', text: 'Unique distant needle' }],
    };
    const editor = createEditor({ schema: CoreSchemaSpec, content: documentContent });
    const mount = document.body.appendChild(document.createElement('div'));
    const view = new EditorView(mount, editor, {
      virtualization: { minimumBlockCount: 0, estimatedBlockHeight: 40, overscanPx: 0 },
    });

    expect(view.dom.querySelector('[data-fountain-path="900"]')).toBeNull();
    expect(selectNextMatch(editor, 'distant needle')).toBe(true);
    expect(editor.state.selection).toMatchObject({ path: [900, 0], from: 7, to: 21 });
    expect(view.dom.querySelector('[data-fountain-path="900"]')?.textContent).toBe('Unique distant needle');
    view.destroy();
  });

  it('renders remote collaboration transactions inside a pinned distant window', () => {
    let collaborationContext!: CollaborationAdapterContext;
    const collaboration = createCollaborationExtension({
      adapter: () => ({ connect: (context) => { collaborationContext = context; } }),
    });
    const kit = composeExtensions([CoreExtension, collaboration]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: content(1_000) });
    const mount = document.body.appendChild(document.createElement('div'));
    const view = new EditorView(mount, editor, {
      virtualization: { minimumBlockCount: 0, estimatedBlockHeight: 40, overscanPx: 0 },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([900, 0], 0)));

    const remote = editor.state.createTransaction().insertText([900, 0], 0, 'Remote ');
    expect(collaborationContext.applyRemoteTransaction(remote, { origin: 'virtual-peer' })).toBe(true);
    expect(view.dom.querySelector('[data-fountain-path="900"]')?.textContent).toBe('Remote Virtual block 900');
    expect(view.dom.querySelectorAll(':scope > [data-fountain-path]').length).toBeLessThan(30);
    view.destroy();
    editor.destroy();
  });
});
