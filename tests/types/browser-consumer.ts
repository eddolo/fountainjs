import { Plugin, type NodeViewLike } from '../../src/core';

// The conditional platform types must preserve browser autocomplete for the
// existing web API while the same declarations compile without lib.dom.
new Plugin({
  props: {
    handleKeyDown(_editor, event) {
      const key: string = event.key;
      event.preventDefault();
      return key === 'Enter';
    },
    handlePaste(_editor, event) {
      const text: string = event.clipboardData?.getData('text/plain') ?? '';
      return text.length > 0;
    },
  },
});

declare const nodeView: NodeViewLike;
const element: HTMLElement = nodeView.dom;
void element;
