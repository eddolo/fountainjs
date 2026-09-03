import { createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  removeNode,
  setNodeAttributes,
  type Attributes,
  type Editor,
  type Node,
  type NodeViewConstructor,
  type NodeViewLike,
} from '../core';

interface EditorViewLike { readonly editor: Editor; }

export interface ReactNodeViewProps {
  readonly node: Node;
  readonly selected: boolean;
  readonly editor: Editor | null;
  readonly contentDOM?: HTMLElement;
  getPath(): number[];
  updateAttributes(attrs: Attributes): boolean;
  deleteNode(): boolean;
}

export interface ReactNodeViewOptions {
  tagName?: keyof HTMLElementTagNameMap;
  contentDOMTagName?: keyof HTMLElementTagNameMap | null;
  className?: string;
  stopEvent?: (event: Event, view: NodeViewLike) => boolean;
  ignoreMutation?: (mutation: MutationRecord, view: NodeViewLike) => boolean;
}

/** Adapts a React component to the framework-neutral NodeView lifecycle. */
export function createReactNodeView(
  Component: ComponentType<ReactNodeViewProps>,
  options: ReactNodeViewOptions = {},
): NodeViewConstructor {
  return class ReactNodeView implements NodeViewLike {
    readonly dom: HTMLElement;
    readonly contentDOM?: HTMLElement;
    private readonly reactDOM: HTMLDivElement;
    private readonly root: Root;
    private selected = false;
    private node: Node;

    constructor(
      node: Node,
      private readonly editorView: unknown,
      private readonly getCurrentPath: () => number[],
    ) {
      this.node = node;
      this.dom = document.createElement(options.tagName ?? 'div');
      this.dom.dataset.fountainReactNodeView = '';
      if (options.className) this.dom.className = options.className;
      this.reactDOM = document.createElement('div');
      this.reactDOM.dataset.fountainReactNodeViewContent = '';
      this.dom.appendChild(this.reactDOM);
      if (options.contentDOMTagName) {
        this.contentDOM = document.createElement(options.contentDOMTagName);
        this.contentDOM.dataset.fountainReactContentDom = '';
        this.dom.appendChild(this.contentDOM);
      }
      this.root = createRoot(this.reactDOM);
      this.render();
    }

    update(node: Node): boolean {
      if (node.type !== this.node.type) return false;
      this.node = node;
      this.render();
      return true;
    }

    selectNode(): void {
      if (this.selected) return;
      this.selected = true;
      this.render();
    }

    deselectNode(): void {
      if (!this.selected) return;
      this.selected = false;
      this.render();
    }

    stopEvent(event: Event): boolean {
      if (options.stopEvent) return options.stopEvent(event, this);
      const target = event.target;
      return target instanceof globalThis.Node && this.reactDOM.contains(target);
    }

    ignoreMutation(mutation: MutationRecord): boolean {
      if (options.ignoreMutation) return options.ignoreMutation(mutation, this);
      return mutation.target === this.reactDOM || this.reactDOM.contains(mutation.target);
    }

    destroy(): void { this.root.unmount(); }

    private get editor(): Editor | null {
      const candidate = this.editorView as Partial<EditorViewLike> | null;
      return candidate?.editor ?? null;
    }

    private render(): void {
      this.root.render(createElement(Component, {
        node: this.node,
        selected: this.selected,
        editor: this.editor,
        contentDOM: this.contentDOM,
        getPath: () => this.getCurrentPath(),
        updateAttributes: (attrs: Attributes) => {
          const editor = this.editor;
          return editor ? setNodeAttributes(editor, this.getCurrentPath(), attrs) : false;
        },
        deleteNode: () => {
          const editor = this.editor;
          return editor ? removeNode(editor, this.getCurrentPath()) : false;
        },
      }));
    }
  };
}
