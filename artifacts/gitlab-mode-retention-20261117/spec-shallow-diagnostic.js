import MockAdapter from 'axios-mock-adapter';
import { nextTick } from 'vue';
import axios from '~/lib/utils/axios_utils';
import { shallowMountExtended } from 'helpers/vue_test_utils_helper';
import { useLocalStorageSpy } from 'helpers/local_storage_helper';
import waitForPromises from 'helpers/wait_for_promises';
import MarkdownEditor from '~/vue_shared/components/markdown/markdown_editor.vue';
import MarkdownField from '~/vue_shared/components/markdown/field.vue';
import ContentEditor from '~/content_editor/components/content_editor.vue';
import FountainEditorSurface from '~/content_editor/components/fountain_editor_surface.vue';
import markdownEditorEventHub from '~/vue_shared/components/markdown/eventhub';
import { CONTENT_EDITOR_PASTE } from '~/vue_shared/constants';

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
    wrapper = shallowMountExtended(MarkdownEditor, {
      attachTo: document.body,
      propsData: {
        value: 'Initial source.',
        renderMarkdownPath: endpoint,
        markdownDocsPath: '/help/markdown',
        formFieldProps: { id: 'description', name: 'description', 'aria-label': 'Description' },
      },
      stubs: { MarkdownField, ContentEditor, FountainEditorSurface },
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
    mock.onPost().reply(200, { body: '<p>Initial source.</p>' });
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
