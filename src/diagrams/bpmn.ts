import { Decoration, insertNode, nodeRangeAtPath, Plugin, type Editor, type Node } from '../core';
import type { GlobalConstructorInstance } from '../core/platform';
import { isAutomaticTrailingParagraph } from '../core/editing-provenance';
import { defineExtension } from '../extensions/extension';
import { diagramFrame } from './frame';
import bootstrap from './bpmn-frame.js?raw';

export interface BpmnOptions {
  /** The classic bpmn-js viewer distribution. */
  scriptURL: string;
  /** Optional viewer CSS from the host's bpmn-js installation. */
  styleText?: string;
  renderControls?: (source: string, owner: GlobalConstructorInstance<'Document', never>) => GlobalConstructorInstance<'HTMLElement', never>;
}

export function insertBpmn(editor: Editor, source: string): boolean {
  const { schema } = editor.state;
  return editor.editable && !!schema.nodes.code_block && typeof source === 'string'
    && insertNode(editor, schema.node('code_block', { language: 'bpmn' }, [schema.text(source)]));
}

/** Return the XML only when it represents the complete authored document. */
export function exportBpmnSource(doc: Node): string {
  const count = doc.childCount - Number(isAutomaticTrailingParagraph(doc.content.at(-1)));
  const block = doc.content[0];
  if (count !== 1 || block?.type.name !== 'code_block' || block.attrs.language !== 'bpmn') {
    throw new Error('A BPMN file needs one BPMN source block. Use Fountain JSON or Markdown to keep the whole document.');
  }
  return block.textContent;
}

/** Render BPMN 2.0 XML in a visible, isolated bpmn-js viewer, retaining the complete source. */
export function createBpmnExtension({ scriptURL, styleText = '', renderControls }: BpmnOptions) {
  if (!scriptURL?.trim()) throw new TypeError('Supply the URL of the BPMN viewer script.');
  function widgets(doc: Node) {
    const result: Decoration[] = [];
    doc.descendants((node, path) => {
      if (node.type.name !== 'code_block') return;
      if (node.attrs.language === 'bpmn') result.push(Decoration.widget(nodeRangeAtPath(doc, path).to, () => {
        const frame = diagramFrame(document, scriptURL, bootstrap, 'BPMN process preview');
        frame.setAttribute('sandbox', 'allow-scripts allow-popups');
        frame.loading = 'lazy';
        frame.style.cssText = 'display:block;width:100%;height:22rem;border:0;background:white';
        frame.onload = () => frame.contentWindow?.postMessage({ xml: node.textContent, styleText }, '*');
        if (!renderControls) return frame;
        const figure = document.createElement('div');
        figure.append(frame, renderControls(node.textContent, document));
        return figure;
      }, { key: 'bpmn-preview:' + node.textContent }));
      return false;
    });
    return result;
  }
  const plugin: Plugin<Decoration[]> = new Plugin({
    state: { init: (_, state) => widgets(state.doc), apply: (_, old, previous, next) => previous.doc === next.doc ? old : widgets(next.doc) },
    props: { decorations: state => plugin.key.get(state) },
  });
  return defineExtension({ name: 'bpmn-preview', plugins: [plugin], commands: { insertBpmn } });
}
