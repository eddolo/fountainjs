import AxiosMockAdapter from 'axios-mock-adapter';
import axios from '~/lib/utils/axios_utils';
import ContentEditor from '~/content_editor/components/content_editor.vue';
import FountainEditorSurface from '~/content_editor/components/fountain_editor_surface.vue';
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


const suggestionFixture = {"source": "```suggestion:-0+0\nreturn 42;\n```", "body": "<div class=\"gl-relative markdown-code-block js-markdown-code\"><pre data-sourcepos=\"1:1-3:3\" data-canonical-lang=\"suggestion\" data-lang-params=\"-0+0\" class=\"code highlight js-syntax-highlight language-suggestion\" v-pre=\"true\"><code class=\"js-render-suggestion\"><span id=\"LC1\" class=\"line\" data-lang=\"suggestion\">return 42;</span></code></pre></div>"};
const suggestionHost = {"canSuggest": true, "lines": ["const key = \"A​B\";"], "lineType": "", "showPopover": false, "blobRawPath": "/root/fountain-product-integration/-/raw/d36f602d8bb8e5c0187793e7a30436cef52aae97/suggestion-context-mwjpfe74.js", "lineRange": {"start": 1, "end": 1}, "previewParams": {"preview_suggestions": true, "line": 1, "file_path": "suggestion-context-mwjpfe74.js", "base_sha": "15aeca7199b19518372fcb918a96eae93fd7e915", "start_sha": "15aeca7199b19518372fcb918a96eae93fd7e915", "head_sha": "d36f602d8bb8e5c0187793e7a30436cef52aae97"}};
const suggestionFile = "const key = \"A​B\";\n\n  keep();  \nreturn 1;\n// end\n";

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
  const dialog = () => getByRole(document.body, 'dialog', { name: 'Diagram source and preview' });
  const sourceField = () => getByRole(dialog(), 'textbox', { name: 'Diagram source' });
  const sourceInput = value => fireEvent.input(sourceField(), { target: { value } });
  const openSource = async (readOnly = false) => {
    fireEvent.click(button(readOnly ? 'View diagram source' : 'Edit diagram source'));
    await settle();
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
      stubs: { FountainDiagramPreview: {
        name: 'FountainDiagramPreview', props: ['source', 'language', 'contentEditor'],
        template: '<div data-testid="diagram-preview-stub" :data-source="source" :data-language="language"></div>',
      } },
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
    expect(wrapper.findByTestId('content-editor-error').exists()).toBe(false);
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
  it.each(['mermaid', 'plantuml'])('previews a local %s draft then applies it as one undoable edit', async language => {
    await createComponent(true, language);
    const before = service.getSerializedContent();
    const original = service.editor.state.doc.child(0).textContent;
    await openSource();
    expect(sourceField().value).toBe(original);
    sourceInput(`${original}\nDraft addition`); await settle();
    expect(wrapper.vm.hasUnappliedSource).toBe(true);
    expect(dialog().querySelector('[data-testid="diagram-preview-stub"]').dataset.source).toBe(`${original}\nDraft addition`);
    expect(service.getSerializedContent()).toBe(before);
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply diagram source' })); await settle();
    expect(queryByRole(document.body, 'dialog')).toBeNull();
    expect(service.editor.state.doc.child(0).textContent).toBe(`${original}\nDraft addition`);
    expect(wrapper.vm.hasUnappliedSource).toBe(false);
    expect(undo(service.editor)).toBe(true); expect(service.getSerializedContent()).toBe(before);
    expect(redo(service.editor)).toBe(true); expect(service.getSerializedContent()).toContain('Draft addition');
  });
  it('cancels local source changes without changing the document or history', async () => {
    await createComponent(true, 'mermaid'); const before = service.getSerializedContent();
    await openSource(); sourceInput('My uncommitted draft'); await settle();
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Cancel source edit' })); await settle();
    expect(queryByRole(document.body, 'dialog')).toBeNull();
    expect(wrapper.vm.hasUnappliedSource).toBe(false);
    expect(service.getSerializedContent()).toBe(before); expect(undo(service.editor)).toBe(false);
  });
  it('retains a source draft when the target changes and disables applying to it', async () => {
    await createComponent(true, 'mermaid'); await openSource(); sourceInput('My retained draft'); await settle();
    insertText(service.editor, 'another edit'); await settle();
    expect(sourceField().value).toBe('My retained draft');
    expect(getByRole(dialog(), 'alert').textContent).toContain('diagram changed or was replaced');
    expect(getByRole(dialog(), 'button', { name: 'Apply diagram source' }).getAttribute('aria-disabled')).toBe('true');
    expect(getByRole(dialog(), 'button', { name: 'Copy source draft' }).getAttribute('aria-disabled')).not.toBe('true');
    expect(service.editor.state.doc.child(0).textContent).not.toContain('My retained draft');
  });
  it('keeps a deleted diagram draft visible and copyable after the editor selection changes', async () => {
    await createComponent(true, 'mermaid'); await openSource(); sourceInput('Retain after deletion'); await settle();
    service.editor.dispatch(service.editor.createTransaction().replaceNode([0], [service.editor.state.schema.node('paragraph', {}, [service.editor.state.schema.text('Replacement')])]));
    await settle(); expect(sourceField().value).toBe('Retain after deletion');
    expect(getByRole(dialog(), 'alert').textContent).toContain('diagram changed or was replaced');
  });
  it('does not dismiss a composing source or apply it until composition ends', async () => {
    await createComponent(true, 'mermaid'); await openSource();
    fireEvent.compositionStart(sourceField()); sourceInput('graph LR\n日本語-->B'); await settle();
    fireEvent.keyDown(sourceField(), { key: 'Escape', isComposing: true }); await settle();
    expect(sourceField().value).toContain('日本語');
    expect(getByRole(dialog(), 'button', { name: 'Apply diagram source' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.compositionEnd(sourceField()); await settle();
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply diagram source' })); await settle();
    expect(service.editor.state.doc.child(0).textContent).toBe('graph LR\n日本語-->B');
  });
  it('retains an unapplied language draft when source editing is requested', async () => {
    await createComponent(true, 'mermaid'); draft('my-language'); await settle();
    fireEvent.click(button('Edit diagram source')); await settle();
    expect(queryByRole(document.body, 'dialog')).toBeNull();
    expect(field().value).toBe('my-language');
    expect(getByRole(wrapper.element, 'alert').textContent).toContain('Apply or cancel your language draft');
  });
  it('allows read-only source inspection and preview without authoring controls or history', async () => {
    await createComponent(false, 'plantuml'); const before = service.getSerializedContent();
    await openSource(true); expect(sourceField().readOnly).toBe(true);
    expect(queryByRole(dialog(), 'button', { name: 'Apply diagram source' })).toBeNull();
    expect(dialog().querySelector('[data-testid="diagram-preview-stub"]').dataset.language).toBe('plantuml');
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Close diagram source' })); await settle();
    expect(service.getSerializedContent()).toBe(before); expect(undo(service.editor)).toBe(false);
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
  async function createSuggestion({ editable = true, active = true, loader = async () => suggestionFile } = {}) {
    const configuration = JSON.parse(JSON.stringify(suggestionHost));
    if (!active) configuration.canSuggest = false;
    service = new GitLabContentEditor({ editable, describeLabels: () => '', renderMarkdown: async () => ({ body: suggestionFixture.body }),
      getSuggestionContext: () => configuration, loadSuggestionSource: loader });
    await service.setSerializedContent(suggestionFixture.source);
    service.editor.dispatch(service.editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    wrapper = mountExtended(FountainCodeMenu, { propsData: { contentEditor: service, disabled: !editable, configuration }, attachTo: document.body });
    await settle(); return configuration;
  }
  const suggestionDialog = () => getByRole(document.body, 'dialog', { name: 'Suggested replacement' });
  const replacementField = () => getByRole(suggestionDialog(), 'textbox', { name: 'Replacement source' });
  async function editSuggestion(readOnly = false) {
    fireEvent.click(button(readOnly ? 'View suggestion source' : 'Edit suggestion')); await settle();
  }
  it('exposes suggestion actions instead of a code-language editor', async () => {
    await createSuggestion();
    expect(queryByRole(wrapper.element, 'combobox', { name: 'Code language' })).toBeNull();
    expect(disabled('Edit suggestion')).toBe(false); expect(disabled('Delete suggestion')).toBe(false);
    expect(button('Copy replacement')).toBeVisible();
  });
  it('applies replacement and expanded file range together with one undo', async () => {
    await createSuggestion(); await editSuggestion();
    fireEvent.input(replacementField(), { target: { value: 'return 99;\n' } });
    expect(wrapper.vm.hasUnappliedSource).toBe(true);
    fireEvent.click(getByRole(suggestionDialog(), 'button', { name: 'Load original file' })); await settle();
    expect(getByRole(suggestionDialog(), 'region', { name: 'Original file lines' }).textContent).toContain('3:   keep();  ');
    fireEvent.input(getByRole(suggestionDialog(), 'spinbutton', { name: 'Last file line' }), { target: { value: '3' } });
    fireEvent.click(getByRole(suggestionDialog(), 'button', { name: 'Apply suggestion' })); await settle();
    expect(service.getSerializedContent()).toBe('```suggestion:-0+2\nreturn 99;\n```');
    expect(undo(service.editor)).toBe(true); expect(service.getSerializedContent()).toBe(suggestionFixture.source);
    expect(undo(service.editor)).toBe(false);
  });
  it('retains a replacement and range draft after a refused expansion without a file load', async () => {
    await createSuggestion(); await editSuggestion();
    fireEvent.input(replacementField(), { target: { value: 'retained();\n' } });
    fireEvent.input(getByRole(suggestionDialog(), 'spinbutton', { name: 'Last file line' }), { target: { value: '3' } });
    fireEvent.click(getByRole(suggestionDialog(), 'button', { name: 'Apply suggestion' })); await settle();
    expect(service.getSerializedContent()).toBe(suggestionFixture.source); expect(replacementField().value).toBe('retained();\n');
    expect(getByRole(suggestionDialog(), 'alert').textContent).toContain('Load the original file');
  });
  it('retains the draft and disables Apply when host suggestion permission changes', async () => {
    const configuration = await createSuggestion(); await editSuggestion();
    fireEvent.input(replacementField(), { target: { value: 'pending();\n' } }); configuration.canSuggest = false;
    await wrapper.setProps({ configuration: { ...configuration } }); await settle();
    expect(wrapper.vm.sourceSession.conflict).toBe(true);
    expect(wrapper.vm.sourceConflict).toBe(true);
    const primary = getByRole(suggestionDialog(), 'button', { name: 'Apply suggestion' });
    expect(primary.disabled || primary.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(getByRole(suggestionDialog(), 'alert').textContent).toContain('file context changed');
    expect(replacementField().value).toBe('pending();\n'); expect(service.getSerializedContent()).toBe(suggestionFixture.source);
  });
  it('edits replacement text without inventing a file range outside an active diff context', async () => {
    await createSuggestion({ active: false }); await editSuggestion();
    expect(queryByRole(suggestionDialog(), 'spinbutton', { name: 'First file line' })).toBeNull();
    fireEvent.input(replacementField(), { target: { value: 'sourceOnly();\n' } });
    fireEvent.click(getByRole(suggestionDialog(), 'button', { name: 'Apply suggestion' })); await settle();
    expect(service.getSerializedContent()).toBe('```suggestion:-0+0\nsourceOnly();\n```');
  });
  it('keeps read-only suggestion source inspectable while disabling mutation', async () => {
    await createSuggestion({ editable: false }); expect(disabled('Delete suggestion')).toBe(true);
    await editSuggestion(true); expect(replacementField().readOnly).toBe(true);
    expect(queryByRole(suggestionDialog(), 'button', { name: 'Apply suggestion' })).toBeNull();
  });

});


describe('native suggestion raw-file transport', () => {
  let wrapper;
  let mock;
  const endpoint = new URL(suggestionHost.blobRawPath, window.location.href).href;
  const settle = async () => { await waitForPromises(); await waitForPromises(); };
  const button = () => getByRole(wrapper.element, 'button', { name: 'Insert suggestion' });
  const editor = () => wrapper.findComponent(FountainEditorSurface).props('editor');
  async function createComponent(lines = ['const value = "\uE000";']) {
    wrapper = mountExtended(ContentEditor, { propsData: {
      markdown: '', markdownDocsPath: '/docs/markdown', uploadsPath: '',
      codeSuggestionsConfig: { ...suggestionHost, lines },
      renderMarkdown: jest.fn().mockResolvedValue({ body: '<p></p>' }),
    }, attachTo: document.body });
    await settle();
  }
  beforeEach(() => { mock = new AxiosMockAdapter(axios); });
  afterEach(async () => { wrapper?.destroy(); await settle(); mock.restore(); });
  it.each([
    ['literal backslash-n', 'const value = "\\n";\n', ['const value = "\uE000";']],
    ['genuine private-use character', 'const value = "\uE000";\n', ['const value = "\uE000";']],
    ['JSON-looking raw source', '{"key":"\\n"}\n', ['{"key":"\uE000"}']],
  ])('inserts exact %s from the authenticated raw response', async (_name, raw, lines) => {
    mock.onGet(endpoint).reply(200, raw); await createComponent(lines);
    fireEvent.click(button()); await settle();
    expect(mock.history.get.map(request => request.url)).toEqual([endpoint]);
    expect(mock.history.get[0].signal).toBeInstanceOf(AbortSignal);
    expect(editor().state.doc.childCount).toBe(1);
    expect(editor().state.doc.child(0).textContent).toBe(raw);
    expect(wrapper.emitted('change').at(-1)[0].markdown).toBe('```suggestion:-0+0\n' + raw + '```');
    expect(wrapper.findByTestId('content-editor-error').exists()).toBe(false);
  });
  it('prevents duplicate insertion and old-source handoff until the owned raw request finishes', async () => {
    let finish;
    mock.onGet(endpoint).reply(() => new Promise(resolve => { finish = resolve; }));
    await createComponent(); fireEvent.click(button()); await settle();
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(() => wrapper.vm.getSerializedContentForHandoff()).toThrow();
    expect(editor().getText()).toBe('');
    finish([200, 'const value = "\\n";\n']); await settle();
    expect(editor().state.doc.child(0).textContent).toBe('const value = "\\n";\n');
    expect(button().getAttribute('aria-disabled')).not.toBe('true');
  });
  it('refuses a changed file context while keeping the current draft', async () => {
    let finish;
    mock.onGet(endpoint).reply(() => new Promise(resolve => { finish = resolve; }));
    await createComponent(); fireEvent.click(button()); await settle();
    await wrapper.setProps({ codeSuggestionsConfig: { ...suggestionHost, previewParams: {
      ...suggestionHost.previewParams, head_sha: 'b'.repeat(40),
    } } });
    finish([200, 'const value = "\\n";\n']); await settle();
    expect(editor().state.doc.child(0).type.name).toBe('paragraph');
    expect(wrapper.attributes('data-fountain-error')).toBe('GITLAB_SUGGESTION_CONTEXT_CHANGED');
    expect(undo(editor())).toBe(false);
  });
  it('aborts the raw-file request when the native host is unmounted', async () => {
    let finish;
    mock.onGet(endpoint).reply(() => new Promise(resolve => { finish = resolve; }));
    await createComponent(); fireEvent.click(button()); await settle();
    const signal = mock.history.get[0].signal; wrapper.destroy(); await settle();
    expect(signal.aborted).toBe(true);
    finish([200, 'const value = "\\n";\n']); await settle();
  });
});
