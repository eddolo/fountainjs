import { GlAlert, GlButton } from '@gitlab/ui';
import { fireEvent, getByRole } from '@testing-library/dom';
import { mountExtended } from 'helpers/vue_test_utils_helper';
import waitForPromises from 'helpers/wait_for_promises';
import ContentEditor from '~/content_editor/components/content_editor.vue';
import FountainEditorSurface from '~/content_editor/components/fountain_editor_surface.vue';
import FountainFormattingToolbar from '~/content_editor/components/fountain_formatting_toolbar.vue';
import FountainCodeMenu from '~/content_editor/components/fountain_code_menu.vue';
import { Selection } from '~/content_editor/services/fountain_runtime';

describe('Native diagram authoring host', () => {
  let wrapper;
  const source = '```mermaid\ngraph LR\n  A-->B\n```';
  const settle = async () => { await waitForPromises(); await waitForPromises(); };
  const dialog = () => getByRole(document.body, 'dialog', { name: 'Diagram source and preview' });
  const input = value => fireEvent.input(getByRole(dialog(), 'textbox', { name: 'Diagram source' }), { target: { value } });
  const open = async () => {
    fireEvent.click(getByRole(wrapper.element, 'button', { name: 'Edit diagram source' })); await settle();
  };
  beforeEach(async () => {
    wrapper = mountExtended(ContentEditor, {
      propsData: { markdown: source, markdownDocsPath: '/docs/markdown', uploadsPath: '/uploads',
        renderMarkdown: jest.fn().mockResolvedValue({ body: '<pre data-canonical-lang="mermaid"><code>graph LR\n  A--&gt;B</code></pre>' }) },
      attachTo: document.body,
      stubs: { FountainEditorSurface, FountainFormattingToolbar, FountainCodeMenu, GlAlert, GlButton,
        FountainDiagramPreview: true },
    });
    await settle();
    const editor = wrapper.findComponent(FountainEditorSurface).props('editor');
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
    await settle();
  });
  afterEach(async () => { wrapper?.destroy(); await settle(); });
  it('blocks both handoff and current-content reads for an unapplied draft; Cancel restores both', async () => {
    expect(wrapper.vm.getSerializedContentForHandoff()).toBe(source);
    await open(); input('graph LR\n  Draft-->Retained'); await settle();
    expect(() => wrapper.vm.getSerializedContentForHandoff()).toThrow('GITLAB_CODE_SOURCE_DRAFT_PENDING');
    expect(() => wrapper.findComponent(FountainEditorSurface).vm.getSerializedContentForHandoff()).toThrow('GITLAB_CODE_SOURCE_DRAFT_PENDING');
    expect(wrapper.findComponent(FountainEditorSurface).props('editor').getText()).not.toContain('Retained');
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Cancel source edit' })); await settle();
    expect(wrapper.vm.getSerializedContentForHandoff()).toBe(source);
    expect(wrapper.findComponent(FountainEditorSurface).vm.getSerializedContentForHandoff()).toBe(source);
  });
  it('publishes the applied source and clears the draft guard for the owning Markdown host', async () => {
    await open(); input('graph LR\n  Applied-->Published'); await settle();
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply diagram source' })); await settle();
    const latest = wrapper.emitted('change').at(-1)[0].markdown;
    expect(latest).toContain('Applied-->Published');
    await wrapper.setProps({ markdown: latest }); await settle();
    expect(wrapper.vm.getSerializedContentForHandoff()).toBe(latest);
    expect(wrapper.findComponent(FountainEditorSurface).vm.getSerializedContentForHandoff()).toBe(latest);
  });
  it('does not block current-content reads merely for opening an unchanged source', async () => {
    await open();
    expect(wrapper.vm.getSerializedContentForHandoff()).toBe(source);
    expect(wrapper.findComponent(FountainEditorSurface).vm.getSerializedContentForHandoff()).toBe(source);
  });
});
