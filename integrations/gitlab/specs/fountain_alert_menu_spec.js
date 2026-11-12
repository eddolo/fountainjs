import { fireEvent, getByRole, queryByRole } from '@testing-library/dom';
import { mountExtended } from 'helpers/vue_test_utils_helper';
import waitForPromises from 'helpers/wait_for_promises';
import { GitLabContentEditor, Selection, undo, redo } from '~/content_editor/services/fountain_runtime';
import FountainAlertMenu from '~/content_editor/components/fountain_alert_menu.vue';

describe('FountainAlertMenu', () => {
  let wrapper;
  let service;
  const source = '> [!note]\n>\n> Keep the rollback ready.';
  const settle = async () => { await waitForPromises(); await waitForPromises(); };
  const button = name => getByRole(wrapper.element, 'button', { name });
  const select = () => getByRole(wrapper.element, 'combobox', { name: 'Alert type' });
  async function createComponent(editable = true) {
    service = new GitLabContentEditor({ editable, describeLabels: () => '', renderMarkdown: () => Promise.resolve({ body:
      '<div class="markdown-alert markdown-alert-note" data-sourcepos="1:1-3:26"><p class="markdown-alert-title">Note</p><p>Keep the rollback ready.</p></div>' }),
    });
    await service.setSerializedContent(source);
    service.editor.dispatch(service.editor.createTransaction().setSelection(Selection.cursor([0, 1, 0], 3)));
    wrapper = mountExtended(FountainAlertMenu, { propsData: { contentEditor: service, disabled: !editable }, attachTo: document.body });
    await settle();
  }
  afterEach(() => { wrapper?.destroy(); service?.dispose(); });
  it.each(['tip', 'important', 'warning', 'caution'])('changes to %s with generated title and one-step undo/redo', async kind => {
    await createComponent();
    fireEvent.change(select(), { target: { value: kind } }); await settle();
    expect(select().value).toBe(kind);
    expect(service.getSerializedContent()).toContain(`[!${kind}]`);
    expect(service.editor.state.doc.child(0).child(0).textContent).toBe('');
    expect(undo(service.editor)).toBe(true); await settle(); expect(select().value).toBe('note');
    expect(redo(service.editor)).toBe(true); await settle(); expect(select().value).toBe(kind);
    expect(wrapper.emitted('focus')).toHaveLength(1);
  });
  it('inserts another alert and lands in its editable body', async () => {
    await createComponent(); fireEvent.click(button('Insert alert')); await settle();
    expect(service.editor.state.selection.path).toEqual([1, 1, 0]);
    expect(service.editor.state.doc.child(1).type.name).toBe('gitlab_alert');
    expect(undo(service.editor)).toBe(true); expect(service.getSerializedContent()).toBe(source);
  });
  it('converts to text without deleting the body and restores with undo', async () => {
    await createComponent(); fireEvent.click(button('Convert alert to text')); await settle();
    expect(service.getSerializedContent()).toBe('Keep the rollback ready.');
    expect(queryByRole(wrapper.element, 'combobox', { name: 'Alert type' })).toBeNull();
    expect(undo(service.editor)).toBe(true); await settle(); expect(select().value).toBe('note');
  });
  it('deletes the whole alert and restores it through undo', async () => {
    await createComponent(); fireEvent.click(button('Delete alert')); await settle();
    expect(service.editor.state.doc.child(0).type.name).toBe('paragraph');
    expect(undo(service.editor)).toBe(true); await settle(); expect(service.getSerializedContent()).toBe(source);
  });
  it('resets the select when the service becomes read-only before the owning Vue prop updates', async () => {
    await createComponent(); service.setEditable(false);
    // The service may become unavailable before the owning Vue prop catches up.
    fireEvent.change(select(), { target: { value: 'warning' } }); await settle();
    expect(service.getSerializedContent()).toBe(source);
    expect(select().value).toBe('note');
  });
  it('restores the select and exposes an actual native rejection of an unrecognized kind', async () => {
    await createComponent(); fireEvent.change(select(), { target: { value: 'unknown' } }); await settle();
    expect(service.getSerializedContent()).toBe(source); expect(select().value).toBe('note');
    expect(wrapper.emitted('error')[0][0].message).toBe('GITLAB_ALERT_INVALID_KIND');
  });
  it('disables every mutation in read-only mode', async () => {
    await createComponent(false); expect(select().disabled).toBe(true);
    for (const name of ['Insert alert', 'Delete alert', 'Convert alert to text'])
      expect(button(name).disabled || button(name).getAttribute('aria-disabled') === 'true').toBe(true);
    expect(service.getSerializedContent()).toBe(source);
  });
  it('unsubscribes on teardown', async () => {
    await createComponent(); const release = jest.spyOn(wrapper.vm, 'releaseState'); wrapper.destroy();
    expect(release).toHaveBeenCalledTimes(1); wrapper = null;
  });
});
