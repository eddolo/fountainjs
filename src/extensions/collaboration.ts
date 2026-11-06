import { Decoration, DecorationSet, resolveDocumentPoint, type Node } from '../core';
import {
  createCoreCollaborationExtension,
  type CollaborationExtensionOptions,
  type CollaborationState,
} from './collaboration-core';

export * from './collaboration-core';

let graphemes: Intl.Segmenter | undefined;

/** Expand only painted range edges; presence coordinates remain exact UTF-16
 * positions. A visual highlight must not split a surrogate/combining sequence. */
function paintEdge(document: Node, position: number, side: -1 | 1, cache: Map<Node, Intl.Segments>): number {
  const point = resolveDocumentPoint(document, position, side);
  if (point.kind !== 'text') return position;
  const node = point.path.reduce((parent, index) => parent.child(index), document), text = node.text ?? '';
  if (!point.offset || point.offset === text.length) return position;
  if (typeof Intl.Segmenter !== 'function') return position + (side < 0 ? -point.offset : text.length - point.offset);
  let segments = cache.get(node);
  if (!segments) { graphemes ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' }); segments = graphemes.segment(text); cache.set(node, segments); }
  const segment = segments.containing(point.offset);
  return !segment || segment.index === point.offset ? position
    : position + (side < 0 ? segment.index : segment.index + segment.segment.length) - point.offset;
}

/** Browser renderer for remote ranges and carets. */
function collaboratorDecorations(state: CollaborationState, document: Node): DecorationSet {
  if (typeof globalThis.document === 'undefined') return DecorationSet.empty;
  const maximum = Math.max(0, document.nodeSize - 2);
  const decorations: Decoration[] = [];
  const segments = new Map<Node, Intl.Segments>();
  state.presences.forEach((presence) => {
    if (!presence.selection) return;
    const anchor = Math.min(presence.selection.anchor, maximum);
    const head = Math.min(presence.selection.head, maximum);
    const from = Math.min(anchor, head);
    const to = Math.max(anchor, head);
    const identity = `collaboration-${presence.clientId}`;
    if (from < to) decorations.push(Decoration.inline(paintEdge(document, from, -1, segments), paintEdge(document, to, 1, segments), {
      class: 'fountain-collaboration-selection',
      style: `--fountain-collaborator-color:${presence.user.color}`,
      'data-fountain-collaborator': presence.clientId,
    }, { key: `${identity}-selection`, inclusiveStart: false, inclusiveEnd: false }));
    decorations.push(Decoration.widget(head, () => {
      const caret = globalThis.document.createElement('span');
      caret.className = 'fountain-collaboration-caret';
      caret.style.setProperty('--fountain-collaborator-color', presence.user.color);
      caret.dataset.fountainCollaborator = presence.clientId;
      caret.setAttribute('aria-label', `${presence.user.name}'s cursor`);
      caret.title = `${presence.user.name}'s cursor`;
      const label = globalThis.document.createElement('span');
      label.textContent = presence.user.name;
      label.setAttribute('aria-hidden', 'true');
      caret.appendChild(label);
      return caret;
    }, { key: `${identity}-caret`, side: head < anchor ? -1 : 1, overlay: true }));
  });
  return DecorationSet.create(document, decorations);
}

/**
 * Browser-ready collaboration extension. Headless consumers can use
 * `createCoreCollaborationExtension` without installing a presence renderer.
 */
export function createCollaborationExtension(options: CollaborationExtensionOptions) {
  return createCoreCollaborationExtension(options, collaboratorDecorations);
}
