import AxiosMockAdapter from 'axios-mock-adapter';
import { fireEvent, getByRole, queryByRole } from '@testing-library/dom';
import { mountExtended } from 'helpers/vue_test_utils_helper';
import waitForPromises from 'helpers/wait_for_promises';
import axios from '~/lib/utils/axios_utils';
import ContentEditor from '~/content_editor/components/content_editor.vue';
import FountainEditorSurface from '~/content_editor/components/fountain_editor_surface.vue';
import fixture from '../fixtures/fountain_quick_action_commands_live.json';

describe('native quick action host transport', () => {
  let wrapper;
  let mock;
  const endpoint = new URL('/commands', window.location.href).href;
  const settle = async () => {
    await waitForPromises(); jest.runOnlyPendingTimers(); await waitForPromises();
    jest.runOnlyPendingTimers(); await waitForPromises();
  };
  const createComponent = async (props = {}) => {
    wrapper = mountExtended(ContentEditor, { propsData: {
      markdown: 'Start', markdownDocsPath: '/docs/markdown', uploadsPath: '', supportsQuickActions: true,
      autocompleteDataSources: { commands: '/commands' },
      renderMarkdown: jest.fn().mockResolvedValue({ body: '<p>Start</p>' }), ...props,
    }, attachTo: document.body });
    await settle();
  };
  const open = async () => {
    fireEvent.click(getByRole(wrapper.element, 'button', { name: 'Add a quick action' })); await settle();
  };
  beforeEach(() => { mock = new AxiosMockAdapter(axios); mock.onGet(endpoint).reply(200, fixture.commands); });
  afterEach(async () => { wrapper?.destroy(); await settle(); mock.restore(); });

  it('loads only the host-provided endpoint and inserts a real returned command', async () => {
    await createComponent(); await open();
    expect(mock.history.get.map(request => request.url)).toEqual([endpoint]);
    expect(mock.history.get[0].signal).toBeInstanceOf(AbortSignal);
    fireEvent.click(getByRole(wrapper.element, 'option', { name: /\/label.*Add labels/ })); await settle();
    expect(wrapper.emitted('change').at(-1)[0].markdown).toBe('Start\n\n/label ');
  });
  it('keeps the insert control absent when the host disables quick actions', async () => {
    await createComponent({ supportsQuickActions: false });
    expect(queryByRole(wrapper.element, 'button', { name: 'Add a quick action' })).toBeNull();
    expect(mock.history.get).toHaveLength(0);
  });
  it.each(['https://unrelated.example/commands',
    // eslint-disable-next-line no-script-url -- Rejected URL fixture is never executed.
    'javascript:alert(1)', '/commands#fragment',
    'https://user:password@unrelated.example/commands', ''])('refuses an unsafe or unavailable endpoint %s #security', async commands => {
    await createComponent({ autocompleteDataSources: { commands } }); await open();
    expect(wrapper.text()).toContain('Available commands could not be loaded.');
    expect(mock.history.get).toHaveLength(0);
    expect(wrapper.emitted('change').at(-1)[0].markdown).toBe('Start\n\n/');
  });
  it('exposes unavailable transport as a retriable list error without discarding input', async () => {
    mock.onGet(endpoint).reply(503); await createComponent(); await open();
    expect(wrapper.text()).toContain('Available commands could not be loaded.');
    mock.onGet(endpoint).reply(200, fixture.commands);
    fireEvent.click(getByRole(wrapper.element, 'button', { name: 'Retry commands' })); await settle();
    expect(getByRole(wrapper.element, 'option', { name: /\/label.*Add labels/ })).toBeVisible();
  });
  it('rejects malformed server data', async () => {
    mock.onGet(endpoint).reply(200, [{ name: '<unsafe>', aliases: [], params: [], description: '' }]);
    await createComponent(); await open();
    expect(wrapper.text()).toContain('Available commands could not be loaded.');
    expect(queryByRole(getByRole(wrapper.element, 'listbox', { name: 'Available quick actions' }), 'option')).toBeNull();
  });
  it('does not offer mutation in a read-only host', async () => {
    await createComponent({ editable: false });
    const button = getByRole(wrapper.element, 'button', { name: 'Add a quick action' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button); await settle();
    expect(mock.history.get).toHaveLength(0);
    expect(wrapper.findComponent(FountainEditorSurface).props('editor').getText()).toBe('Start');
  });
});
