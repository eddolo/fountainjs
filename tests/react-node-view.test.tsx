// @vitest-environment jsdom

import { act } from 'react';
import { describe, expect, it } from 'vitest';
import {
  CoreExtension,
  EditorView,
  Plugin,
  composeExtensions,
  createEditor,
  defineExtension,
  insertText,
  selectNode,
} from '../src';
import { createReactNodeView, type ReactNodeViewProps } from '../src/react';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function CounterNode({ node, selected, getPath, updateAttributes, deleteNode }: ReactNodeViewProps) {
  return <div>
    <output data-react-counter>{String(node.attrs.count)} · {selected ? 'selected' : 'idle'} · {getPath().join('.')}</output>
    <button data-react-increment onClick={() => updateAttributes({ count: Number(node.attrs.count) + 1 })}>Increment</button>
    <button data-react-delete onClick={() => deleteNode()}>Delete</button>
  </div>;
}

describe('React NodeView adapter', () => {
  it('updates attributes, selection state, live paths, event isolation, and cleanup', async () => {
    let pluginClicks = 0;
    const plugin = new Plugin({ props: { handleClick: () => { pluginClicks += 1; return true; } } });
    const kit = composeExtensions([CoreExtension, defineExtension({
      name: 'react-counter',
      nodes: {
        react_counter: {
          group: 'block',
          atom: true,
          attrs: { count: { default: 0, validate: (value) => Number.isInteger(value) } },
          nodeView: createReactNodeView(CounterNode, { tagName: 'section', className: 'react-counter' }),
        },
      },
      plugins: [plugin],
    })]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: {
        type: 'doc',
        content: [
          { type: 'react_counter', attrs: { count: 0 } },
          { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
        ],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    let view: EditorView;
    await act(async () => { view = new EditorView(mount, editor); });
    const wrapper = view!.dom.querySelector('[data-fountain-react-node-view]');
    const increment = () => view!.dom.querySelector<HTMLButtonElement>('[data-react-increment]');

    await act(async () => { increment()?.click(); });
    expect(editor.state.doc.child(0).attrs.count).toBe(1);
    expect(editor.state.selection.kind).toBe('text');
    expect(pluginClicks).toBe(0);
    expect(view!.dom.querySelector('[data-fountain-react-node-view]')).toBe(wrapper);

    await act(async () => { selectNode(editor, [0]); });
    expect(view!.dom.querySelector('[data-react-counter]')?.textContent).toContain('selected');

    const leading = editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Before')]);
    await act(async () => { editor.dispatch(editor.state.createTransaction().replace(0, 0, [leading])); });
    expect(view!.dom.querySelector('[data-fountain-react-node-view]')).toBe(wrapper);
    await act(async () => { increment()?.click(); });
    expect(editor.state.doc.child(1).attrs.count).toBe(2);
    expect(view!.dom.querySelector('[data-react-counter]')?.textContent).toContain('· 1');

    await act(async () => { view!.dom.querySelector<HTMLButtonElement>('[data-react-delete]')?.click(); });
    expect(editor.state.doc.content.some((node) => node.type.name === 'react_counter')).toBe(false);
    expect(view!.dom.querySelector('[data-fountain-react-node-view]')).toBeNull();
    await act(async () => { view!.destroy(); });
  });

  it('keeps React controls separate from model-owned contentDOM children', async () => {
    function CalloutControls({ getPath }: ReactNodeViewProps) {
      return <output data-callout-controls>Callout {getPath().join('.')}</output>;
    }
    const kit = composeExtensions([CoreExtension, defineExtension({
      name: 'react-callout',
      nodes: {
        react_callout: {
          group: 'block',
          content: 'block+',
          nodeView: createReactNodeView(CalloutControls, { contentDOMTagName: 'article' }),
        },
      },
    })]);
    const editor = createEditor({
      schema: kit.schema,
      content: {
        type: 'doc',
        content: [{
          type: 'react_callout',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inside' }] }],
        }],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    let view: EditorView;
    await act(async () => { view = new EditorView(mount, editor); });
    const wrapper = view!.dom.querySelector('[data-fountain-react-node-view]');

    await act(async () => { insertText(editor, '!'); });
    expect(view!.dom.querySelector('[data-fountain-react-node-view]')).toBe(wrapper);
    expect(view!.dom.querySelector('[data-callout-controls]')?.textContent).toBe('Callout 0');
    const contentDOM = view!.dom.querySelector('[data-fountain-react-content-dom]');
    expect(contentDOM?.textContent).toBe('!Inside');
    expect(contentDOM?.querySelectorAll('[data-fountain-node="paragraph"]')).toHaveLength(1);

    await act(async () => { view!.destroy(); });
  });

  it('does not rerender unchanged React NodeViews for an unrelated text edit', async () => {
    let renders = 0;
    function StableCounter({ node }: ReactNodeViewProps) {
      renders += 1;
      return <output>{String(node.attrs.count)}</output>;
    }
    const kit = composeExtensions([CoreExtension, defineExtension({
      name: 'stable-react-counter',
      nodes: {
        stable_react_counter: {
          group: 'block',
          atom: true,
          attrs: { count: { default: 0 } },
          nodeView: createReactNodeView(StableCounter),
        },
      },
    })]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: {
        type: 'doc',
        content: [
          ...Array.from({ length: 50 }, (_, count) => ({ type: 'stable_react_counter', attrs: { count } })),
          { type: 'paragraph', content: [{ type: 'text', text: 'Editable' }] },
        ],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    let view: EditorView;
    await act(async () => { view = new EditorView(mount, editor); });
    const afterMount = renders;

    await act(async () => { editor.dispatch(editor.state.createTransaction().insertText([50, 0], 8, '!')); });
    expect(renders).toBe(afterMount);
    expect(view!.dom.querySelectorAll('[data-fountain-react-node-view]')).toHaveLength(50);

    await act(async () => { view!.destroy(); });
  });
});
