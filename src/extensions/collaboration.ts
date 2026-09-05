import { Decoration, DecorationSet, type Node } from '../core';
import {
  createCoreCollaborationExtension,
  type CollaborationExtensionOptions,
  type CollaborationState,
} from './collaboration-core';

export * from './collaboration-core';

/** Browser renderer for remote ranges and carets. */
function collaboratorDecorations(state: CollaborationState, document: Node): DecorationSet {
  if (typeof globalThis.document === 'undefined') return DecorationSet.empty;
  const maximum = Math.max(0, document.nodeSize - 2);
  const decorations: Decoration[] = [];
  state.presences.forEach((presence) => {
    if (!presence.selection) return;
    const anchor = Math.min(presence.selection.anchor, maximum);
    const head = Math.min(presence.selection.head, maximum);
    const from = Math.min(anchor, head);
    const to = Math.max(anchor, head);
    const identity = `collaboration-${presence.clientId}`;
    if (from < to) decorations.push(Decoration.inline(from, to, {
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
    }, { key: `${identity}-caret`, side: head < anchor ? -1 : 1 }));
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
