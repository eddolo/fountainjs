import { Plugin, selectNode } from 'fountainjs-editor';

/** Editing a reference must not leave the draft. Modifier clicks remain links. */
export function createGitLabReferenceNavigationPlugin(): Plugin {
  return new Plugin({ props: { handleClick: (editor, event) => {
    if (!editor.editable || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
    const target = event.target as Element | null;
    const anchor = target?.closest?.('a[data-fountain-gitlab-reference]');
    if (!anchor) return false;
    const position = anchor.getAttribute('data-fountain-path');
    if (position && /^\d+(?:\.\d+)*$/u.test(position)) {
      const path = position.split('.').map(Number);
      try {
        const node = path.reduce((parent, index) => parent.child(index), editor.state.doc);
        if (node.type.name === 'gitlab_reference') selectNode(editor, path);
      } catch { /* A stale DOM reference must not navigate away from the draft. */ }
    }
    return true;
  } } });
}
