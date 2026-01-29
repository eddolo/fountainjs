import { Node } from '../core';
import { EditorView } from './view';
import { NodeView } from './node-view';

function renderSpecToDOM(spec: string | any[]): { dom: HTMLElement; contentDOM: HTMLElement } {
  if (typeof spec === 'string') {
    const dom = document.createElement(spec);
    return { dom, contentDOM: dom };
  }
  
  const dom = document.createElement(spec[0]);
  const attrs = spec[1];
  let contentDOM = dom;
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) { for (const attr in attrs) dom.setAttribute(attr, attrs[attr]); }
  for (let i = 1; i < spec.length; i++) {
    if (spec[i] === 0) return { dom, contentDOM };
    if (typeof spec[i] === 'object' && Array.isArray(spec[i])) { const nested = renderSpecToDOM(spec[i]); dom.appendChild(nested.dom); }
  }
  return { dom, contentDOM };
}

// The render function now keeps track of the position in the document
function renderNode(node: Node, view: EditorView, pos: number): { dom: HTMLElement | Text, pos: number } {
  const NodeViewConstructor = node.type.spec.nodeView;
  
  // Track position for children
  let currentPos = pos + 1;

  if (NodeViewConstructor) {
    const getPos = () => pos;
    const nodeView = new NodeViewConstructor(node, view, getPos);
    
    if (nodeView.contentDOM) {
      node.content.forEach(child => {
        const result = renderNode(child, view, currentPos);
        nodeView.contentDOM!.appendChild(result.dom);
        currentPos = result.pos;
      });
    }
    return { dom: nodeView.dom, pos: currentPos };
  }
  
  if (node.isText) {
    let dom: HTMLElement | Text = document.createTextNode(node.text || '');
    for (const mark of node.marks) {
      const markSpec = mark.type.spec.toDOM?.(mark);
      if (markSpec) { 
        const markDom = renderSpecToDOM(markSpec).dom; 
        markDom.appendChild(dom as any); 
        dom = markDom; 
      }
    }
    // Text nodes have a size equal to their length
    return { dom, pos: pos + (node.text?.length || 0) };
  }
  
  const spec = node.type.spec.toDOM?.(node);
  if (!spec) throw new Error(`No render spec for node type: ${node.type.name}`);
  const { dom, contentDOM } = renderSpecToDOM(spec);

  node.content.forEach(child => {
    const result = renderNode(child, view, currentPos);
    contentDOM.appendChild(result.dom);
    currentPos = result.pos;
  });

  // A block node has open and close tags, so it takes up 2 positions + content size
  return { dom, pos: currentPos + 1 };
}

export function renderDOM(view: EditorView): void {
  const doc = view.editor.state.doc;
  // Start rendering at position 0
  const { dom: renderedDoc } = renderNode(doc, view, 0);
  view.dom.innerHTML = '';
  view.dom.appendChild(renderedDoc);
}