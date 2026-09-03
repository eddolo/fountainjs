import { DecorationSet, Node, type Attributes, type Decoration, type DOMOutputSpec, type NodeViewLike } from '../core';

export interface DOMRenderContext {
  view?: unknown;
  nodeViews?: NodeViewLike[];
  decorations?: DecorationSet;
}

const SAFE_PROTOCOL = /^(https?:|mailto:|tel:|data:image\/(?:png|gif|jpe?g|webp);base64,|\/|#|\.)/i;

function applyAttributes(element: HTMLElement, attrs: Attributes): void {
  Object.entries(attrs).forEach(([rawName, value]) => {
    const name = rawName === 'className' ? 'class' : rawName;
    if (value === undefined || value === null || value === false || /^on/i.test(name)) return;
    if ((name === 'href' || name === 'src') && !SAFE_PROTOCOL.test(String(value))) return;
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
  applyAttributes(element, attrs);
  String(className ?? alternateClassName ?? '').split(/\s+/).filter(Boolean)
    .forEach((token) => element.classList.add(token));
  if (typeof style === 'string' && style.trim()) {
    element.style.cssText += `${element.style.cssText.trim().endsWith(';') || !element.style.cssText ? '' : ';'}${style}`;
  }
  const identity = decoration.spec.key ?? decoration.type;
  const identities = new Set((element.dataset.fountainDecoration ?? '').split(' ').filter(Boolean));
  identities.add(identity);
  element.dataset.fountainDecoration = [...identities].join(' ');
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
  const custom = NodeView ? new NodeView(node, context.view, () => [...path]) : undefined;
  if (custom) context.nodeViews?.push(custom);
  const rendered = custom ?? renderSpec(node.type.spec.toDOM?.(node) ?? ['div', 0]);
  const { dom, contentDOM } = rendered;
  dom.dataset.fountainNode = node.type.name;
  dom.dataset.fountainPath = path.join('.');
  if (node.type.spec.atom) dom.contentEditable = 'false';
  context.decorations?.find(position, position + node.nodeSize, (decoration) => (
    decoration.type === 'node' && decoration.from === position && decoration.to === position + node.nodeSize
  )).forEach((decoration) => applyDecorationAttributes(dom, decoration));
  const target = contentDOM ?? dom;
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

export function renderDocument(root: HTMLElement, doc: Node, context: DOMRenderContext = {}): void {
  const fragment = document.createDocumentFragment();
  let position = 0;
  doc.content.forEach((child, index) => {
    if (!child.isText) appendWidgets(fragment, position, context);
    fragment.appendChild(renderNode(child, [index], context, position));
    position += child.nodeSize;
  });
  appendWidgets(fragment, position, context);
  root.replaceChildren(fragment);
}
