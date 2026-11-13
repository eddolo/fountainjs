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
import FountainDiagramPreview from '~/content_editor/components/fountain_diagram_preview.vue';
import FountainFormattingToolbar from '~/content_editor/components/fountain_formatting_toolbar.vue';
import diagramData from '../fixtures/fountain_diagram_live_html.json';

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
  async function createComponent(editable = true, fixtureName = null) {
    const fixture = diagramData.fixtures.find(item => item.name === fixtureName);
    service = new GitLabContentEditor({
      editable,
      describeLabels: () => '',
      renderMarkdown: () =>
        Promise.resolve({
          body: fixture?.body || '<pre data-canonical-lang="js"><code>const x = 1;\nconsole.log(x);</code></pre>',
        }),
    });
    await service.setSerializedContent(fixture?.source || source);
    const { editor } = service;
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
    wrapper = mountExtended(FountainCodeMenu, {
      propsData: { contentEditor: service, disabled: !editable },
      stubs: { FountainDiagramPreview: true },
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
    draft('math');
    fireEvent.click(button('Apply language'));
    await settle();
    expect(getByRole(wrapper.element, 'alert').textContent).toContain('specialized GitLab adapter');
    expect(field().value).toBe('math');
    expect(service.getSerializedContent()).toBe(source);
  });
  it.each(['mermaid', 'plantuml'])('opens and closes a %s preview without changing the source or undo history', async language => {
    await createComponent(true, language);
    const before = service.getSerializedContent();
    expect(field().value).toBe(language);
    fireEvent.click(button('Show diagram preview')); await settle();
    expect(wrapper.findComponent(FountainDiagramPreview).props('source')).toBe(service.editor.state.doc.child(0).textContent);
    expect(wrapper.findComponent(FountainDiagramPreview).props('language')).toBe(language);
    expect(service.getSerializedContent()).toBe(before);
    fireEvent.click(button('Hide diagram preview')); await settle();
    expect(wrapper.findComponent(FountainDiagramPreview).exists()).toBe(false);
    expect(service.getSerializedContent()).toBe(before);
    expect(undo(service.editor)).toBe(false);
  });
  it.each(['mermaid', 'plantuml'])('allows a read-only %s preview while mutation controls remain disabled', async language => {
    await createComponent(false, language);
    const before = service.getSerializedContent();
    expect(disabled('Apply language')).toBe(true); expect(disabled('Delete code block')).toBe(true);
    expect(disabled('Show diagram preview')).toBe(false);
    fireEvent.click(button('Show diagram preview')); await settle();
    expect(wrapper.findComponent(FountainDiagramPreview).props('language')).toBe(language);
    expect(service.getSerializedContent()).toBe(before);
  });
  it.each(['mermaid', 'plantuml'])('exposes %s in the block-type selector with preserved source and one-step undo', async language => {
    await createComponent();
    const toolbar = mountExtended(FountainFormattingToolbar, { propsData: { editor: service.editor, contentEditor: service }, attachTo: document.body });
    try {
      const text = service.editor.state.doc.child(0).textContent;
      const styles = getByRole(toolbar.element, 'combobox', { name: 'Text style' });
      fireEvent.change(styles, { target: { value: language } }); await settle();
      expect(service.editor.state.doc.child(0).attrs.language).toBe(language);
      expect(service.editor.state.doc.child(0).textContent).toBe(text);
      expect(styles.value).toBe(language); expect(field().value).toBe(language);
      expect(undo(service.editor)).toBe(true); expect(service.getSerializedContent()).toBe(source);
    } finally { toolbar.destroy(); }
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
