import { DecorationSet, Node, isSafeURL, type Attributes, type Decoration, type DOMOutputSpec, type NodeViewLike } from '../core';

export interface DOMRenderContext {
  view?: unknown;
  nodeViews?: MountedNodeView[];
  reusableNodeViews?: ReadonlyMap<string, MountedNodeView>;
  decorations?: DecorationSet;
}

export interface MountedNodeView {
  readonly nodeView: NodeViewLike;
  readonly node: Node;
  readonly path: readonly number[];
  readonly pathReference: { current: number[] };
}

export interface MountedDocumentNode {
  readonly node: Node;
  readonly dom: globalThis.Node;
}

function pathKey(path: readonly number[]): string { return path.join('.'); }

interface AppliedDecorationState {
  readonly attributes: Map<string, string | null>;
  readonly classes: Map<string, boolean>;
  readonly styles: Map<string, { value: string; priority: string }>;
}

const appliedDecorations = new WeakMap<HTMLElement, AppliedDecorationState>();

function applyAttributes(element: HTMLElement, attrs: Attributes): void {
  Object.entries(attrs).forEach(([rawName, value]) => {
    const name = rawName === 'className' ? 'class' : rawName;
    if (value === undefined || value === null || value === false || /^on/i.test(name)) return;
    if (name === 'href' && !isSafeURL(value)) return;
    if (name === 'src' && !isSafeURL(value, { allowDataImage: true })) return;
    element.setAttribute(name, value === true ? '' : String(value));
  });
}

function renderSpec(spec: DOMOutputSpec): { dom: HTMLElement; contentDOM?: HTMLElement } {
  const tuple = typeof spec === 'string' ? [spec] : spec;
  const [tagName] = tuple;
  if (!/^[a-z][a-z0-9-]*$/i.test(tagName)) throw new Error(`Unsafe DOM tag: ${tagName}`);
  const dom = document.createElement(tagName);
  const possibleAttrs = tuple[1];
  const hasAttrs = possibleAttrs && typeof possibleAttrs === 'object' && !Array.isArray(possibleAttrs);
  if (hasAttrs) applyAttributes(dom, possibleAttrs as Attributes);
  let contentDOM: HTMLElement | undefined;

  for (const child of tuple.slice(hasAttrs ? 2 : 1)) {
    if (child === 0) {
      if (contentDOM) throw new Error('A DOM output spec may only contain one content hole.');
      contentDOM = dom;
    } else if (typeof child === 'string') {
      dom.appendChild(document.createTextNode(child));
    } else if (Array.isArray(child)) {
      const rendered = renderSpec(child);
      dom.appendChild(rendered.dom);
      if (rendered.contentDOM) contentDOM = rendered.contentDOM;
    }
  }
  return { dom, contentDOM };
}

function applyDecorationAttributes(element: HTMLElement, decoration: Decoration): void {
  const { class: className, className: alternateClassName, style, ...attrs } = decoration.attrs;
  let applied = appliedDecorations.get(element);
  if (!applied) {
    applied = { attributes: new Map(), classes: new Map(), styles: new Map() };
    appliedDecorations.set(element, applied);
  }
  Object.keys(attrs).forEach((rawName) => {
    const name = rawName === 'className' ? 'class' : rawName;
    if (!applied!.attributes.has(name)) applied!.attributes.set(name, element.getAttribute(name));
  });
  applyAttributes(element, attrs);
  String(className ?? alternateClassName ?? '').split(/\s+/).filter(Boolean)
    .forEach((token) => {
      if (!applied!.classes.has(token)) applied!.classes.set(token, element.classList.contains(token));
      element.classList.add(token);
    });
  if (typeof style === 'string' && style.trim()) {
    const probe = document.createElement('span');
    probe.style.cssText = style;
    for (const property of probe.style) {
      if (!applied.styles.has(property)) {
        applied.styles.set(property, {
          value: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property),
        });
      }
      element.style.setProperty(property, probe.style.getPropertyValue(property), probe.style.getPropertyPriority(property));
    }
  }
  const identity = decoration.spec.key ?? decoration.type;
  if (!applied.attributes.has('data-fountain-decoration')) {
    applied.attributes.set('data-fountain-decoration', element.getAttribute('data-fountain-decoration'));
  }
  const identities = new Set((element.dataset.fountainDecoration ?? '').split(' ').filter(Boolean));
  identities.add(identity);
  element.dataset.fountainDecoration = [...identities].join(' ');
}

function clearDecorationAttributes(element: HTMLElement): void {
  const applied = appliedDecorations.get(element);
  if (!applied) return;
  applied.attributes.forEach((value, name) => {
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  });
  applied.classes.forEach((present, name) => {
    if (present) element.classList.add(name);
    else element.classList.remove(name);
  });
  applied.styles.forEach(({ value, priority }, property) => {
    if (value) element.style.setProperty(property, value, priority);
    else element.style.removeProperty(property);
  });
  appliedDecorations.delete(element);
}

function renderMarkedText(node: Node, text: string): globalThis.Node {
  let content: globalThis.Node = document.createTextNode(text);
  for (const mark of node.marks) {
    const spec = mark.type.spec.toDOM?.(mark);
    if (!spec) continue;
    const { dom, contentDOM } = renderSpec(spec);
    (contentDOM ?? dom).appendChild(content);
    content = dom;
  }
  return content;
}

function renderWidget(decoration: Decoration): globalThis.Node {
  const produced = decoration.toDOM?.();
  if (!produced) throw new Error('A widget decoration factory must return a DOM node.');
  const dom = produced.nodeType === globalThis.Node.ELEMENT_NODE
    ? produced as HTMLElement
    : document.createElement('span');
  if (dom !== produced) dom.appendChild(produced);
  dom.dataset.fountainWidget = decoration.spec.key ?? 'widget';
  dom.contentEditable = 'false';
  return dom;
}

function widgetsAt(position: number, context: DOMRenderContext): readonly Decoration[] {
  return context.decorations?.find(position, position, (decoration) => decoration.type === 'widget' && decoration.from === position) ?? [];
}

function appendWidgets(target: globalThis.Node, position: number, context: DOMRenderContext): void {
  widgetsAt(position, context).forEach((decoration) => target.appendChild(renderWidget(decoration)));
}

function renderText(node: Node, path: readonly number[], position: number, context: DOMRenderContext): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.dataset.fountainTextPath = path.join('.');

  const value = node.text ?? '';
  const end = position + value.length;
  const inline = context.decorations?.find(position, end, (decoration) => decoration.type === 'inline') ?? [];
  const widgets = context.decorations?.find(position, end, (decoration) => (
    decoration.type === 'widget'
      && decoration.from >= position
      && (value.length === 0 ? decoration.from === position : decoration.from < end)
  )) ?? [];
  const boundaries = [...new Set([
    0,
    value.length,
    ...inline.flatMap((decoration) => [
      Math.max(0, decoration.from - position),
      Math.min(value.length, decoration.to - position),
    ]),
    ...widgets.map((decoration) => decoration.from - position),
  ])].sort((left, right) => left - right);

  for (let index = 0; index < boundaries.length; index += 1) {
    const from = boundaries[index] as number;
    widgets.filter((decoration) => decoration.from === position + from)
      .forEach((decoration) => wrapper.appendChild(renderWidget(decoration)));
    const to = boundaries[index + 1];
    if (to === undefined || to <= from) continue;
    let content = renderMarkedText(node, value.slice(from, to));
    inline.filter((decoration) => decoration.from < position + to && decoration.to > position + from)
      .forEach((decoration) => {
        const span = document.createElement('span');
        applyDecorationAttributes(span, decoration);
        span.appendChild(content);
        content = span;
      });
    wrapper.appendChild(content);
  }

  context.decorations?.find(position, end, (decoration) => (
    decoration.type === 'node' && decoration.from === position && decoration.to === end
  )).forEach((decoration) => applyDecorationAttributes(wrapper, decoration));
  if (value.length === 0) wrapper.appendChild(document.createTextNode(''));
  return wrapper;
}

export function renderNode(node: Node, path: readonly number[] = [], context: DOMRenderContext = {}, position = 0): globalThis.Node {
  if (node.isText) return renderText(node, path, position, context);
  const NodeView = node.type.spec.nodeView;
  let custom: NodeViewLike | undefined;
  let pathReference: { current: number[] } | undefined;
  if (NodeView) {
    const reusable = context.reusableNodeViews?.get(pathKey(path));
    if (reusable && reusable.node.type === node.type) {
      clearDecorationAttributes(reusable.nodeView.dom);
      let accepted = reusable.node.eq(node);
      if (!accepted && reusable.nodeView.update) {
        try { accepted = reusable.nodeView.update(node); }
        catch { accepted = false; }
      }
      if (accepted) {
        custom = reusable.nodeView;
        pathReference = reusable.pathReference;
        pathReference.current = [...path];
      }
    }
    if (!custom) {
      pathReference = { current: [...path] };
      custom = new NodeView(node, context.view, () => [...pathReference!.current]);
    }
    if (!pathReference) throw new Error('A mounted NodeView requires a live path reference.');
    context.nodeViews?.push({
      nodeView: custom,
      node,
      path: Object.freeze([...path]),
      pathReference,
    });
  }
  const rendered = custom ?? renderSpec(node.type.spec.toDOM?.(node) ?? ['div', 0]);
  const { dom, contentDOM } = rendered;
  dom.dataset.fountainNode = node.type.name;
  dom.dataset.fountainPath = path.join('.');
  if (node.type.spec.atom) dom.contentEditable = 'false';
  context.decorations?.find(position, position + node.nodeSize, (decoration) => (
    decoration.type === 'node' && decoration.from === position && decoration.to === position + node.nodeSize
  )).forEach((decoration) => applyDecorationAttributes(dom, decoration));
  const target = contentDOM ?? dom;
  if (custom && contentDOM) target.replaceChildren();
  let childPosition = position + 1;
  node.content.forEach((child, index) => {
    if (!child.isText) appendWidgets(target, childPosition, context);
    target.appendChild(renderNode(child, [...path, index], context, childPosition));
    childPosition += child.nodeSize;
  });
  const last = node.content.at(-1);
  if (!last?.isText || (last.text?.length ?? 0) > 0) appendWidgets(target, childPosition, context);
  return dom;
}

export function renderDocument(root: HTMLElement, doc: Node, context: DOMRenderContext = {}): MountedDocumentNode[] {
  const fragment = document.createDocumentFragment();
  const mounted: MountedDocumentNode[] = [];
  let position = 0;
  doc.content.forEach((child, index) => {
    if (!child.isText) appendWidgets(fragment, position, context);
    const dom = renderNode(child, [index], context, position);
    fragment.appendChild(dom);
    mounted.push({ node: child, dom });
    position += child.nodeSize;
  });
  appendWidgets(fragment, position, context);
  root.replaceChildren(fragment);
  return mounted;
}

function rebaseRenderedPath(element: HTMLElement, index: number): void {
  const rebase = (target: HTMLElement, attribute: 'data-fountain-path' | 'data-fountain-text-path') => {
    const path = target.getAttribute(attribute);
    if (path) target.setAttribute(attribute, [index, ...path.split('.').slice(1)].join('.'));
  };
  rebase(element, 'data-fountain-path');
  element.querySelectorAll<HTMLElement>('[data-fountain-path]').forEach((target) => rebase(target, 'data-fountain-path'));
  element.querySelectorAll<HTMLElement>('[data-fountain-text-path]').forEach((target) => rebase(target, 'data-fountain-text-path'));
}

/**
 * Reconciles an undecorated document at its top-level immutable-node boundary.
 * Unchanged blocks keep their DOM identity; changed blocks are rendered in
 * place. Decorated documents use the full renderer because absolute decoration
 * positions may alter otherwise shared nodes after an earlier edit.
 */
export function reconcileDocument(
  root: HTMLElement,
  doc: Node,
  previous: readonly MountedDocumentNode[],
  context: DOMRenderContext = {},
  onReuse?: (index: number) => void,
): MountedDocumentNode[] {
  const mounted: MountedDocumentNode[] = [];
  const available = new Map<Node, number[]>();
  const used = new Set<number>();
  previous.forEach((entry, index) => {
    const indexes = available.get(entry.node) ?? [];
    indexes.push(index);
    available.set(entry.node, indexes);
  });
  const reuseIndexes = doc.content.map((child, index) => {
    let previousIndex = previous[index]?.node === child && !used.has(index) ? index : undefined;
    if (previousIndex === undefined) {
      previousIndex = available.get(child)?.find((candidate) => !used.has(candidate));
    }
    if (previousIndex !== undefined) used.add(previousIndex);
    return previousIndex;
  });
  previous.forEach((entry, index) => {
    if (!used.has(index) && entry.dom.parentNode === root) root.removeChild(entry.dom);
  });
  let position = 0;

  doc.content.forEach((child, index) => {
    const previousIndex = reuseIndexes[index];
    const prior = previousIndex === undefined ? undefined : previous[previousIndex];
    const currentDOM = root.childNodes[index];
    if (previousIndex !== undefined && prior?.node === child && prior.dom.parentNode === root) {
      if (prior.dom !== currentDOM) root.insertBefore(prior.dom, currentDOM ?? null);
      if (prior.dom.nodeType === 1) rebaseRenderedPath(prior.dom as HTMLElement, index);
      mounted.push(prior);
      onReuse?.(index);
      position += child.nodeSize;
      return;
    }

    const dom = renderNode(child, [index], context, position);
    if (currentDOM !== dom) root.insertBefore(dom, root.childNodes[index] ?? null);
    mounted.push({ node: child, dom });
    position += child.nodeSize;
  });

  while (root.childNodes.length > doc.childCount) root.lastChild?.remove();
  return mounted;
}
