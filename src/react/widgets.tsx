import { createElement, useLayoutEffect, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Attributes, Editor, Node, NodeViewConstructor } from '../core';
import type { FountainExtension } from '../extensions';
import {
  createDOMWidgetExtension,
  createDOMWidgetNodeView,
  type DOMWidgetNodeViewOptions,
  type DOMWidgetRenderContext,
} from '../widgets/dom';
import type {
  WidgetController,
  WidgetDefinition,
  WidgetExitAction,
  WidgetValidationReport,
} from '../widgets';

export interface ReactWidgetProps {
  readonly definition: WidgetDefinition;
  readonly node: Node;
  readonly attributes: Readonly<Attributes>;
  readonly selected: boolean;
  readonly editable: boolean;
  readonly editor: Editor;
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

export interface ReactWidgetNodeViewOptions extends DOMWidgetNodeViewOptions {}

function propsFromContext(context: DOMWidgetRenderContext): ReactWidgetProps {
  return {
    definition: context.definition,
    node: context.node,
    attributes: context.attributes,
    selected: context.selected,
    editable: context.editable,
    editor: context.controller.editor,
    contentDOM: context.contentDOM,
    controller: context.controller,
    validation: context.validation,
    getPath: context.getPath,
    update: context.update,
    set: context.set,
    remove: context.remove,
    select: context.select,
    exit: context.exit,
  };
}

function unmountReactRoot(root: Root): void {
  // An EditorView created inside a React Strict Mode effect can be destroyed
  // during React's setup/cleanup probe before this nested root has committed.
  // Leaving the already-detached controls node immediately and unmounting on
  // the next task avoids React's forbidden synchronous nested-root teardown.
  globalThis.setTimeout(() => root.unmount(), 0);
}

function ReactWidgetBoundary({
  Component,
  context,
}: {
  Component: ComponentType<ReactWidgetProps>;
  context: DOMWidgetRenderContext;
}) {
  useLayoutEffect(() => {
    if (context.editable) return;
    context.controls
      .querySelectorAll<HTMLElement>('button, input, select, textarea, fieldset, optgroup')
      .forEach((control) => {
        if ('disabled' in control) {
          (control as HTMLElement & { disabled: boolean }).disabled = true;
        }
      });
  }, [context]);
  return createElement(Component, propsFromContext(context));
}

/** Adapts a React component to the first-class portable widget lifecycle. */
export function createReactWidgetNodeView(
  definition: WidgetDefinition,
  Component: ComponentType<ReactWidgetProps>,
  options: ReactWidgetNodeViewOptions = {},
): NodeViewConstructor {
  return createDOMWidgetNodeView(definition, (initial) => {
    const root: Root = createRoot(initial.controls);
    const render = (context: DOMWidgetRenderContext): void => {
      root.render(createElement(ReactWidgetBoundary, { Component, context }));
    };
    render(initial);
    return {
      update: render,
      destroy: () => unmountReactRoot(root),
    };
  }, options);
}

/** Convenience composition helper for a portable definition plus React component. */
export function createReactWidgetExtension(
  definition: WidgetDefinition,
  Component: ComponentType<ReactWidgetProps>,
  options: ReactWidgetNodeViewOptions & { extensionName?: string } = {},
): FountainExtension {
  const { extensionName, ...nodeViewOptions } = options;
  return createDOMWidgetExtension(definition, (initial) => {
    const root = createRoot(initial.controls);
    const render = (context: DOMWidgetRenderContext): void => {
      root.render(createElement(ReactWidgetBoundary, { Component, context }));
    };
    render(initial);
    return { update: render, destroy: () => unmountReactRoot(root) };
  }, { ...nodeViewOptions, extensionName });
}
