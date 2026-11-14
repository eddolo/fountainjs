import AxiosMockAdapter from 'axios-mock-adapter';
import { fireEvent, getByRole, queryByRole } from '@testing-library/dom';
import { mountExtended } from 'helpers/vue_test_utils_helper';
import waitForPromises from 'helpers/wait_for_promises';
import axios from '~/lib/utils/axios_utils';
import { isCurrentViewWorkItem } from '~/work_items/utils';
import { currentAssignees, appliedLabels, linkedItems, availableStatuses, supportedConversionTypes } from '~/graphql_shared/issuable_client_state';
import { createGitLabAutocompleteProvider } from '~/content_editor/services/fountain_autocomplete';
import { Selection } from '~/content_editor/services/fountain_runtime';
import ContentEditor from '~/content_editor/components/content_editor.vue';
import fixture from '../fixtures/fountain_autocomplete_live.json';
import rendering from '../fixtures/fountain_reference_live_html.json';

jest.mock('~/work_items/utils', () => ({ isCurrentViewWorkItem: jest.fn() }));
jest.mock('~/graphql_shared/issuable_client_state', () => ({ currentAssignees: jest.fn(), appliedLabels: jest.fn(),
  linkedItems: jest.fn(), availableStatuses: jest.fn(), supportedConversionTypes: jest.fn() }));

describe('native reference provider and shared popup', () => {
  let mock;
  let wrapper;
  let host;
  let sources;
  let provider;
  let sidebar;
  const url = path => new URL(path, window.location.href).href;
  const settle = async () => { await waitForPromises(); jest.runOnlyPendingTimers(); await waitForPromises();
    jest.runOnlyPendingTimers(); await waitForPromises(); };
  const request = (kind, extras = {}) => provider({ kind, query: '', command: '', prioritizeUsernames: [], signal: new AbortController().signal, ...extras });
  beforeEach(() => {
    mock = new AxiosMockAdapter(axios); isCurrentViewWorkItem.mockReturnValue(false);
    for (const variable of [currentAssignees, appliedLabels, linkedItems, availableStatuses, supportedConversionTypes]) variable.mockReturnValue({});
    host = document.createElement('section'); host.className = 'js-gfm-wrapper';
    Object.assign(host.dataset, { workItemId: 'gid://gitlab/WorkItem/192', workItemFullPath: fixture.project.fullPath, workItemIid: '128', workItemTypeId: '1' });
    document.body.append(host);
    sources = { members: '/members', issues: '/issues', labels: '/labels', milestones: '/milestones' };
    sidebar = { store: { assignees: [], reviewers: [] } };
    provider = createGitLabAutocompleteProvider({ getSources: () => sources, getRoot: () => host, getSidebar: () => sidebar });
    mock.onGet(url('/members')).reply(200, fixture.results.members.data);
    mock.onGet(url('/issues')).reply(200, fixture.results.issues.data);
    mock.onGet(url('/labels')).reply(200, fixture.results.labels.data);
    mock.onGet(url('/milestones')).reply(200, fixture.results.milestones.data);
  });
  afterEach(async () => { wrapper?.destroy(); await settle(); host.remove(); mock.restore(); jest.restoreAllMocks(); });

  it('uses the supplied endpoint, native cancellation signal and actual backend search', async () => {
    expect(await request('user', { query: 'root' })).toEqual([expect.objectContaining({ source: '@root' })]);
    expect(mock.history.get[0]).toMatchObject({ url: url('/members'), params: { search: 'root' } });
    expect(mock.history.get[0].signal).toBeInstanceOf(AbortSignal);
  });
  it.each(['https://other.example/labels', '/labels#fragment', 'https://user:pass@other.example/labels', ''])
  ('refuses unavailable or nonlocal provider endpoints %s #security', async labels => {
    sources = { labels }; await expect(request('label')).rejects.toThrow(); expect(mock.history.get).toHaveLength(0);
  });
  it('does not convert a failed response into a successful empty list', async () => {
    mock.onGet(url('/labels')).reply(503); await expect(request('label')).rejects.toThrow();
    mock.onGet(url('/labels')).reply(200, []); expect(await request('label')).toEqual([]);
  });
  it('rejects malformed records before caching and accepts a repaired response', async () => {
    mock.onGet(url('/labels')).reply(200, [{ title: 'bad\nlabel' }]); await expect(request('label')).rejects.toThrow('RESPONSE_INVALID');
    mock.onGet(url('/labels')).reply(200, fixture.results.labels.data); expect(await request('label')).toHaveLength(2);
    expect(mock.history.get).toHaveLength(2);
  });
  it('shares bounded URL data while applying current command filters each time', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    expect(await request('label', { command: '/label' })).toEqual([expect.objectContaining({ label: 'Fountain reference & review' })]);
    expect(await request('label', { command: '/remove_label' })).toEqual([expect.objectContaining({ label: 'Fountain quick action & review' })]);
    expect(mock.history.get).toHaveLength(1);
    now.mockReturnValue(11001); await request('label'); expect(mock.history.get).toHaveLength(2);
  });
  it('uses live work-item assignments and labels without requesting unrelated network data', async () => {
    isCurrentViewWorkItem.mockReturnValue(true);
    currentAssignees.mockReturnValue({ [host.dataset.workItemId]: fixture.results.members.data });
    appliedLabels.mockReturnValue({ [host.dataset.workItemId]: [fixture.results.labels.data[0]] });
    expect(await request('user', { command: '/unassign' })).toEqual([expect.objectContaining({ source: '@root' })]);
    expect(await request('label', { command: '/unlabel' })).toHaveLength(1); expect(mock.history.get).toHaveLength(0);
    expect(await request('user', { command: '/assign' })).toEqual([]); expect(mock.history.get).toHaveLength(1);
    currentAssignees.mockReturnValue({ [host.dataset.workItemId]: [] });
    expect(await request('user', { command: '/unassign' })).toEqual([]); expect(mock.history.get).toHaveLength(1);
  });
  it('uses linked items and local status/type options from the actual host cache boundary', async () => {
    isCurrentViewWorkItem.mockReturnValue(true);
    linkedItems.mockReturnValue({ [`${fixture.project.fullPath}:128`]: [{ iid: '75', title: 'Linked issue', reference: '#75' }] });
    availableStatuses.mockReturnValue({ [fixture.project.fullPath]: { 1: [{ name: 'In progress' }] } });
    supportedConversionTypes.mockReturnValue({ [fixture.project.fullPath]: { 1: [{ name: 'Task' }] } });
    expect(await request('issue', { command: '/unlink' })).toEqual([expect.objectContaining({ source: '#75' })]);
    expect(await request('status', { command: '/status' })).toEqual([expect.objectContaining({ source: '"In progress"' })]);
    expect(await request('type', { command: '/type' })).toEqual([expect.objectContaining({ source: '"Task"' })]);
    expect(mock.history.get).toHaveLength(0);
  });
  it('refuses incomplete local work-item context instead of falling back to a different catalogue', async () => {
    isCurrentViewWorkItem.mockReturnValue(true); delete host.dataset.workItemId;
    await expect(request('user', { command: '/unassign' })).rejects.toThrow('CONTEXT_UNAVAILABLE');
    expect(mock.history.get).toHaveLength(0);
  });
  it('uses the non-work-item reviewer boundary', async () => {
    sidebar.store.reviewers = fixture.results.members.data;
    expect(await request('user', { command: '/assign_reviewer' })).toEqual([]);
    expect(await request('user', { command: '/unassign_reviewer' })).toHaveLength(1);
  });
  it('prioritizes structured mentions before truncating member results', async () => {
    const users = Array.from({ length: 12 }, (_, index) => ({ username: `person${index}`, name: `Person ${index}` }));
    mock.onGet(url('/members')).reply(200, users);
    const items = await request('user', { command: '/assign', prioritizeUsernames: ['person11'] });
    expect(items).toHaveLength(10); expect(items[0].source).toBe('@person11');
    expect(mock.history.get[0].params.mentioned).toEqual(['person11']);
  });
  it('orders upcoming milestones before undated and expired ones', async () => {
    mock.onGet(url('/milestones')).reply(200, [{ iid: 1, title: 'Expired', due_date: '2000-01-01' },
      { iid: 2, title: 'Undated', due_date: null }, { iid: 3, title: 'Upcoming', due_date: '2099-01-01' }]);
    expect((await request('milestone')).map(item => item.label)).toEqual(['Upcoming', 'Undated', 'Expired']);
  });

  const createComponent = async (props = {}) => {
    wrapper = mountExtended(ContentEditor, { propsData: { markdown: 'Start', markdownDocsPath: '/docs/markdown', uploadsPath: '',
      autocompleteDataSources: sources, ariaLabel: 'Autocomplete document', renderMarkdown: jest.fn(source => Promise.resolve({
        body: rendering.fixtures.find(item => item.source === source)?.body || '<p>Start</p>',
      })), ...props }, attachTo: host }); await settle();
  };
  const query = async text => {
    const { editor } = wrapper.vm.contentEditor;
    editor.dispatch(editor.createTransaction().replaceDocument(editor.state.schema.node('doc', {}, [editor.state.schema.node('paragraph', {}, [editor.state.schema.text(text)])]))
      .setMeta('content$replace', true).setSelection(Selection.cursor([0, 0], 0)));
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], text.length))); await settle();
  };
  it('inserts a real rendered reference through the shared popup and restores ARIA ownership', async () => {
    await createComponent(); await query('#7');
    const root = getByRole(wrapper.element, 'textbox', { name: 'Autocomplete document' });
    const list = getByRole(document.body, 'listbox', { name: 'Available references' });
    expect(root.getAttribute('aria-controls')).toBe(list.id);
    fireEvent.click(getByRole(list, 'option', { name: /#75.*Fountain reference controls/ })); await settle();
    expect(root.querySelector('[data-fountain-gitlab-reference="issue"]').textContent).toBe('#75');
    expect(queryByRole(document.body, 'listbox')).toBeNull(); expect(root.hasAttribute('aria-activedescendant')).toBe(false);
    expect(wrapper.emitted('change').at(-1)[0].markdown).toBe('#75&#32;');
  });
  it('offers retry after a transport failure while retaining the query', async () => {
    mock.onGet(url('/issues')).reply(503); await createComponent(); await query('#7');
    expect(document.body.textContent).toContain('References could not be loaded. Your text is retained.');
    mock.onGet(url('/issues')).reply(200, fixture.results.issues.data);
    const retry = getByRole(document.body, 'button', { name: 'Retry references' });
    retry.focus(); fireEvent.click(retry); await settle();
    expect(getByRole(document.body, 'option', { name: /#75.*Fountain reference controls/ })).toBeVisible();
    expect(document.activeElement).toBe(getByRole(wrapper.element, 'textbox', { name: 'Autocomplete document' }));
    expect(wrapper.vm.contentEditor.editor.getText()).toBe('#7');
  });
  it('returns focus after keyboard acceptance from the reference list', async () => {
    await createComponent(); await query('#7');
    const list = getByRole(document.body, 'listbox', { name: 'Available references' });
    list.focus(); fireEvent.keyDown(list, { key: 'Enter', code: 'Enter' }); await settle();
    expect(queryByRole(document.body, 'listbox')).toBeNull();
    expect(document.activeElement).toBe(getByRole(wrapper.element, 'textbox', { name: 'Autocomplete document' }));
    expect(wrapper.vm.contentEditor.getSerializedContent()).toBe('#75&#32;');
  });
  it('hands a returned command to argument autocomplete with one list and one ARIA owner', async () => {
    sources.commands = '/commands'; mock.onGet(url('/commands')).reply(200, fixture.commands);
    await createComponent({ supportsQuickActions: true }); await query('/la');
    fireEvent.click(getByRole(document.body, 'option', { name: /\/label.*Add labels/ })); await settle();
    const list = getByRole(document.body, 'listbox', { name: 'Available references' });
    const root = getByRole(wrapper.element, 'textbox', { name: 'Autocomplete document' });
    expect(document.querySelectorAll('[role="listbox"]')).toHaveLength(1);
    expect(root.getAttribute('aria-controls')).toBe(list.id);
    fireEvent.click(getByRole(list, 'option', { name: 'Fountain reference & review' })); await settle();
    expect(root.querySelector('[data-fountain-gitlab-reference="label"]').textContent).toBe('Fountain reference & review');
    expect(wrapper.vm.contentEditor.getSerializedContent()).toBe('/label ~"Fountain reference & review" ');
  });
  it('does not request references in a read-only editor', async () => {
    await createComponent({ editable: false }); await query('#7');
    expect(queryByRole(document.body, 'listbox')).toBeNull(); expect(mock.history.get).toHaveLength(0);
  });
  it('does not fetch or show reference controls when autocomplete is disabled', async () => {
    await createComponent({ enableAutocomplete: false }); await query('#7');
    expect(queryByRole(document.body, 'listbox')).toBeNull(); expect(mock.history.get).toHaveLength(0);
  });
});
