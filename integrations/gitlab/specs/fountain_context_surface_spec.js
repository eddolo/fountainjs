import { fireEvent, getByRole, queryByRole } from '@testing-library/dom';
import { markRaw } from 'vue';
import { mountExtended } from 'helpers/vue_test_utils_helper';
import waitForPromises from 'helpers/wait_for_promises';
import { copyToClipboard } from '~/lib/utils/copy_to_clipboard';
import { GitLabContentEditor, Selection, NodeSelection, undo } from '~/content_editor/services/fountain_runtime';
import CodeBlockBubbleMenu from '~/content_editor/components/bubble_menus/code_block_bubble_menu.vue';
import MediaBubbleMenu from '~/content_editor/components/bubble_menus/media_bubble_menu.vue';
import FountainEditorSurface from '~/content_editor/components/fountain_editor_surface.vue';
import mediaFixtures from '../fixtures/fountain_media_live_html.json';

// Only the OS clipboard is replaced; both menus use the real native editor/view.
jest.mock('~/lib/utils/copy_to_clipboard', () => ({ copyToClipboard: jest.fn().mockResolvedValue() }));

describe('native code/media contextual surfaces', () => {
  let wrapper;
  let service;
  let restoreWidth;
  const source = '```js\nconst first = 1;\n```\n\n```mermaid\ngraph LR\n  A-->B\n```';
  const body = '<pre data-language="js"><code>const first = 1;</code></pre><pre data-language="mermaid"><code>graph LR\n  A--&gt;B</code></pre>';
  const settle = async () => {
    await waitForPromises(); jest.runOnlyPendingTimers(); await waitForPromises();
    jest.runOnlyPendingTimers(); await waitForPromises();
  };
  const popup = label => getByRole(document.body, 'dialog', { name: label });
  const sourceDialog = () => getByRole(document.body, 'dialog', { name: 'Diagram source and preview' });
  const language = () => getByRole(popup('Code block actions'), 'combobox', { name: 'Code language' });
  async function createComponent({ kind = 'code', editable = true } = {}) {
    const fixture = mediaFixtures.fixtures.find(item => item.name === 'image');
    service = new GitLabContentEditor({ editable, describeLabels: () => '',
      renderMarkdown: () => Promise.resolve({ body: kind === 'media' ? fixture.body : body }) });
    await service.setSerializedContent(kind === 'media' ? fixture.source : source);
    const { editor } = service;
    editor.dispatch(editor.createTransaction().setSelection(kind === 'media'
      ? new NodeSelection(editor.state.doc, [0, 0]) : Selection.cursor([0, 0], 3)));
    wrapper = mountExtended({
      components: { CodeBlockBubbleMenu, MediaBubbleMenu, FountainEditorSurface },
      data() { return { owner: markRaw(service) }; },
      methods: {
        getRoot() { return this.$refs.surface?.getRootElement() || null; },
        ready() { this.$refs.menu.refreshRoot(); },
        reveal() { this.$refs.surface.focus(); },
      },
      template: `<main><button type="button">Other field</button>
        <code-block-bubble-menu v-if="${kind === 'code'}" ref="menu" :content-editor="owner" :get-editor-root="getRoot" :disabled="${!editable}" @focus="reveal" />
        <media-bubble-menu v-else ref="menu" :content-editor="owner" :get-editor-root="getRoot" :disabled="${!editable}" @focus="reveal" />
        <fountain-editor-surface ref="surface" :editor="owner.editor" :editable="${editable}" @ready="ready" />
      </main>`,
    }, { attachTo: document.body, stubs: { FountainDiagramPreview: true } });
    await settle();
    wrapper.findComponent(FountainEditorSurface).element.querySelector('[role="textbox"]').focus();
    await settle();
  }
  beforeEach(() => {
    const width = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    restoreWidth = () => Object.defineProperty(window, 'innerWidth', width);
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      x: 100, y: 250, left: 100, top: 250, right: 500, bottom: 410, width: 400, height: 160,
      toJSON: () => ({}),
    }));
  });
  afterEach(async () => { wrapper?.destroy(); service?.dispose(); await settle(); restoreWidth(); });

  it('mounts the original code-menu entry point with real native language, copy, deletion and undo behavior', async () => {
    await createComponent();
    expect(wrapper.findComponent(CodeBlockBubbleMenu).exists()).toBe(true);
    const trigger = getByRole(wrapper.element, 'button', { name: 'Code block actions' });
    expect(document.getElementById(trigger.getAttribute('aria-controls'))).toBe(popup('Code block actions'));
    expect(language().value).toBe('js');
    fireEvent.focus(language()); fireEvent.input(language(), { target: { value: 'python' } });
    fireEvent.click(getByRole(popup('Code block actions'), 'button', { name: 'Apply language' })); await settle();
    expect(service.getSerializedContent()).toContain('```python\nconst first = 1;');
    fireEvent.click(getByRole(popup('Code block actions'), 'button', { name: 'Copy code' })); await settle();
    expect(copyToClipboard).toHaveBeenCalledWith('const first = 1;', expect.any(HTMLElement));
    fireEvent.click(getByRole(popup('Code block actions'), 'button', { name: 'Delete code block' })); await settle();
    expect(service.getSerializedContent()).not.toContain('const first');
    expect(undo(service.editor)).toBe(true); expect(service.getSerializedContent()).toContain('const first');
  });
  it('retains one captured code owner while a language draft is open and the caret moves to another code block', async () => {
    await createComponent();
    fireEvent.focus(language()); fireEvent.input(language(), { target: { value: 'python' } });
    service.editor.dispatch(service.editor.createTransaction().setSelection(Selection.cursor([1, 0], 3)));
    await settle();
    expect(queryByRole(popup('Code block actions'), 'button', { name: 'Show diagram preview' })).toBeNull();
    fireEvent.click(getByRole(popup('Code block actions'), 'button', { name: 'Copy code' })); await settle();
    expect(copyToClipboard).toHaveBeenCalledWith('const first = 1;', expect.any(HTMLElement));
    fireEvent.click(getByRole(popup('Code block actions'), 'button', { name: 'Apply language' })); await settle();
    expect(service.editor.state.doc.child(0).attrs.language).toBe('python');
    expect(service.editor.state.doc.child(1).attrs.language).toBe('mermaid');
  });
  it('mounts the original media-menu entry point and applies native properties with undo', async () => {
    await createComponent({ kind: 'media' });
    expect(wrapper.findComponent(MediaBubbleMenu).exists()).toBe(true);
    fireEvent.click(getByRole(popup('Media actions'), 'button', { name: 'Edit media properties' })); await settle();
    expect(queryByRole(document.body, 'dialog', { name: 'Media actions' })).toBeNull();
    const dialog = getByRole(document.body, 'dialog', { name: 'Media properties' });
    fireEvent.input(getByRole(dialog, 'textbox', { name: 'Media description' }), { target: { value: 'Reviewed figure' } });
    fireEvent.click(getByRole(dialog, 'button', { name: 'Apply media changes' })); await settle();
    expect(service.getSerializedContent()).toContain('![Reviewed figure]');
    expect(undo(service.editor)).toBe(true);
    expect(service.getSerializedContent()).toBe(mediaFixtures.fixtures.find(item => item.name === 'image').source);
  });
  it('transfers a captured clean language session into source editing without taking the later diagram owner', async () => {
    await createComponent();
    fireEvent.focus(language()); fireEvent.input(language(), { target: { value: 'mermaid' } });
    fireEvent.click(getByRole(popup('Code block actions'), 'button', { name: 'Apply language' })); await settle();
    fireEvent.focus(language());
    service.editor.dispatch(service.editor.createTransaction().setSelection(Selection.cursor([1, 0], 3)));
    await settle();
    fireEvent.click(getByRole(popup('Code block actions'), 'button', { name: 'Edit diagram source' })); await settle();
    const field = getByRole(sourceDialog(), 'textbox', { name: 'Diagram source' });
    expect(field.value).toBe('const first = 1;');
    fireEvent.input(field, { target: { value: 'graph LR\n  Captured-->Owner' } });
    fireEvent.click(getByRole(sourceDialog(), 'button', { name: 'Apply diagram source' })); await settle();
    expect(service.editor.state.doc.child(0).textContent).toBe('graph LR\n  Captured-->Owner');
    expect(service.editor.state.doc.child(1).textContent).toBe('graph LR\n  A-->B');
    expect(undo(service.editor)).toBe(true);
    expect(service.editor.state.doc.child(0).textContent).toBe('const first = 1;');
  });
  it('supports keyboard access, Escape dismissal, focus restoration and reopening without mutating content', async () => {
    await createComponent();
    const editor = wrapper.findComponent(FountainEditorSurface).element.querySelector('[role="textbox"]');
    fireEvent.keyDown(editor, { key: 'F10', altKey: true }); await settle();
    expect(document.activeElement).toBe(language());
    fireEvent.click(getByRole(popup('Code block actions'), 'button', { name: 'Cancel language edit' })); await settle();
    const hostEscape = jest.fn();
    wrapper.element.addEventListener('keydown', hostEscape);
    fireEvent.keyDown(editor, { key: 'Escape' }); await settle();
    expect(hostEscape).not.toHaveBeenCalled();
    expect(queryByRole(document.body, 'dialog', { name: 'Code block actions' })).toBeNull();
    const trigger = getByRole(wrapper.element, 'button', { name: 'Code block actions' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger); await settle(); expect(document.activeElement).toBe(language());
    expect(service.getSerializedContent()).toBe(source);
  });
  it('hides the floating surface on external focus and keeps its draft available when reopened', async () => {
    await createComponent();
    fireEvent.focus(language()); fireEvent.input(language(), { target: { value: 'rust' } });
    getByRole(wrapper.element, 'button', { name: 'Other field' }).focus(); await settle();
    expect(queryByRole(document.body, 'dialog', { name: 'Code block actions' })).toBeNull();
    fireEvent.click(getByRole(wrapper.element, 'button', { name: 'Code block actions' })); await settle();
    expect(language().value).toBe('rust'); expect(service.getSerializedContent()).toBe(source);
  });
  it('docks on a narrow viewport while retaining an open source draft and its document', async () => {
    await createComponent();
    service.editor.dispatch(service.editor.createTransaction().setSelection(Selection.cursor([1, 0], 3))); await settle();
    fireEvent.click(getByRole(popup('Code block actions'), 'button', { name: 'Edit diagram source' })); await settle();
    const field = getByRole(sourceDialog(), 'textbox', { name: 'Diagram source' });
    fireEvent.input(field, { target: { value: 'graph LR\n  Retain-->Draft' } });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    fireEvent(window, new Event('resize')); await settle();
    expect(wrapper.findByTestId('native-context-surface').attributes('data-menu-mode')).toBe('docked');
    expect(getByRole(sourceDialog(), 'textbox', { name: 'Diagram source' }).value).toBe('graph LR\n  Retain-->Draft');
    expect(service.getSerializedContent()).toBe(source);
    fireEvent.click(getByRole(sourceDialog(), 'button', { name: 'Cancel source edit' })); await settle();
    expect(getByRole(wrapper.element, 'button', { name: 'Edit diagram source' })).toBeInstanceOf(HTMLElement);
  });
  it('keeps read-only code inspection available and refuses mutation actions', async () => {
    await createComponent({ editable: false });
    const apply = getByRole(popup('Code block actions'), 'button', { name: 'Apply language' });
    expect(apply.disabled || apply.getAttribute('aria-disabled') === 'true').toBe(true);
    fireEvent.click(apply); await settle(); expect(service.getSerializedContent()).toBe(source);
  });
  it('removes its floating surface and subscriptions when its owning view is destroyed', async () => {
    await createComponent();
    expect(popup('Code block actions')).toBeInstanceOf(HTMLElement);
    wrapper.destroy(); wrapper = null; await settle();
    expect(queryByRole(document.body, 'dialog', { name: 'Code block actions' })).toBeNull();
    service.editor.dispatch(service.editor.createTransaction().setSelection(Selection.cursor([1, 0], 0)));
    fireEvent(window, new Event('resize')); await settle();
    expect(queryByRole(document.body, 'dialog', { name: 'Code block actions' })).toBeNull();
  });
  it.each(['copy', 'cut', 'paste'])('keeps handled native %s data out of the host reader clipboard transformer', async type => {
    await createComponent();
    service.editor.dispatch(service.editor.createTransaction().setSelection(new NodeSelection(service.editor.state.doc, [0])));
    const root = wrapper.findComponent(FountainEditorSurface).element.querySelector('[role="textbox"]');
    const data = new Map(type === 'paste' ? [['text/html', '<p>Native paste</p>'], ['text/plain', 'Native paste']] : []);
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: key => data.get(key) || '',
      setData: (key, value) => data.set(key, value) } });
    const host = jest.fn(() => data.set('text/plain', 'Overwritten by the host reader'));
    document.addEventListener(type, host);
    try {
      root.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true); expect(host).not.toHaveBeenCalled();
      if (type === 'paste') expect(service.getSerializedContent()).toContain('Native paste');
      else {
        expect(data.get('text/plain')).toContain('const first = 1;');
        expect(data.get('application/x-fountainjs+json')).toBeTruthy();
      }
    } finally { document.removeEventListener(type, host); }
  });
  it('leaves unhandled read-only paste available to the host without changing the document', async () => {
    await createComponent({ editable: false });
    const root = wrapper.findComponent(FountainEditorSurface).element.querySelector('[role="textbox"]');
    const event = new Event('paste', { bubbles: true, cancelable: true }), host = jest.fn();
    document.addEventListener('paste', host);
    try { root.dispatchEvent(event); expect(event.defaultPrevented).toBe(false); expect(host).toHaveBeenCalledTimes(1);
      expect(service.getSerializedContent()).toBe(source);
    } finally { document.removeEventListener('paste', host); }
  });
});
