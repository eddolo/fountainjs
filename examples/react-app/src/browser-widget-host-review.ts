import { CoreExtension, EditorView, Plugin, composeExtensions, createEditor } from '../../../src';
import { defineWidget } from '../../../src/widgets';
import { createDOMWidgetExtension } from '../../../src/widgets/dom';

export function mountWidgetHostReview(mount: HTMLElement) {
  const locked = document.createElement('input');
  locked.type = 'checkbox';
  locked.checked = true;
  const lockLabel = document.createElement('label');
  lockLabel.append(locked, ' Hold changes for review');
  const result = document.createElement('output');
  result.setAttribute('aria-label', 'Save result');
  const field = defineWidget({
    name: 'review_field', label: 'Issue assignment',
    attributes: { owner: { default: 'Mina' } },
    keyPolicy: { Enter: 'after' },
  });
  const extension = createDOMWidgetExtension(field, context => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    label.append('Assignee ', input);
    let savedOwner = context.attributes.owner;
    input.value = String(savedOwner);
    const save = document.createElement('button');
    save.textContent = 'Save assignee';
    save.onclick = () => {
      result.value = context.set('owner', input.value) ? 'Saved' : 'Change rejected';
    };
    context.controls.append(label, save);
    return {
      update(next) {
        if (next.attributes.owner !== savedOwner) {
          savedOwner = next.attributes.owner;
          input.value = String(savedOwner);
        }
      },
    };
  });
  const kit = composeExtensions([CoreExtension, extension]);
  const editor = createEditor({
    schema: kit.schema,
    plugins: [...kit.plugins, new Plugin({ filterTransaction: () => !locked.checked })],
    content: { type: 'doc', content: [
      { type: 'review_field' },
      { type: 'paragraph', content: [{ type: 'text', text: 'Follow-up' }] },
    ] },
  });
  const surface = document.createElement('div');
  const saved = document.createElement('output');
  saved.setAttribute('aria-label', 'Saved assignee');
  const refresh = () => { saved.value = String(editor.state.doc.child(0).attrs.owner); };
  editor.subscribe(refresh);
  refresh();
  mount.prepend(lockLabel, surface, result, saved);
  new EditorView(surface, editor, { ariaLabel: 'Review widget editor' });
}
