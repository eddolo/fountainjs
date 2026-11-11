import { Plugin } from 'fountainjs-editor';

/** Editing a reference must not leave the draft. Modifier clicks remain links. */
export function createGitLabReferenceNavigationPlugin(): Plugin {
  return new Plugin({ props: { handleClick: (editor, event) => {
    if (!editor.editable || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
    const target = event.target as Element | null;
    return Boolean(target?.closest?.('a[data-fountain-gitlab-reference]'));
  } } });
}
