/// <reference types="vite/client" />
import type { Node } from '../core';
import { diagramFrame } from './frame';
import bootstrap from './mermaid-frame.js?raw';

export type Preview = { svg: string; title?: string } | { error: string };

/** One opaque-origin layout frame per configured renderer and owner document. */
export class MermaidLayout {
  private readonly frame: HTMLIFrameElement;
  private readonly ready: Promise<void>;
  private readonly cache = new WeakMap<Node, Promise<Preview>>();
  private readonly pending = new Set<(result: Preview) => void>();

  constructor(owner: Document, scriptURL: string) {
    const frame = diagramFrame(owner, scriptURL, bootstrap, 'Mermaid layout');
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0;pointer-events:none';
    this.ready = new Promise(resolve => { frame.onload = () => resolve(); });
    this.frame = frame;
    owner.body.append(frame);
  }

  render(node: Node): Promise<Preview> {
    let result = this.cache.get(node);
    if (result) return result;
    result = new Promise(resolve => {
      const channel = new MessageChannel();
      const finish = (value: Preview) => {
        clearTimeout(timer);
        this.pending.delete(finish);
        channel.port1.close();
        channel.port2.close();
        resolve(value);
      };
      const timer = setTimeout(() => finish({ error: 'The renderer timed out. Check the Mermaid script URL.' }), 20000);
      this.pending.add(finish);
      channel.port1.onmessage = event => finish(event.data);
      void this.ready.then(() => {
        if (this.pending.has(finish)) this.frame.contentWindow?.postMessage(node.textContent, '*', [channel.port2]);
      });
    });
    this.cache.set(node, result);
    return result;
  }

  destroy() {
    for (const finish of this.pending) finish({ error: 'The editor was closed.' });
    this.frame.remove();
  }
}
