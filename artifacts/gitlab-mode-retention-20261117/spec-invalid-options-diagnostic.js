import MockAdapter from 'axios-mock-adapter';
import { nextTick } from 'vue';
import axios from '~/lib/utils/axios_utils';
import { mountExtended } from 'helpers/vue_test_utils_helper';
import { useLocalStorageSpy } from 'helpers/local_storage_helper';
import waitForPromises from 'helpers/wait_for_promises';
import MarkdownEditor from '~/vue_shared/components/markdown/markdown_editor.vue';
import MarkdownField from '~/vue_shared/components/markdown/field.vue';
import ContentEditor from '~/content_editor/components/content_editor.vue';
import FountainEditorSurface from '~/content_editor/components/fountain_editor_surface.vue';
import markdownEditorEventHub from '~/vue_shared/components/markdown/eventhub';
import { CONTENT_EDITOR_PASTE } from '~/vue_shared/constants';
import { undo, redo } from '~/content_editor/services/fountain_runtime';

jest.mock('~/emoji');
jest.mock('autosize');
jest.mock('~/lib/graphql');

describe('native MarkdownEditor mode ownership', () => {
  useLocalStorageSpy();
  let wrapper;
  let mock;
  const endpoint = '/project/preview_markdown?target_id=1';
  const field = () => wrapper.findComponent(MarkdownField);
  const rich = () => wrapper.findComponent(ContentEditor);
  const textarea = () => wrapper.find('textarea[name="description"]');
  const root = () => wrapper.find('.fountain-editor');
  const settle = async () => {
    await waitForPromises();
    await nextTick();
  };
  const openRich = async () => {
    window.gon.text_editor = 'rich_text_editor';
    field().vm.$emit('enable-content-editor');
    await settle();
  };
  const openSource = async () => {
    window.gon.text_editor = 'plain_text_editor';
    rich().vm.$emit('enable-markdown-editor');
    await settle();
  };
  const create = () => {
    wrapper = mountExtended(MarkdownEditor, {
      attachTo: document.body,
      propsData: {
        value: 'Initial source.',
        renderMarkdownPath: endpoint,
        markdownDocsPath: '/help/markdown',
        formFieldProps: { id: 'description', name: 'description', 'aria-label': 'Description' },
      },
      stubs: {
        MarkdownField,
        ContentEditor,
        FountainEditorSurface,
        FountainFormattingToolbar: true,
      },
    });
  };
  const edit = async (text) => {
    const { editor } = rich().vm.contentEditor;
    const { schema } = editor.state;
    editor.dispatch(
      editor
        .createTransaction()
        .replaceDocument(
          schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text(text)])]),
        ),
    );
    await settle();
  };
  beforeEach(() => {
    window.gon = { text_editor: 'plain_text_editor' };
    window.uploads_path = '/project/uploads';
    mock = new MockAdapter(axios);
    mock.onPost().reply((config) => {
      const rendered = {
        'Initial source.': '<p>Initial source.</p>',
        'Pending review.': '<p>Pending review.</p>',
        'Unreported edit.': '<p>Unreported edit.</p>',
        'First document.': '<p>First document.</p>',
      }[JSON.parse(config.data).text];
      return rendered ? [200, { body: rendered }] : [422, {}];
    });
    create();
  });
  afterEach(() => {
    mock.restore();
    localStorage.clear();
  });

  it('returns unchanged pending source to the owned rich model without a renderer request', async () => {
    await openRich();
    await edit('Pending review.');
    await openSource();
    expect(textarea().element.value).toBe('Pending review.');
    mock.onPost().reply(403, {});
    await openRich();
    expect(mock.history.post).toHaveLength(1);
    expect(root().text()).toBe('Pending review.');
    expect(wrapper.findByTestId('content-editor-error').exists()).toBe(false);
  });
  it('keeps exactly one successful form control while source mode is active', async () => {
    await openRich();
    await openSource();
    expect(wrapper.findAll('[name="description"]')).toHaveLength(1);
    expect(textarea().exists()).toBe(true);
  });
  it('ignores rich paste events while the retained view is inactive', async () => {
    await openRich();
    await edit('Pending review.');
    await openSource();
    markdownEditorEventHub.$emit(CONTENT_EDITOR_PASTE, 'Hidden paste.');
    await settle();
    expect(mock.history.post).toHaveLength(1);
    expect(textarea().element.value).toBe('Pending review.');
    await openRich();
    expect(root().text()).toBe('Pending review.');
  });
  it('uses the real renderer for changed source', async () => {
    await openRich();
    await openSource();
    await textarea().setValue('Changed source.');
    mock.onPost().reply(200, { body: '<p>Changed source.</p>' });
    await openRich();
    expect(mock.history.post).toHaveLength(2);
    expect(JSON.parse(mock.history.post[1].data).text).toBe('Changed source.');
    expect(root().text()).toBe('Changed source.');
  });
  it('retains both the old model and changed source if new conversion is denied', async () => {
    await openRich();
    await edit('Pending review.');
    await openSource();
    await textarea().setValue('Changed source.');
    mock.onPost().reply(403, {});
    await openRich();
    expect(mock.history.post).toHaveLength(2);
    expect(root().text()).toBe('Pending review.');
    expect(wrapper.find('textarea[aria-label="Retained document Markdown"]').element.value).toBe(
      'Changed source.',
    );
  });
  it('does not replay an old model under a different document renderer', async () => {
    await openRich();
    await edit('First document.');
    await openSource();
    await wrapper.setProps({ renderMarkdownPath: '/project/preview_markdown?target_id=2' });
    mock.onPost().reply(200, { body: '<p>Second document.</p>' });
    await openRich();
    expect(mock.history.post).toHaveLength(2);
    expect(mock.history.post[1].url).toContain('target_id=2');
    expect(root().text()).toBe('Second document.');
  });
  it('retains native undo and redo across unchanged source mode', async () => {
    await openRich();
    await edit('Pending review.');
    await openSource();
    await openRich();
    expect(undo(rich().vm.contentEditor.editor)).toBe(true);
    await settle();
    expect(root().text()).toBe('Initial source.');
    expect(redo(rich().vm.contentEditor.editor)).toBe(true);
    await settle();
    expect(root().text()).toBe('Pending review.');
    expect(mock.history.post).toHaveLength(1);
  });
  it('does not destroy an active model when a capability prop changes', async () => {
    await openRich();
    await edit('Pending review.');
    mock.onPost().reply(403, {});
    await wrapper.setProps({ supportsQuickActions: true });
    await settle();
    expect(mock.history.post).toHaveLength(1);
    expect(root().text()).toBe('Pending review.');
  });
  it('revalidates a changed capability profile on the next mode entry', async () => {
    await openRich();
    await openSource();
    await wrapper.setProps({ supportsQuickActions: true });
    mock.onPost().reply(200, { body: '<p>New profile.</p>' });
    await openRich();
    expect(mock.history.post).toHaveLength(2);
    expect(mock.history.post[1].url).toContain('render_quick_actions=true');
    expect(root().text()).toBe('New profile.');
  });
  it('reuses the current owned model after a fresh unreported handoff', async () => {
    await openRich();
    const { editor } = rich().vm.contentEditor;
    const { schema } = editor.state;
    editor.dispatch(
      editor
        .createTransaction()
        .replaceDocument(
          schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Unreported edit.')])]),
        )
        .setMeta('preventUpdate', true),
    );
    await openSource();
    expect(textarea().element.value).toBe('Unreported edit.');
    mock.onPost().reply(403, {});
    await openRich();
    expect(mock.history.post).toHaveLength(1);
    expect(root().text()).toBe('Unreported edit.');
  });
  it('honors read-only changes across retained mode entry without reloading source', async () => {
    await openRich();
    await edit('Pending review.');
    await openSource();
    await wrapper.setProps({ disabled: true });
    await openRich();
    expect(root().element.contentEditable).toBe('false');
    expect(root().text()).toBe('Pending review.');
    await wrapper.setProps({ disabled: false });
    await settle();
    expect(root().element.contentEditable).toBe('true');
    expect(mock.history.post).toHaveLength(1);
  });
  it.each([{ collaborationProvider: {} }, { codeSuggestionsConfig: { unexpected: true } }])(
    'revalidates unsupported host configuration on retained entry: %j',
    async (props) => {
      await openRich();
      await edit('Pending review.');
      await openSource();
      await wrapper.setProps(props);
      await openRich();
      expect(wrapper.findByTestId('content-editor-error').exists()).toBe(true);
      expect(root().element.contentEditable).toBe('false');
      markdownEditorEventHub.$emit(CONTENT_EDITOR_PASTE, 'Hidden paste.');
      await settle();
      expect(mock.history.post).toHaveLength(1);
      expect(root().text()).toBe('Pending review.');
    },
  );
  it('keeps a single active paste subscription after repeated mode entries', async () => {
    await openRich();
    await openSource();
    await openRich();
    await openSource();
    await openRich();
    await openSource();
    await openRich();
    expect(mock.history.post).toHaveLength(1);
    mock.onPost().reply(200, { body: '<p>Pasted.</p>' });
    markdownEditorEventHub.$emit(CONTENT_EDITOR_PASTE, 'Pasted.');
    await settle();
    expect(mock.history.post).toHaveLength(2);
    expect(
      root()
        .text()
        .match(/Pasted\./g),
    ).toHaveLength(1);
  });
  it('does not reuse a model after its MarkdownEditor owner is destroyed', async () => {
    await openRich();
    await edit('Previous owner.');
    await openSource();
    wrapper.destroy();
    create();
    mock.onPost().reply(200, { body: '<p>New owner.</p>' });
    await openRich();
    expect(mock.history.post).toHaveLength(2);
    expect(root().text()).toBe('New owner.');
  });
});
