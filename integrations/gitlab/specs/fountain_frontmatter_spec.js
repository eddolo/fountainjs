import { GlAlert, GlButton } from '@gitlab/ui';
import { fireEvent, getByRole, queryByRole } from '@testing-library/dom';
import { mountExtended } from 'helpers/vue_test_utils_helper';
import waitForPromises from 'helpers/wait_for_promises';
import { GitLabContentEditor, Selection, insertText, selectAll, undo, redo } from '~/content_editor/services/fountain_runtime';
import FountainCodeMenu from '~/content_editor/components/fountain_code_menu.vue';
import FountainFormattingToolbar from '~/content_editor/components/fountain_formatting_toolbar.vue';
import ContentEditor from '~/content_editor/components/content_editor.vue';
import FountainEditorSurface from '~/content_editor/components/fountain_editor_surface.vue';
import live from '../fixtures/fountain_frontmatter_live_html.json';

describe('native Fountain frontmatter controls', () => {
  let service;
  let wrapper;
  let toolbar;
  const settle = async () => { await waitForPromises(); await waitForPromises(); };
  const button = name => getByRole(wrapper.element, 'button', { name });
  const field = () => getByRole(wrapper.element, 'combobox', { name: 'Frontmatter format' });
  const dialog = () => getByRole(document.body, 'dialog', { name: 'Frontmatter source' });
  const sourceField = () => getByRole(dialog(), 'textbox', { name: 'Frontmatter source' });
  const fixture = name => live.fixtures.find(item => item.name === name);
  async function createComponent(name = 'yaml', editable = true) {
    const value = fixture(name);
    service = new GitLabContentEditor({ editable, describeLabels: () => '',
      renderMarkdown: () => Promise.resolve({ body: value.body }) });
    await service.setSerializedContent(value.source);
    service.editor.dispatch(service.editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    wrapper = mountExtended(FountainCodeMenu, { attachTo: document.body,
      propsData: { contentEditor: service, disabled: !editable }, stubs: { FountainDiagramPreview: true } });
    await settle();
  }
  async function openSource(readOnly = false) {
    fireEvent.click(button(readOnly ? 'View frontmatter source' : 'Edit frontmatter source'));
    await settle();
  }
  afterEach(() => { toolbar?.destroy(); toolbar = null; wrapper?.destroy(); service?.dispose(); });

  it.each(['yaml', 'toml', 'json'])('identifies the actual %s document header and exposes its literal source', async language => {
    await createComponent(language);
    expect(field().value).toBe(language);
    expect(wrapper.text()).toContain('Document frontmatter stays at the beginning');
    expect(queryByRole(wrapper.element, 'button', { name: 'Show diagram preview' })).toBeNull();
    await openSource();
    expect(sourceField().value).toBe(service.editor.state.doc.child(0).textContent);
    expect(wrapper.findComponent({ name: 'FountainDiagramPreview' }).exists()).toBe(false);
    expect(service.getSerializedContent()).toBe(fixture(language).source);
  });
  it('changes the format without claiming syntax translation and restores the original header with Undo', async () => {
    await createComponent();
    fireEvent.focus(field()); fireEvent.input(field(), { target: { value: 'toml' } });
    fireEvent.click(button('Apply frontmatter format')); await settle();
    expect(service.getSerializedContent()).toMatch(/^\+\+\+\ntitle: Paper/);
    expect(wrapper.text()).toContain('does not translate');
    expect(undo(service.editor)).toBe(true); await settle();
    expect(field().value).toBe('yaml'); expect(service.getSerializedContent()).toBe(fixture('yaml').source);
  });
  it('applies a source draft once, keeps literal markup and restores it through Undo and Redo', async () => {
    await createComponent(); await openSource();
    const value = 'title: "<tag> & preserved"\n# Author comment';
    fireEvent.input(sourceField(), { target: { value } });
    expect(wrapper.vm.hasUnappliedSource).toBe(true);
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply frontmatter source' })); await settle();
    expect(wrapper.vm.hasUnappliedSource).toBe(false);
    expect(service.getSerializedContent()).toContain(`---\n${value}\n---`);
    expect(undo(service.editor)).toBe(true); expect(service.getSerializedContent()).toBe(fixture('yaml').source);
    expect(redo(service.editor)).toBe(true); expect(service.getSerializedContent()).toContain(value);
  });
  it('retains a dangerous closing delimiter draft while leaving the current document unchanged', async () => {
    await createComponent(); await openSource();
    const value = 'title: Paper\n---\nBody pretending to be metadata';
    fireEvent.input(sourceField(), { target: { value } });
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply frontmatter source' })); await settle();
    expect(sourceField().value).toBe(value);
    expect(dialog().textContent).toContain('delimiter on its own line');
    expect(service.getSerializedContent()).toBe(fixture('yaml').source);
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Cancel source edit' })); await settle();
    expect(wrapper.vm.hasUnappliedSource).toBe(false);
  });
  it('does not redirect an open draft when the document source changes', async () => {
    await createComponent(); await openSource();
    fireEvent.input(sourceField(), { target: { value: 'title: Retain draft' } });
    expect(insertText(service.editor, '# Concurrent edit\n')).toBe(true); await settle();
    expect(dialog().textContent).toContain('changed or was replaced');
    expect(sourceField().value).toBe('title: Retain draft');
    const apply = getByRole(dialog(), 'button', { name: 'Apply frontmatter source' });
    expect(apply.disabled || apply.getAttribute('aria-disabled') === 'true').toBe(true);
    const before = service.getSerializedContent(); fireEvent.click(apply); await settle();
    expect(service.getSerializedContent()).toBe(before);
  });
  it('offers read-only source inspection without editable fields or an apply action', async () => {
    await createComponent('yaml', false); await openSource(true);
    expect(sourceField().readOnly).toBe(true);
    expect(queryByRole(dialog(), 'button', { name: 'Apply frontmatter source' })).toBeNull();
    expect(service.getSerializedContent()).toBe(fixture('yaml').source);
  });
  it('converts and deletes through explicit native actions, with exact source restored by Undo', async () => {
    await createComponent();
    fireEvent.click(button('Convert to regular code block')); await settle();
    expect(service.getSerializedContent()).toContain('```yaml\ntitle: Paper');
    expect(undo(service.editor)).toBe(true); await settle();
    expect(service.getSerializedContent()).toBe(fixture('yaml').source);
    fireEvent.click(button('Delete code block')); await settle();
    expect(service.getSerializedContent()).toBe('Body **text**.');
    expect(undo(service.editor)).toBe(true); expect(service.getSerializedContent()).toBe(fixture('yaml').source);
  });
  it('inserts a document header from the toolbar without replacing the selected body text', async () => {
    await createComponent('after-prose');
    const before = service.editor.state.doc;
    toolbar = mountExtended(FountainFormattingToolbar, { attachTo: document.body,
      propsData: { editor: service.editor, contentEditor: service } });
    fireEvent.click(getByRole(toolbar.element, 'button', { name: 'Insert frontmatter' })); await settle();
    expect(service.editor.state.doc.content.slice(1)).toEqual(before.content);
    expect(field().value).toBe('yaml');
    expect(getByRole(toolbar.element, 'combobox', { name: 'Text style' }).value).toBe('frontmatter');
    const insert = getByRole(toolbar.element, 'button', { name: 'Insert frontmatter' });
    expect(insert.disabled || insert.getAttribute('aria-disabled') === 'true').toBe(true);
    const inserted = service.editor.state.doc; fireEvent.click(insert); await settle();
    expect(service.editor.state.doc).toBe(inserted);
    const checkBlockedActions = async () => {
      for (const name of ['Insert a quote', 'Bullet list', 'Numbered list', 'Checklist', 'Bold']) {
        const action = getByRole(toolbar.element, 'button', { name });
        expect(action.disabled || action.getAttribute('aria-disabled') === 'true').toBe(true);
        fireEvent.click(action);
      }
      await settle(); expect(service.editor.state.doc).toBe(inserted);
    };
    await checkBlockedActions();
    selectAll(service.editor); await settle(); await checkBlockedActions();
    expect(undo(service.editor)).toBe(true); await settle();
    expect(service.getSerializedContent()).toBe(fixture('after-prose').source);
  });
  it('identifies a frontmatter-labelled fence without promoting it into document metadata', async () => {
    await createComponent('fenced-param');
    expect(wrapper.text()).toContain('not a document header');
    expect(queryByRole(wrapper.element, 'combobox', { name: 'Frontmatter format' })).toBeNull();
    expect(getByRole(wrapper.element, 'combobox', { name: 'Code language' }).value).toBe('yaml');
    expect(service.getSerializedContent()).toBe(fixture('fenced-param').source);
  });
});

describe('native frontmatter source handoff', () => {
  let wrapper;
  const value = live.fixtures.find(item => item.name === 'yaml');
  const settle = async () => { await waitForPromises(); await waitForPromises(); };
  const dialog = () => getByRole(document.body, 'dialog', { name: 'Frontmatter source' });
  beforeEach(async () => {
    wrapper = mountExtended(ContentEditor, { attachTo: document.body,
      propsData: { markdown: value.source, markdownDocsPath: '/docs/markdown', uploadsPath: '/uploads',
        renderMarkdown: jest.fn().mockResolvedValue({ body: value.body }) },
      stubs: { FountainEditorSurface, FountainFormattingToolbar, FountainCodeMenu, GlAlert, GlButton,
        FountainDiagramPreview: true } });
    await settle();
    const editor = wrapper.findComponent(FountainEditorSurface).props('editor');
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    await settle();
    fireEvent.click(getByRole(wrapper.element, 'button', { name: 'Edit frontmatter source' })); await settle();
    fireEvent.input(getByRole(dialog(), 'textbox', { name: 'Frontmatter source' }), { target: { value: 'title: Authored header' } });
    await settle();
  });
  afterEach(async () => { wrapper?.destroy(); await settle(); });
  it('blocks save/mode handoff for an unapplied draft and keeps source unchanged on Cancel', async () => {
    expect(() => wrapper.vm.getSerializedContentForHandoff()).toThrow('GITLAB_CODE_SOURCE_DRAFT_PENDING');
    expect(() => wrapper.findComponent(FountainEditorSurface).vm.getSerializedContentForHandoff()).toThrow('GITLAB_CODE_SOURCE_DRAFT_PENDING');
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Cancel source edit' })); await settle();
    expect(wrapper.vm.getSerializedContentForHandoff()).toBe(value.source);
  });
  it('hands off the applied header and preserves the existing body', async () => {
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply frontmatter source' })); await settle();
    const [{ markdown }] = wrapper.emitted('change').at(-1);
    expect(markdown).toBe('---\ntitle: Authored header\n---\n\nBody **text**.');
    await wrapper.setProps({ markdown }); await settle();
    expect(wrapper.vm.getSerializedContentForHandoff()).toBe(markdown);
  });
});
