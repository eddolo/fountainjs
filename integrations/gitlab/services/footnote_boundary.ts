import { Plugin, type FountainExtension, type Node } from 'fountainjs-editor';

function endsWithNote(document: Node): boolean {
  let body = document.content.at(-1);
  if (body?.type.name !== 'footnote_definition') return false;
  // Do not strand the caret when a note ends in atomic media or another
  // non-editable block. A nested last paragraph/code/cell remains editable.
  while (body && !body.type.spec.atom) {
    if (body.isText) return true;
    if (body.isBlock) {
      try {
        document.type.schema.validate(body.type.create(body.attrs, [document.type.schema.text('')]));
        return true;
      } catch { /* Follow the final editable branch of a structured container. */ }
    }
    body = body.content.at(-1);
  }
  return false;
}

/** GitLab renders endnotes after the prose; their editable body needs no root caret repair. */
export function gitLabFootnoteBoundary(extension: FountainExtension): FountainExtension {
  if (extension.name !== 'trailing-editable-block') throw new Error('GITLAB_FOOTNOTE_BOUNDARY_EXTENSION');
  return { ...extension,
    plugins: extension.plugins?.map(plugin => new Plugin({ ...plugin.spec,
      appendTransaction: (transactions, oldState, newState) => endsWithNote(newState.doc) ? null
        : plugin.spec.appendTransaction?.(transactions, oldState, newState),
      props: { ...plugin.spec.props, onCreate: editor => {
        if (!endsWithNote(editor.state.doc)) plugin.spec.props?.onCreate?.(editor);
      } },
    })),
    commands: Object.fromEntries(Object.entries(extension.commands ?? {}).map(([name, command]) =>
      [name, (...args: Parameters<typeof command>) => endsWithNote(args[0].state.doc) ? false : command(...args)])),
  };
}
