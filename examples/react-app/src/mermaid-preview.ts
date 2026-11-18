/// <reference types="vite/client" />
import { Decoration, defineExtension, nodeRangeAtPath, Plugin, type Node } from 'fountainjs-editor';
import './mermaid-preview.css';
import mermaidURL from 'mermaid/dist/mermaid.min.js?url';
import bootstrapURL from './mermaid-frame.js?url&no-inline';

type Preview = { svg: string; title?: string } | { error: string };
const rendered = new WeakMap<Node, Promise<Preview>>();
let renderer: { frame: HTMLIFrameElement; ready: Promise<void> } | undefined;

function layoutFrame() {
  if (renderer?.frame.isConnected) return renderer;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.title = 'Mermaid layout';
  frame.tabIndex = -1;
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0;pointer-events:none';
  // Only bundled scripts can run here. Diagram text is sent separately over a port.
  const nonce = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16)).join('');
  const policy = "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";
  const scripts = [mermaidURL, bootstrapURL].map(path => {
    const script = document.createElement('script');
    script.setAttribute('nonce', nonce);
    script.src = new URL(path, document.baseURI).href;
    return script.outerHTML;
  });
  const ready = new Promise<void>(resolve => { frame.onload = () => resolve(); });
  frame.srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + policy + '"><body>' + scripts.join('');
  document.body.append(frame);
  renderer = { frame, ready };
  return renderer;
}

function renderSource(source: string): Promise<Preview> {
  const { frame, ready } = layoutFrame();
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = (result: Preview) => {
      clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
      resolve(result);
    };
    const timeout = window.setTimeout(() => {
      frame.remove();
      finish({ error: 'The diagram renderer timed out. Edit the source to retry.' });
    }, 20000);
    channel.port1.onmessage = event => finish(event.data);
    void ready.then(() => frame.contentWindow?.postMessage(source, '*', [channel.port2]));
  });
}

class MermaidPreview extends HTMLElement {
  model!: Node;
  private observer?: IntersectionObserver;
  private timer?: number;

  connectedCallback() {
    this.observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      this.observer?.disconnect();
      this.timer = window.setTimeout(() => void this.draw(), 180);
    });
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    clearTimeout(this.timer);
  }

  private async draw() {
    let pending = rendered.get(this.model);
    if (!pending) {
      pending = renderSource(this.model.textContent);
      rendered.set(this.model, pending);
    }
    const result = await pending;
    if (!this.isConnected) return;
    if ('error' in result) {
      this.textContent = 'Diagram preview unavailable. ' + result.error;
      return;
    }
    const image = document.createElement('img');
    image.alt = result.title || 'Mermaid diagram';
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(result.svg);
    this.replaceChildren(image);
  }
}

const elementName = 'fountain-mermaid-preview';
if (!customElements.get(elementName)) customElements.define(elementName, MermaidPreview);

function diagramWidgets(doc: Node) {
  const widgets: Decoration[] = [];
  doc.descendants((node, path) => {
    if (node.type.name !== 'code_block') return;
    if (node.attrs.language === 'mermaid') {
      widgets.push(Decoration.widget(nodeRangeAtPath(doc, path).to, () => {
        const preview = document.createElement(elementName) as MermaidPreview;
        preview.model = node;
        preview.setAttribute('role', 'figure');
        preview.setAttribute('aria-label', 'Diagram preview');
        preview.textContent = 'Rendering diagram…';
        return preview;
      }, { key: 'mermaid-preview:' + node.textContent }));
    }
    return false;
  });
  return widgets;
}

export const diagramPlugin: Plugin<Decoration[]> = new Plugin<Decoration[]>({
  state: {
    init: (_, state) => diagramWidgets(state.doc),
    apply: (_, widgets, previous, next) => previous.doc === next.doc ? widgets : diagramWidgets(next.doc),
  },
  props: { decorations: state => diagramPlugin.key.get(state) },
});
export const MermaidPreviewExtension = defineExtension({ name: 'mermaid-preview', plugins: [diagramPlugin] });
