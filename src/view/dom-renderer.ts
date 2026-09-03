import { Node, type Attributes, type DOMOutputSpec, type NodeViewLike } from '../core';

export interface DOMRenderContext {
  view?: unknown;
  nodeViews?: NodeViewLike[];
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

function renderText(node: Node, path: readonly number[]): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.dataset.fountainTextPath = path.join('.');
  let content: globalThis.Node = document.createTextNode(node.text ?? '');
  for (const mark of node.marks) {
    const spec = mark.type.spec.toDOM?.(mark);
    if (!spec) continue;
    const { dom, contentDOM } = renderSpec(spec);
    (contentDOM ?? dom).appendChild(content);
    content = dom;
  }
  wrapper.appendChild(content);
  return wrapper;
}

export function renderNode(node: Node, path: readonly number[] = [], context: DOMRenderContext = {}): globalThis.Node {
  if (node.isText) return renderText(node, path);
  const NodeView = node.type.spec.nodeView;
  const custom = NodeView ? new NodeView(node, context.view, () => [...path]) : undefined;
  if (custom) context.nodeViews?.push(custom);
  const rendered = custom ?? renderSpec(node.type.spec.toDOM?.(node) ?? ['div', 0]);
  const { dom, contentDOM } = rendered;
  dom.dataset.fountainNode = node.type.name;
  dom.dataset.fountainPath = path.join('.');
  if (node.type.spec.atom) dom.contentEditable = 'false';
  const target = contentDOM ?? dom;
  node.content.forEach((child, index) => target.appendChild(renderNode(child, [...path, index], context)));
  return dom;
}

export function renderDocument(root: HTMLElement, doc: Node, context: DOMRenderContext = {}): void {
  const fragment = document.createDocumentFragment();
  doc.content.forEach((child, index) => fragment.appendChild(renderNode(child, [index], context)));
  root.replaceChildren(fragment);
}
