import {
  type Attributes,
  type Editor,
  type Node as FountainNode,
  type NodeViewConstructor,
  type NodeViewLike,
} from '../core';
import type { FountainExtension } from '../extensions';
import {
  createWidgetController,
  createWidgetExtension,
  type WidgetController,
  type WidgetDefinition,
  type WidgetExitAction,
  type WidgetKeyName,
  type WidgetValidationReport,
} from './index';

interface EditorViewLike {
  readonly editor: Editor;
  readonly dom?: HTMLElement;
  focus?(position?: 'current' | 'start' | 'end'): void;
}

export interface DOMWidgetRenderContext {
  readonly definition: WidgetDefinition;
  readonly node: FountainNode;
  readonly attributes: Readonly<Attributes>;
  readonly selected: boolean;
  readonly editable: boolean;
  readonly dom: HTMLElement;
  readonly controls: HTMLElement;
  readonly contentDOM?: HTMLElement;
  readonly controller: WidgetController;
  readonly validation: WidgetValidationReport;
  getPath(): readonly number[];
  update(patch: Attributes): boolean;
  set(name: string, value: unknown): boolean;
  remove(): boolean;
  select(): boolean;
  exit(action: WidgetExitAction): boolean;
}

export interface DOMWidgetRenderHandle {
  /** Refresh existing controls without destroying focus or framework state. */
  update?(context: DOMWidgetRenderContext): void;
  destroy?(): void;
}

export type DOMWidgetRenderer = (
  context: DOMWidgetRenderContext,
) => void | (() => void) | DOMWidgetRenderHandle;

export interface DOMWidgetNodeViewOptions {
  tagName?: keyof HTMLElementTagNameMap;
  controlsTagName?: keyof HTMLElementTagNameMap;
  contentDOMTagName?: keyof HTMLElementTagNameMap;
  className?: string;
  controlsClassName?: string;
  role?: string;
  ariaLabel?: string;
  /** Called after a successful keyboard exit; defaults to focusing EditorView. */
  onExit?: (action: WidgetExitAction, context: DOMWidgetRenderContext) => void;
  focusEditorOnExit?: boolean;
  stopEvent?: (event: Event, context: DOMWidgetRenderContext) => boolean;
  ignoreMutation?: (mutation: MutationRecord, context: DOMWidgetRenderContext) => boolean;
}

function nodeTarget(target: EventTarget | null, ownerDocument: Document): target is globalThis.Node {
  const NodeConstructor = ownerDocument.defaultView?.Node;
  return Boolean(NodeConstructor && target instanceof NodeConstructor);
}

function normalizeHandle(value: ReturnType<DOMWidgetRenderer>): DOMWidgetRenderHandle | undefined {
  if (typeof value === 'function') return { destroy: value };
  return value || undefined;
}

function widgetKey(event: KeyboardEvent): WidgetKeyName | null {
  if (event.key === 'Tab' || event.key === 'Enter' || event.key === 'Escape') return event.key;
  if (event.key === 'Esc') return 'Escape';
  return null;
}

function disableInteractiveControls(root: HTMLElement): void {
  const controls = root.querySelectorAll<HTMLElement>('button, input, select, textarea, fieldset, optgroup');
  controls.forEach((control) => {
    if ('disabled' in control) (control as HTMLElement & { disabled: boolean }).disabled = true;
  });
}

/**
 * Creates the browser NodeView for a portable widget definition. The renderer
 * owns only the controls subtree; FountainJS continues to own document content.
 */
export function createDOMWidgetNodeView(
  definition: WidgetDefinition,
  renderer: DOMWidgetRenderer,
  options: DOMWidgetNodeViewOptions = {},
): NodeViewConstructor {
  return class DOMWidgetNodeView implements NodeViewLike {
    readonly dom: HTMLElement;
    readonly contentDOM?: HTMLElement;
    private readonly controls: HTMLElement;
    private readonly editorView: EditorViewLike;
    private readonly controller: WidgetController;
    private node: FountainNode;
    private selected = false;
    private renderHandle?: DOMWidgetRenderHandle;
    private destroyed = false;

    constructor(node: FountainNode, view: unknown, getPath: () => number[]) {
      const editorView = view as Partial<EditorViewLike> | null;
      if (!editorView?.editor) throw new TypeError('A DOM widget requires an EditorView with an editor.');
      this.editorView = editorView as EditorViewLike;
      this.node = node;
      const ownerDocument = this.editorView.dom?.ownerDocument ?? globalThis.document;
      if (!ownerDocument) throw new Error('A DOM widget requires a browser document.');
      this.dom = ownerDocument.createElement(options.tagName ?? (definition.inline ? 'span' : 'div'));
      this.dom.dataset.fountainWidgetView = definition.name;
      this.dom.className = options.className ?? 'fountain-widget';
      this.dom.setAttribute('role', options.role ?? 'group');
      this.dom.setAttribute('aria-label', options.ariaLabel ?? definition.label);
      this.controls = ownerDocument.createElement(options.controlsTagName ?? (definition.inline ? 'span' : 'div'));
      this.controls.dataset.fountainWidgetControls = '';
      this.controls.className = options.controlsClassName ?? 'fountain-widget__controls';
      this.controls.contentEditable = 'false';
      this.dom.appendChild(this.controls);
      if (definition.content) {
        this.contentDOM = ownerDocument.createElement(options.contentDOMTagName ?? (definition.inline ? 'span' : 'div'));
        this.contentDOM.dataset.fountainWidgetContent = '';
        this.dom.appendChild(this.contentDOM);
      }
      this.controller = createWidgetController(this.editorView.editor, definition, getPath);
      this.controls.addEventListener('keydown', this.onKeyDown);
      this.mountRenderer();
    }

    update(node: FountainNode): boolean {
      if (this.destroyed || node.type.name !== definition.name) return false;
      this.node = node;
      const context = this.context();
      if (this.renderHandle?.update) this.renderHandle.update(context);
      else {
        this.renderHandle?.destroy?.();
        this.controls.replaceChildren();
        this.renderHandle = normalizeHandle(renderer(context));
      }
      this.syncDOMState();
      return true;
    }

    selectNode(): void {
      if (this.selected) return;
      this.selected = true;
      this.syncSelection();
    }

    deselectNode(): void {
      if (!this.selected) return;
      this.selected = false;
      this.syncSelection();
    }

    stopEvent(event: Event): boolean {
      const context = this.context();
      if (options.stopEvent) return options.stopEvent(event, context);
      return nodeTarget(event.target, this.dom.ownerDocument) && this.controls.contains(event.target);
    }

    ignoreMutation(mutation: MutationRecord): boolean {
      const context = this.context();
      if (options.ignoreMutation) return options.ignoreMutation(mutation, context);
      return mutation.target === this.controls || this.controls.contains(mutation.target);
    }

    destroy(): void {
      if (this.destroyed) return;
      this.destroyed = true;
      this.controls.removeEventListener('keydown', this.onKeyDown);
      this.renderHandle?.destroy?.();
      this.renderHandle = undefined;
    }

    private context(): DOMWidgetRenderContext {
      const controller = this.controller;
      return Object.freeze({
        definition,
        node: this.node,
        attributes: this.node.attrs,
        selected: this.selected,
        editable: controller.editable,
        dom: this.dom,
        controls: this.controls,
        contentDOM: this.contentDOM,
        controller,
        validation: controller.validate(),
        getPath: () => controller.getPath(),
        update: (patch: Attributes) => controller.update(patch),
        set: (name: string, value: unknown) => controller.set(name, value),
        remove: () => controller.remove(),
        select: () => controller.select(),
        exit: (action: WidgetExitAction) => controller.exit(action),
      });
    }

    private mountRenderer(): void {
      this.renderHandle = normalizeHandle(renderer(this.context()));
      this.syncDOMState();
    }

    private syncSelection(): void {
      if (this.selected) this.dom.dataset.selected = 'true';
      else delete this.dom.dataset.selected;
      this.renderHandle?.update?.(this.context());
      this.syncDOMState();
    }

    private syncDOMState(): void {
      const validation = this.controller.validate();
      const editable = this.controller.editable;
      this.dom.dataset.valid = String(validation.valid);
      this.dom.setAttribute('aria-invalid', validation.valid ? 'false' : 'true');
      this.dom.setAttribute('aria-disabled', editable ? 'false' : 'true');
      if (!editable) disableInteractiveControls(this.controls);
    }

    private onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) return;
      const key = widgetKey(event);
      if (!key) return;
      const configured = definition.keyPolicy[key];
      if (configured === 'allow') return;
      const action: WidgetExitAction = configured === 'cycle'
        ? event.shiftKey ? 'before' : 'after'
        : configured;
      if (!this.controller.exit(action)) return;
      event.preventDefault();
      event.stopPropagation();
      const context = this.context();
      options.onExit?.(action, context);
      if (options.focusEditorOnExit !== false) queueMicrotask(() => this.editorView.focus?.('current'));
    };
  };
}

/** Convenience composition helper for a portable definition plus DOM renderer. */
export function createDOMWidgetExtension(
  definition: WidgetDefinition,
  renderer: DOMWidgetRenderer,
  options: DOMWidgetNodeViewOptions & { extensionName?: string } = {},
): FountainExtension {
  const { extensionName, ...nodeViewOptions } = options;
  return createWidgetExtension(definition, {
    extensionName,
    nodeView: createDOMWidgetNodeView(definition, renderer, nodeViewOptions),
  });
}
