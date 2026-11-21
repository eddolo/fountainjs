import { Plugin, setNodeAttributes, type NodeSpec, type SchemaSpec } from 'fountainjs-editor';

type TaskDOM = ReturnType<NonNullable<NodeSpec['toDOM']>>;

export const NOT_APPLICABLE = 'inapplicable';

/** Keep the third state in checked itself so ordinary checkbox changes and split
 * commands naturally return to the existing pending/completed states. */
export function gitLabTaskItem(base: SchemaSpec): NodeSpec {
  const original = base.nodes.task_item!;
  return { ...original, contextualDOM:true, attrs: { ...original.attrs,
    gitlabTableItem: { default: undefined, validate: value => value === undefined || value === true },
    checked: { default: false, validate: value => typeof value === 'boolean' || value === NOT_APPLICABLE },
  }, toDOM: (node, context) => {
    const inactive = node.attrs.checked === NOT_APPLICABLE;
    const rendered = original.toDOM!(inactive ? node.type.create({ ...node.attrs, checked: false }, node.content) : node, context) as [string, Record<string, unknown>, TaskDOM, TaskDOM];
    const attrs = rendered[1];
    const paragraph = node.content[0];
    const alignment = paragraph?.attrs.align;
    if (alignment === 'center' || alignment === 'right') {
      const cell = context && context.path.length >= 2
        ? context.path.slice(0,-2).reduce((parent,i) => parent.child(i),context.document) : undefined;
      const emptyCellTask = (cell?.type.name === 'table_cell' || cell?.type.name === 'table_header')
        && node.childCount === 1 && paragraph?.type.name === 'paragraph'
        && paragraph.content.every(child => child.isText && !child.text);
      if (node.attrs.gitlabTableItem || emptyCellTask) attrs['data-gitlab-checkbox-align'] = alignment;
    }
    if (node.attrs.gitlabTableItem) {
      const input = (rendered[2] as [string,Record<string,unknown>])[1];
      if (inactive) input.disabled = true;
      if (context && context.path.length >= 4) {
        const table = context.path.slice(0,-4).reduce((parent,i) => parent.child(i),context.document);
        const heading = table.content[0]?.content[context.path.at(-3)!]?.textContent;
        if (heading) input['aria-label'] = 'Check option in column "' + heading + '"';
      }
    }
    attrs.class = [attrs.class, 'fountain-gitlab-task'].filter(Boolean).join(' ');
    if (inactive) {
      attrs['data-checked'] = NOT_APPLICABLE;
      attrs.style = '--fountain-task-decoration:line-through;--fountain-task-color:var(--fountain-muted)';
    }
    rendered.push(['button', { type: 'button', 'data-fountain-gitlab-task-state-toggle': '',
        'aria-label': inactive ? 'Restore task to pending' : 'Mark task not applicable',
        'aria-pressed': String(inactive), title: inactive ? 'Restore task to pending' : 'Mark task not applicable', contenteditable: 'false' }, 'N/A']);
    return rendered;
  } };
}

/** A native button provides mouse, Enter and Space activation without taking over
 * the editable text or changing selection. State changes remain transactions. */
export function createGitLabTaskStatePlugin(): Plugin {
  return new Plugin({ props: {
    handleKeyDown: (_editor, event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return false;
      const button = (event.target as Element | null)?.closest?.<HTMLButtonElement>('[data-fountain-gitlab-task-state-toggle]');
      if (!button) return false;
      button.click(); return true;
    },
    handleClick: (editor, event) => {
      const button = (event.target as Element | null)?.closest?.('[data-fountain-gitlab-task-state-toggle]');
      if (!button) return false;
      if (!editor.editable) return true;
      const item = button.closest('[data-fountain-node="task_item"][data-fountain-path]');
      const position = item?.getAttribute('data-fountain-path');
      if (!position || !/^\d+(?:\.\d+)*$/u.test(position)) return true;
      const path = position.split('.').map(Number);
      try {
        const node = path.reduce((parent, index) => parent.child(index), editor.state.doc);
        if (node.type.name === 'task_item') setNodeAttributes(editor, path, {
          checked: node.attrs.checked === NOT_APPLICABLE ? false : NOT_APPLICABLE,
        });
      } catch { /* A stale control must not modify a different node. */ }
      return true;
    },
  } });
}
