// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { CoreSchemaSpec, EditorView, createEditor } from 'fountainjs-editor';
import { createGitLabReferenceNavigationPlugin } from '../integrations/gitlab/plugins/reference_navigation';

const dispose: (() => void)[] = [];
afterEach(() => dispose.splice(0).forEach(action => action()));

it('prevents native reference navigation in the editable view without removing its link', () => {
  const plugin = createGitLabReferenceNavigationPlugin();
  const editor = createEditor({ schema: { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
    reference: { group: 'inline', inline: true, atom: true,
      toDOM: () => ['a', { href: '/root', 'data-fountain-gitlab-reference': 'user' }, ['span', {}, '@root']] },
  } }, plugins: [plugin], content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'reference' }] }] } });
  const mount = document.createElement('div'); document.body.append(mount);
  const view = new EditorView(mount, editor);
  dispose.push(() => { view.destroy(); editor.destroy(); mount.remove(); });
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  view.dom.querySelector('a span')!.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(view.dom.querySelector('a')!.getAttribute('href')).toBe('/root');
});

it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])(
  'leaves intentional modified navigation to the browser: %j', modifiers => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    dispose.push(() => editor.destroy());
    const target = document.createElement('a'); target.setAttribute('data-fountain-gitlab-reference', 'user');
    const event = new MouseEvent('click', { button: 0, ...modifiers });
    Object.defineProperty(event, 'target', { value: target });
    expect(createGitLabReferenceNavigationPlugin().spec.props!.handleClick!(editor, event)).toBe(false);
  },
);

it('allows reader navigation and leaves unrelated author controls alone', () => {
  const editor = createEditor({ schema: CoreSchemaSpec, editable: false });
  dispose.push(() => editor.destroy());
  const target = document.createElement('a'); target.setAttribute('data-fountain-gitlab-reference', 'user');
  const event = new MouseEvent('click', { button: 0 }); Object.defineProperty(event, 'target', { value: target });
  const handle = createGitLabReferenceNavigationPlugin().spec.props!.handleClick!;
  expect(handle(editor, event)).toBe(false);
  editor.setEditable(true);
  target.removeAttribute('data-fountain-gitlab-reference');
  expect(handle(editor, event)).toBe(false);
});
