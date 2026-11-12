import { fireEvent, getByRole, queryByRole } from '@testing-library/dom';
import { mountExtended } from 'helpers/vue_test_utils_helper';
import waitForPromises from 'helpers/wait_for_promises';
import {
  GitLabContentEditor,
  Selection,
  insertText,
  undo,
  redo,
} from '~/content_editor/services/fountain_runtime';
import FountainCodeMenu from '~/content_editor/components/fountain_code_menu.vue';

describe('FountainCodeMenu', () => {
  let wrapper;
  let service;
  const source = '```js\nconst x = 1;\nconsole.log(x);\n```';
  const button = (name) => getByRole(wrapper.element, 'button', { name });
  const field = () => getByRole(wrapper.element, 'combobox', { name: 'Code language' });
  const disabled = (name) =>
    button(name).getAttribute('aria-disabled') === 'true' || button(name).disabled;
  const settle = async () => {
    await waitForPromises();
    await waitForPromises();
  };
  async function createComponent(editable = true) {
    service = new GitLabContentEditor({
      editable,
      describeLabels: () => '',
      renderMarkdown: () =>
        Promise.resolve({
          body: '<pre data-canonical-lang="js"><code>const x = 1;\nconsole.log(x);</code></pre>',
        }),
    });
    await service.setSerializedContent(source);
    const { editor } = service;
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
    wrapper = mountExtended(FountainCodeMenu, {
      propsData: { contentEditor: service, disabled: !editable },
      attachTo: document.body,
    });
    await settle();
  }
  const draft = (value) => {
    fireEvent.focus(field());
    fireEvent.input(field(), { target: { value } });
  };
  afterEach(() => {
    wrapper?.destroy();
    service?.dispose();
  });

  it('prefills the canonical language and applies a custom label with one-step undo/redo', async () => {
    await createComponent();
    expect(field().value).toBe('js');
    draft('my-company-dsl');
    fireEvent.click(button('Apply language'));
    await settle();
    expect(service.getSerializedContent()).toContain(
      '```my-company-dsl\nconst x = 1;\nconsole.log(x);',
    );
    expect(wrapper.emitted('focus')).toHaveLength(1);
    expect(undo(service.editor)).toBe(true);
    await settle();
    expect(field().value).toBe('js');
    expect(redo(service.editor)).toBe(true);
    await settle();
    expect(field().value).toBe('my-company-dsl');
  });
  it('retains an invalid draft and permits correction', async () => {
    await createComponent();
    draft('two words');
    fireEvent.click(button('Apply language'));
    await settle();
    expect(getByRole(wrapper.element, 'alert').textContent).toContain('language label');
    expect(field().value).toBe('two words');
    expect(service.getSerializedContent()).toBe(source);
    fireEvent.input(field(), { target: { value: 'python' } });
    fireEvent.click(button('Apply language'));
    await settle();
    expect(queryByRole(wrapper.element, 'alert')).toBeNull();
    expect(service.getSerializedContent()).toContain('```python');
  });
  it('contains submission so applying a language cannot submit the owning GitLab form', async () => {
    await createComponent();
    const hostSubmit = jest.fn();
    document.body.addEventListener('submit', hostSubmit);
    try {
      draft('python');
      fireEvent.submit(field().closest('form'));
      await settle();
      expect(service.getSerializedContent()).toContain('```python');
      expect(hostSubmit).not.toHaveBeenCalled();
    } finally {
      document.body.removeEventListener('submit', hostSubmit);
    }
  });
  it('explains specialized renderer refusal without changing code or draft', async () => {
    await createComponent();
    draft('mermaid');
    fireEvent.click(button('Apply language'));
    await settle();
    expect(getByRole(wrapper.element, 'alert').textContent).toContain('specialized GitLab adapter');
    expect(field().value).toBe('mermaid');
    expect(service.getSerializedContent()).toBe(source);
  });
  it('cancels through Escape without changing the document', async () => {
    await createComponent();
    draft('rust');
    fireEvent.keyDown(field(), { key: 'Escape', keyCode: 27 });
    await settle();
    expect(field().value).toBe('js');
    expect(service.getSerializedContent()).toBe(source);
    expect(wrapper.emitted('focus')).toHaveLength(1);
  });
  it('leaves an IME composition active when Escape is pressed', async () => {
    await createComponent();
    draft('rust');
    fireEvent.keyDown(field(), { key: 'Escape', isComposing: true });
    await settle();
    expect(field().value).toBe('rust');
    expect(wrapper.emitted('focus')).toBeUndefined();
    expect(button('Cancel language edit')).toBeDefined();
    expect(service.getSerializedContent()).toBe(source);
  });
  it('retains a draft after the captured code changes and refuses stale apply/delete', async () => {
    await createComponent();
    draft('rust');
    insertText(service.editor, '!');
    await settle();
    expect(getByRole(wrapper.element, 'alert').textContent).toContain('code block changed');
    expect(field().value).toBe('rust');
    expect(disabled('Apply language')).toBe(true);
    expect(disabled('Delete code block')).toBe(true);
    fireEvent.click(button('Cancel language edit'));
    await settle();
    expect(field().value).toBe('js');
  });
  it('removes a full multiline block and restores it through undo', async () => {
    await createComponent();
    fireEvent.click(button('Delete code block'));
    await settle();
    expect(service.editor.state.doc.child(0).type.name).toBe('paragraph');
    expect(wrapper.find('[data-testid="native-code-menu"]').exists()).toBe(false);
    expect(undo(service.editor)).toBe(true);
    await settle();
    expect(field().value).toBe('js');
    expect(service.getSerializedContent()).toBe(source);
  });
  it('keeps read-only language/deletion disabled while exposing copy', async () => {
    await createComponent(false);
    expect(field().disabled).toBe(true);
    expect(disabled('Apply language')).toBe(true);
    expect(disabled('Delete code block')).toBe(true);
    expect(disabled('Copy code')).toBe(false);
  });
  it('closes the owned session on component teardown', async () => {
    await createComponent();
    draft('rust');
    const { session } = wrapper.vm;
    wrapper.destroy();
    expect(session.closed).toBe(true);
    wrapper = null;
  });
});
