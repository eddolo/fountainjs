import { Decoration, insertNode, nodeRangeAtPath, Plugin, type Editor, type Node } from '../core';
import type { GlobalConstructorInstance } from '../core/platform';
import { defineExtension } from '../extensions/extension';
import { MermaidLayout, type Preview } from './layout';

export { exportMermaidImage, type DiagramImageFormat } from './image';

/** URL of a trusted, host-supplied classic Mermaid browser build. */
export interface MermaidOptions {
  scriptURL: string;
  /** Optional host controls for a successfully rendered preview. */
  renderControls?: (image: GlobalConstructorInstance<'HTMLImageElement', never>) => GlobalConstructorInstance<'HTMLElement', never>;
}

/** Insert editable Mermaid source as a regular fenced code block in one transaction. */
export function insertMermaid(editor: Editor, source: string): boolean {
  const { schema } = editor.state;
  if (!editor.editable || !schema.nodes.code_block || typeof source !== 'string') return false;
  return insertNode(editor, schema.node('code_block', { language: 'mermaid' }, [schema.text(source)]));
}

type PreviewElement = HTMLElement & { draw: () => Promise<void> };
const tag = 'fountain-mermaid-preview';

function previewWidget(render: (owner: Document) => Promise<Preview>, controls: MermaidOptions['renderControls']): HTMLElement {
  // Register on first DOM use so importing and composing the extension also works on a server.
  if (!customElements.get(tag)) {
    customElements.define(tag, class extends HTMLElement {
      draw!: () => Promise<void>;
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
    });
  }
  const preview = document.createElement(tag) as PreviewElement;
  preview.setAttribute('role', 'figure');
  preview.setAttribute('aria-label', 'Diagram preview');
  preview.style.cssText = 'display:block;margin:.75rem 0;padding:.75rem;overflow-wrap:anywhere;white-space:pre-wrap';
  preview.textContent = 'Rendering diagram…';
  preview.draw = async () => {
    try {
      const result = await render(preview.ownerDocument);
      if (!preview.isConnected) return;
      if ('error' in result) throw new Error(result.error);
      const image = preview.ownerDocument.createElement('img');
      image.style.cssText = 'display:block;width:auto;height:auto;max-width:100%;margin:auto';
      image.alt = result.title || 'Mermaid diagram';
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(result.svg);
      preview.replaceChildren(image);
      if (controls) preview.append(controls(image));
    } catch (error) {
      if (preview.isConnected) preview.textContent = 'Diagram preview unavailable. ' + (error instanceof Error ? error.message : String(error));
    }
  };
  return preview;
}

/** Add lazy source-backed diagram previews to editing and read-only views. */
export function createMermaidExtension({ scriptURL, renderControls }: MermaidOptions) {
  if (!scriptURL?.trim()) throw new TypeError('Supply the URL of the Mermaid browser script.');
  const layouts = new Map<Document, MermaidLayout>();
  let editors = 0;
  function widgets(doc: Node) {
    const result: Decoration[] = [];
    doc.descendants((node, path) => {
      if (node.type.name !== 'code_block') return;
      if (node.attrs.language === 'mermaid') {
        const render = (owner: Document) => {
          let layout = layouts.get(owner);
          if (!layout) {
            layout = new MermaidLayout(owner, scriptURL);
            layouts.set(owner, layout);
          }
          return layout.render(node);
        };
        result.push(Decoration.widget(nodeRangeAtPath(doc, path).to, () => previewWidget(render, renderControls),
          { key: 'mermaid-preview:' + node.textContent }));
      }
      return false;
    });
    return result;
  }
  const plugin: Plugin<Decoration[]> = new Plugin({
    state: {
      init: (_, state) => widgets(state.doc),
      apply: (_, old, previous, next) => previous.doc === next.doc ? old : widgets(next.doc),
    },
    props: {
      decorations: state => plugin.key.get(state),
      onCreate: () => { editors++; },
      onDestroy: () => {
        if (--editors === 0) {
          for (const layout of layouts.values()) layout.destroy();
          layouts.clear();
        }
      },
    },
  });
  return defineExtension({ name: 'mermaid-preview', plugins: [plugin], commands: { insertMermaid } });
}
