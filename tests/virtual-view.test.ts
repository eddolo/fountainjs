// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

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
