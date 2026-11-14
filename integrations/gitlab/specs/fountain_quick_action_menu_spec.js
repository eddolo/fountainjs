import { fireEvent, getByRole, queryByRole } from '@testing-library/dom';
import { markRaw } from 'vue';
import { mountExtended } from 'helpers/vue_test_utils_helper';
import waitForPromises from 'helpers/wait_for_promises';
import { GitLabContentEditor, Selection, undo, parseGitLabQuickActionCommands } from '~/content_editor/services/fountain_runtime';
import FountainEditorSurface from '~/content_editor/components/fountain_editor_surface.vue';
import FountainQuickActionMenu from '~/content_editor/components/fountain_quick_action_menu.vue';
import fixture from '../fixtures/fountain_quick_action_commands_live.json';

describe('native quick action controls', () => {
  let wrapper;
  let service;
  let provider;
  let render;
  let restoreWidth;
  const commands = parseGitLabQuickActionCommands(fixture.commands);
  const settle = async () => {
    await waitForPromises(); jest.runOnlyPendingTimers(); await waitForPromises();
    jest.runOnlyPendingTimers(); await waitForPromises();
  };
  const list = () => getByRole(document.body, 'listbox', { name: 'Available quick actions' });
  const root = () => getByRole(wrapper.element, 'textbox', { name: 'Command document' });
  const choose = text => {
    const { editor } = service;
    const { schema } = editor.state;
    editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text(text)])]))
      .setSelection(Selection.cursor([0, 0], 0)));
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], text.length)));
  };
  const createComponent = async ({ text = '/la', fail = false } = {}) => {
    provider = jest.fn(() => fail ? Promise.reject(new Error('Unavailable')) : Promise.resolve(commands));
    render = jest.fn().mockResolvedValue({ body: '<p>Start</p>', references: { commands: '<p>Add the selected label.</p>' } });
    service = new GitLabContentEditor({ renderMarkdown: render, describeLabels: () => '', quickActionProvider: provider });
    await service.setSerializedContent('Start');
    wrapper = mountExtended({
      components: { FountainEditorSurface, FountainQuickActionMenu },
      data() { return { owner: markRaw(service) }; },
      methods: {
        getRoot() { return this.$refs.surface?.getRootElement() || null; },
        ready() { this.$refs.menu.refreshRoot(); },
        focus() { this.$refs.surface.focus(); },
      },
      template: `<main><fountain-quick-action-menu ref="menu" :content-editor="owner" :get-editor-root="getRoot" @focus="focus" />
        <fountain-editor-surface ref="surface" :editor="owner.editor" :options="{ ariaLabel: 'Command document' }" @ready="ready" /></main>`,
    }, { attachTo: document.body });
    choose(text); await settle(); wrapper.findComponent(FountainEditorSurface).vm.focus(); await settle();
  };
  beforeEach(() => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    restoreWidth = () => Object.defineProperty(window, 'innerWidth', descriptor);
  });
  afterEach(async () => { wrapper?.destroy(); service?.dispose(); await settle(); restoreWidth(); });

  it('shows server names, parameter hints, descriptions and matching aliases', async () => {
    await createComponent({ text: '/labels' });
    expect(getByRole(list(), 'option', { name: /\/label.*Add labels/ }).textContent).toContain('~label1');
    expect(provider).toHaveBeenCalledWith({ query: 'labels', signal: expect.any(AbortSignal) });
    expect(list().querySelectorAll('[role="option"]')).toHaveLength(1);
  });
  it('inserts a clicked command, places the caret after its argument trigger and closes the name suggestions', async () => {
    await createComponent();
    fireEvent.click(getByRole(list(), 'option', { name: /\/label.*Add labels/ })); await settle();
    expect(service.getSerializedContent()).toBe('/label ~');
    expect(service.editor.state.selection.from).toBe(8);
    expect(queryByRole(document.body, 'listbox')).toBeNull();
    expect(document.activeElement).toBe(root());
    expect(undo(service.editor)).toBe(true); expect(service.getSerializedContent()).toBe('/la');
  });
  it('supports Arrow and Enter from a focused list without submitting a form', async () => {
    await createComponent({ text: '/' });
    const popup = list(); popup.focus();
    fireEvent.keyDown(popup, { key: 'ArrowDown' }); await settle();
    const selected = document.getElementById(popup.getAttribute('aria-activedescendant'));
    const label = selected.textContent.match(/\/[a-z_-]+/u)[0];
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    popup.dispatchEvent(event); await settle();
    expect(event.defaultPrevented).toBe(true); expect(service.getSerializedContent()).toBe(`${label} `);
  });
  it('reaches docked suggestions with Alt+F10 at a narrow viewport', async () => {
    await createComponent();
    fireEvent.keyDown(root(), { key: 'F10', altKey: true }); await settle();
    expect(document.activeElement).toBe(list());
    fireEvent.keyDown(list(), { key: 'Enter' }); await settle();
    expect(service.getSerializedContent()).toBe('/label ~');
    expect(document.activeElement).toBe(root());
  });
  it('keeps composition and modified keys out of suggestion navigation', async () => {
    await createComponent({ text: '/' }); const popup = list();
    const selected = popup.getAttribute('aria-activedescendant');
    fireEvent.keyDown(popup, { key: 'ArrowDown', isComposing: true });
    fireEvent.keyDown(popup, { key: 'ArrowDown', ctrlKey: true }); await settle();
    expect(popup.getAttribute('aria-activedescendant')).toBe(selected);
  });
  it('Escape dismisses and clears owned ARIA without cancelling the surrounding form', async () => {
    await createComponent(); const parent = jest.fn(); wrapper.element.addEventListener('keydown', parent);
    const popup = list(); popup.focus(); fireEvent.keyDown(popup, { key: 'Escape' }); await settle();
    expect(queryByRole(document.body, 'listbox')).toBeNull();
    expect(parent).not.toHaveBeenCalled(); expect(root().hasAttribute('aria-controls')).toBe(false);
    expect(service.getSerializedContent()).toBe('/la');
  });
  it('exposes a valid active-descendant relation while keeping the editor a textbox', async () => {
    await createComponent();
    expect(root().getAttribute('role')).toBe('textbox');
    expect(document.getElementById(root().getAttribute('aria-controls'))).toBe(list());
    expect(document.getElementById(root().getAttribute('aria-activedescendant')).getAttribute('role')).toBe('option');
    expect(root().getAttribute('aria-autocomplete')).toBe('list');
  });
  it('explains the real server response without executing the command', async () => {
    await createComponent({ text: '/label ~example' });
    expect(wrapper.text()).toContain('On Save: Add the selected label.');
    expect(service.getSerializedContent()).toBe('/label ~example');
    expect(render).toHaveBeenCalledTimes(2);
  });
  it('switches to literal text and back as undoable document changes', async () => {
    await createComponent({ text: '/label ~example' });
    fireEvent.click(getByRole(wrapper.element, 'button', { name: 'Treat as literal text' })); await settle();
    expect(wrapper.text()).toContain('This line stays text.'); expect(service.getSerializedContent()).toContain('\\/label');
    fireEvent.click(getByRole(wrapper.element, 'button', { name: 'Treat as quick action' })); await settle();
    expect(service.getSerializedContent()).toBe('/label ~example');
    expect(undo(service.editor)).toBe(true); expect(service.getSerializedContent()).toContain('\\/label');
  });
  it('shows transport failure with an explicit successful retry', async () => {
    await createComponent({ fail: true }); expect(wrapper.text()).toContain('Available commands could not be loaded.');
    provider.mockResolvedValue(commands);
    fireEvent.click(getByRole(wrapper.element, 'button', { name: 'Retry commands' })); await settle();
    expect(getByRole(list(), 'option', { name: /\/label.*Add labels/ })).toBeVisible();
  });
  it('hides controls and restores ARIA when the editor becomes read-only', async () => {
    await createComponent(); service.editor.setEditable(false); await settle();
    expect(queryByRole(document.body, 'listbox')).toBeNull(); expect(root().hasAttribute('aria-activedescendant')).toBe(false);
    expect(service.getSerializedContent()).toBe('/la');
  });
  it('removes all menu-owned ARIA when unmounted without changing the editor source', async () => {
    await createComponent(); const input = root(); wrapper.destroy(); wrapper = null;
    expect(input.hasAttribute('aria-controls')).toBe(false); expect(service.getSerializedContent()).toBe('/la');
  });
});
