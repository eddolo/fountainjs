/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EditorView, CoreSchemaSpec, createEditor, moveNode, type Node,
  type NodeViewConstructor,
} from '../src';

const views: EditorView[] = [];
afterEach(() => { views.splice(0).forEach(view => view.destroy()); document.body.replaceChildren(); });

function setup(contextAware = true, throwing = false, virtual = false) {
  const notices = vi.fn();
  const onError = vi.fn();
  const updates = vi.fn();
  const instances: { dom: HTMLElement; getPath: () => number[] }[] = [];
  class TestView {
    dom = document.createElement('button');
    updateDocument?: (doc: Node) => void;
    constructor(node: Node, _view: unknown, readonly getPath: () => number[]) {
      this.dom.textContent = String(node.attrs.label);
      instances.push(this);
      if (contextAware) this.updateDocument = doc => {
        const path = getPath();
        expect(this.dom.isConnected).toBe(true);
        expect(this.dom.dataset.fountainPath).toBe(path.join('.'));
        expect(path.reduce((parent, index) => parent.child(index), doc).attrs.label).toBe(this.dom.textContent);
        notices(this.dom.textContent, path);
        if (throwing && this.dom.textContent === 'A') throw new Error('Host context renderer failed');
      };
    }
    update(node: Node) { updates(node.attrs.label); this.dom.textContent = String(node.attrs.label); return true; }
  }
  const editor = createEditor({ schema: {
    ...CoreSchemaSpec,
    nodes: { ...CoreSchemaSpec.nodes, context_atom: {
      group: 'block', atom: true, attrs: { label: { default: '' } }, nodeView: TestView as NodeViewConstructor,
    } },
  }, content: { type: 'doc', content: ['A', 'B', 'C'].map(label => ({ type: 'context_atom', attrs: { label } })) } });
  const mount = document.createElement('div');
  document.body.append(mount);
  const view = new EditorView(mount, editor, {
    onError, ...(virtual ? { virtualization: { minimumBlockCount: 0 } } : {}),
  });
  views.push(view);
  return { view, editor, instances, notices, onError, updates };
}

describe('mounted node-view document notifications', () => {
  it.each([false, true])('keeps DOM identity and live paths together after moves (context hook %s)', contextAware => {
    const { editor, view, instances, notices, updates, onError } = setup(contextAware);
    const originalDOM = instances.map(instance => instance.dom);
    expect(moveNode(editor, { fromPath: [2], toParentPath: [], toIndex: 0 })).toBe(true);
    expect([...view.dom.querySelectorAll('button')]).toEqual([originalDOM[2], originalDOM[0], originalDOM[1]]);
    expect(instances.map(instance => instance.getPath())).toEqual([[1], [2], [0]]);
    expect(instances).toHaveLength(3);
    expect(updates).not.toHaveBeenCalled();
    expect(notices).toHaveBeenCalledTimes(contextAware ? 6 : 0);
    const movedPath = instances[2].getPath();
    editor.dispatch(editor.state.createTransaction().setNodeAttrs(movedPath, { label: 'Changed C' }));
    expect(editor.state.doc.child(0).attrs.label).toBe('Changed C');
    expect(view.dom.querySelector('button')).toBe(originalDOM[2]);
    expect(originalDOM[2].textContent).toBe('Changed C');
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps virtualized reused views attached to their actual blocks', () => {
    const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    try {
      const { editor, instances, onError, updates } = setup(true, false, true);
      expect(moveNode(editor, { fromPath: [2], toParentPath: [], toIndex: 0 })).toBe(true);
      expect(instances.map(instance => instance.getPath())).toEqual([[1], [2], [0]]);
      expect(updates).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    } finally { scroll.mockRestore(); }
  });

  it('preserves identity when an earlier block is deleted and the old path no longer exists', () => {
    const { editor, instances, view, onError } = setup();
    const last = instances[2];
    editor.dispatch(editor.state.createTransaction().replaceNode([0]));
    expect(last.getPath()).toEqual([1]);
    expect(view.dom.querySelectorAll('button')[1]).toBe(last.dom);
    expect(instances).toHaveLength(3);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a failing hook while notifying the other views and reconnecting observation', () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    try {
      const { editor, onError, notices } = setup(true, true);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Host context renderer failed' }));
      const calls = observe.mock.calls.length;
      editor.dispatch(editor.state.createTransaction().setNodeAttrs([1], { label: 'Updated B' }));
      expect(notices).toHaveBeenLastCalledWith('C', [2]);
      expect(onError).toHaveBeenCalledTimes(2);
      expect(observe.mock.calls.length).toBeGreaterThan(calls);
      editor.dispatch(editor.state.createTransaction().setNodeAttrs([0], { label: 'Recovered A' }));
      expect(onError).toHaveBeenCalledTimes(2);
    } finally { observe.mockRestore(); }
  });
});
