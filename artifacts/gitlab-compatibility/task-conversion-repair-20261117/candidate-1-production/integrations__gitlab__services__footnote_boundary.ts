import { Plugin, type FountainExtension, type Node } from 'fountainjs-editor';

function endsWithEditableContainer(document: Node): boolean {
  let body = document.content.at(-1);
  if (!body || !['footnote_definition', 'direction_scope'].includes(body.type.name)) return false;
  const directionRoot = body.type.name === 'direction_scope';
  if (directionRoot) {
    while (body?.type.name === 'direction_scope') body = body.content.at(-1);
  }
  // Do not strand the caret when a note ends in atomic media or another
  // non-editable block. A nested last paragraph/code/cell remains editable.
  while (body && !body.type.spec.atom) {
    if (body.isText) return true;
    if (body.isBlock) {
      try {
        document.type.schema.validate(body.type.create(body.attrs, [document.type.schema.text('')]));
        return true;
      } catch {
        if (directionRoot) return false; // Lists/tables still need a separate exit paragraph.
      }
    }
    body = body.content.at(-1);
  }
  return false;
}

/** Editable host containers already provide a terminal caret; atomic endings still need repair. */
export function gitLabFootnoteBoundary(extension: FountainExtension): FountainExtension {
  if (extension.name !== 'trailing-editable-block') throw new Error('GITLAB_FOOTNOTE_BOUNDARY_EXTENSION');
  return { ...extension,
    plugins: extension.plugins?.map(plugin => new Plugin({ ...plugin.spec,
      appendTransaction: (transactions, oldState, newState) => endsWithEditableContainer(newState.doc) ? null
        : plugin.spec.appendTransaction?.(transactions, oldState, newState),
      props: { ...plugin.spec.props, onCreate: editor => {
        if (!endsWithEditableContainer(editor.state.doc)) plugin.spec.props?.onCreate?.(editor);
      } },
    })),
    commands: Object.fromEntries(Object.entries(extension.commands ?? {}).map(([name, command]) =>
      [name, (...args: Parameters<typeof command>) => endsWithEditableContainer(args[0].state.doc) ? false : command(...args)])),
  };
}
