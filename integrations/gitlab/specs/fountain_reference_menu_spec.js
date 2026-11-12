import { fireEvent, getByRole, queryByRole } from '@testing-library/dom';
import { mountExtended } from 'helpers/vue_test_utils_helper';
import waitForPromises from 'helpers/wait_for_promises';
import { copyToClipboard } from '~/lib/utils/copy_to_clipboard';
import { GitLabContentEditor, NodeSelection, Selection, insertText, undo } from '~/content_editor/services/fountain_runtime';
import FountainReferenceMenu from '~/content_editor/components/fountain_reference_menu.vue';
import data from '../fixtures/fountain_reference_live_html.json';

// Clipboard permissions are exercised separately by the real browser journey.
jest.mock('~/lib/utils/copy_to_clipboard', () => ({ copyToClipboard: jest.fn().mockResolvedValue() }));
const fixture = name => data.fixtures.find(item => item.name === name);
describe('FountainReferenceMenu', () => {
  let wrapper;
  let service;
  let render;
  const button = name => getByRole(wrapper.element, 'button', { name });
  const field = () => getByRole(wrapper.element, 'combobox', { name: 'Reference display' });
  const settle = async () => { await waitForPromises(); await waitForPromises(); };
  const selectReference = () => service.editor.state.doc.descendants((node, path) => {
    if (node.type.name === 'gitlab_reference') service.editor.dispatch(service.editor.createTransaction().setSelection(new NodeSelection(service.editor.state.doc, path)));
  });
  async function createComponent({ name = 'issue-id', editable = true, resolve } = {}) {
    const { source } = fixture(name);
    render = jest.fn(markdown => {
      if (markdown !== source && resolve) return resolve(markdown);
      const result = data.fixtures.find(item => item.source === markdown);
      if (!result) throw new Error('Unexpected fixture request');
      return Promise.resolve({ body: result.body });
    });
    service = new GitLabContentEditor({ editable, describeLabels: () => '', renderMarkdown: render });
    await service.setSerializedContent(source); selectReference();
    wrapper = mountExtended(FountainReferenceMenu, { propsData: { contentEditor: service, disabled: !editable }, attachTo: document.body });
    await settle();
  }
  const choose = async value => { field().focus(); fireEvent.change(field(), { target: { value } }); await settle(); };
  const disabled = name => button(name).disabled || button(name).getAttribute('aria-disabled') === 'true';
  afterEach(() => { wrapper?.destroy(); service?.dispose(); jest.clearAllMocks(); });

  it.each([['title', 'issue-+'], ['summary', 'issue-+s']])('applies the %s choice and retains the actual source token', async (format, target) => {
    await createComponent(); await choose(format); fireEvent.click(button('Apply reference display')); await settle();
    expect(service.getSerializedContent()).toBe(fixture(target).source);
    expect(getByRole(wrapper.element, 'link', { name: 'Open reference' }).getAttribute('href')).toContain('/-/work_items/');
    expect(undo(service.editor)).toBe(true); expect(service.getSerializedContent()).toBe(fixture('issue-id').source);
  });
  it('changes a summary back to its ID', async () => {
    await createComponent({ name: 'issue-+s' }); expect(field().value).toBe('summary');
    await choose('id'); fireEvent.submit(field().form); await settle();
    expect(service.getSerializedContent()).toBe(fixture('issue-id').source);
  });
  it('supports merge-request display choices', async () => {
    await createComponent({ name: 'merge-request-id' }); await choose('summary'); fireEvent.submit(field().form); await settle();
    expect(service.getSerializedContent()).toBe(fixture('merge-request-+s').source);
  });
  it.each(['user', 'label'])('shows navigation/copy/removal without invented formatting for %s', async name => {
    await createComponent({ name }); expect(queryByRole(wrapper.element, 'combobox')).toBeNull();
    fireEvent.click(button('Copy reference URL')); await settle();
    expect(copyToClipboard).toHaveBeenCalledWith(new URL(service.editor.state.doc.child(0).child(0).attrs.href, window.location.href).href, expect.any(HTMLElement));
    fireEvent.click(button('Remove reference')); await settle();
    expect(service.editor.state.doc.textContent).toBe('');
  });
  it('keeps read-only navigation/copy available and disables mutations', async () => {
    await createComponent({ editable: false }); expect(field().disabled).toBe(true);
    expect(disabled('Apply reference display')).toBe(true); expect(disabled('Remove reference')).toBe(true);
    fireEvent.click(button('Copy reference URL')); await settle(); expect(copyToClipboard).toHaveBeenCalledTimes(1);
    expect(service.getSerializedContent()).toBe(fixture('issue-id').source);
  });
  it('removes only the reference from surrounding text', async () => {
    await createComponent({ name: 'mixed' }); fireEvent.click(button('Remove reference')); await settle();
    expect(service.editor.state.doc.textContent).toBe('Before  after.');
    expect(undo(service.editor)).toBe(true); expect(service.getSerializedContent()).toBe(fixture('mixed').source);
  });
  it('retains a failed choice and retries it', async () => {
    let failed = true;
    await createComponent({ resolve: () => { if (failed) throw new Error('Offline'); return Promise.resolve({ body: fixture('issue-+').body }); } });
    await choose('title'); fireEvent.click(button('Apply reference display')); await settle();
    expect(getByRole(wrapper.element, 'alert').textContent).toContain('display choice are retained');
    expect(field().value).toBe('title'); expect(service.getSerializedContent()).toBe(fixture('issue-id').source);
    failed = false; fireEvent.click(button('Apply reference display')); await settle();
    expect(service.getSerializedContent()).toBe(fixture('issue-+').source);
  });
  it('keeps a pending draft visible after selection moves and does not steal external focus on completion', async () => {
    let complete;
    await createComponent({ name: 'mixed', resolve: () => new Promise(resolve => { complete = resolve; }) });
    await choose('title'); fireEvent.click(button('Apply reference display')); await settle();
    expect(getByRole(wrapper.element, 'status', { name: 'Reference resolution' }).textContent).toContain('Resolving reference');
    service.editor.dispatch(service.editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    insertText(service.editor, 'Other edit. '); const cursor = service.editor.state.selection;
    const input = document.createElement('input'); document.body.append(input); input.focus();
    const focusEvents = wrapper.emitted('focus')?.length || 0;
    complete({ body: fixture('issue-+').body }); await settle();
    expect(document.activeElement).toBe(input); expect(wrapper.emitted('focus')?.length || 0).toBe(focusEvents);
    expect(service.editor.state.selection).toEqual(cursor); input.remove();
  });
  it('Escape cancels a pending request and a late response cannot apply', async () => {
    let complete;
    await createComponent({ resolve: () => new Promise(resolve => { complete = resolve; }) });
    await choose('title'); fireEvent.click(button('Apply reference display')); await settle();
    fireEvent.keyDown(button('Cancel reference edit'), { key: 'Escape' }); await settle();
    complete({ body: fixture('issue-+').body }); await settle();
    expect(service.getSerializedContent()).toBe(fixture('issue-id').source);
    expect(queryByRole(wrapper.element, 'button', { name: 'Cancel reference edit' })).toBeNull();
  });
  it('retains an owned display draft after a conflicting reference update', async () => {
    await createComponent(); await choose('title');
    service.editor.dispatch(service.editor.createTransaction().setNodeAttrs([0, 0], { label: 'Updated elsewhere' })); await settle();
    expect(getByRole(wrapper.element, 'alert').textContent).toContain('reference changed'); expect(field().value).toBe('title');
    expect(disabled('Apply reference display')).toBe(true);
    fireEvent.click(button('Cancel reference edit')); await settle(); expect(field().value).toBe('id');
  });
  it('teardown aborts a pending update', async () => {
    let complete;
    await createComponent({ resolve: () => new Promise(resolve => { complete = resolve; }) });
    await choose('title'); fireEvent.click(button('Apply reference display')); await settle();
    const before = service.editor.state.doc; wrapper.destroy(); complete({ body: fixture('issue-+').body }); await settle();
    expect(service.editor.state.doc).toBe(before); expect(service.pendingInsertions).toBe(0);
  });
});
