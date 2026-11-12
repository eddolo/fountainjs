import { fireEvent, getByRole, queryByRole, waitFor } from '@testing-library/dom';
import { mountExtended } from 'helpers/vue_test_utils_helper';
import waitForPromises from 'helpers/wait_for_promises';
import { GitLabContentEditor, NodeSelection, undo, redo } from '~/content_editor/services/fountain_runtime';
import FountainMediaMenu from '~/content_editor/components/fountain_media_menu.vue';

describe('FountainMediaMenu', () => {
  let wrapper;
  let service;
  let renderMarkdown;
  const source = '![Selected image](/figure.png "Image title")';
  const html = '<p><a class="no-attachment-icon" href="/resolved/figure.png" data-canonical-src="/figure.png"><img src="/resolved/figure.png" data-canonical-src="/figure.png" alt="Selected image" title="Image title"></a></p>';
  const settle = async () => { await waitForPromises(); await waitForPromises(); };
  const button = name => getByRole(wrapper.element, 'button', { name });
  const dialog = () => getByRole(document.body, 'dialog', { name: 'Media properties' });
  const field = name => getByRole(dialog(), 'textbox', { name });
  const input = (name, value) => fireEvent.input(field(name), { target: { value } });
  async function createComponent(editable = true, allowUpload = false) {
    renderMarkdown = jest.fn(() => Promise.resolve({ body: html }));
    service = new GitLabContentEditor({ renderMarkdown, describeLabels: () => '', editable });
    await service.setSerializedContent(source);
    service.editor.dispatch(service.editor.createTransaction().setSelection(new NodeSelection(service.editor.state.doc, [0, 0])));
    wrapper = mountExtended(FountainMediaMenu, { propsData: { contentEditor: service, disabled: !editable, allowUpload }, attachTo: document.body, stubs: { transition: false } });
    await settle();
  }
  const open = async () => { fireEvent.click(button('Edit media properties')); await settle(); };
  afterEach(async () => {
    wrapper?.destroy(); service?.dispose(); await settle();
    await waitFor(() => {
      if (queryByRole(document.body, 'dialog', { name: 'Media properties' })) throw new Error('Media properties portal survived teardown');
    });
  });
  it('prefills source/description/title/dimensions and previews the resolved image', async () => {
    await createComponent(); await open();
    expect(field('Media URL').value).toBe('/figure.png'); expect(field('Media description').value).toBe('Selected image');
    expect(field('Media title').value).toBe('Image title'); expect(field('Media width').value).toBe('auto');
    expect(getByRole(dialog(), 'img', { name: 'Selected image' }).getAttribute('src')).toBe('/resolved/figure.png');
  });
  it('applies description, title and dimensions with native one-step undo/redo', async () => {
    await createComponent(); await open(); input('Media description', 'Reviewed figure'); input('Media width', '320'); input('Media height', '180');
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply media changes' })); await settle();
    expect(service.getSerializedContent()).toBe('![Reviewed figure](/figure.png "Image title"){width="320" height="180"}');
    expect(undo(service.editor)).toBe(true); expect(service.getSerializedContent()).toBe(source);
    expect(redo(service.editor)).toBe(true); expect(service.getSerializedContent()).toContain('Reviewed figure');
  });
  it('contains native form submission instead of submitting the owning issue', async () => {
    await createComponent(); await open(); const submitted = jest.fn(); document.body.addEventListener('submit', submitted);
    try { input('Media description', 'Reviewed'); fireEvent.submit(field('Media URL').closest('form')); await settle();
      expect(submitted).not.toHaveBeenCalled(); expect(service.getSerializedContent()).toContain('Reviewed');
    } finally { document.body.removeEventListener('submit', submitted); }
  });
  it('retains an invalid dimension draft and allows correction', async () => {
    await createComponent(); await open(); input('Media width', 'two em');
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply media changes' })); await settle();
    expect(getByRole(dialog(), 'alert').textContent).toContain('pixel size'); expect(field('Media width').value).toBe('two em');
    expect(service.getSerializedContent()).toBe(source); input('Media width', '50%');
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply media changes' })); await settle();
    expect(service.getSerializedContent()).toContain('{width="50%"}');
  });
  it('retains failed URL and description drafts across a renderer rejection and retry', async () => {
    await createComponent(); await open(); input('Media URL', '/replacement.png'); input('Media description', 'Retained draft');
    renderMarkdown.mockRejectedValueOnce(new Error('Offline'));
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply media changes' })); await settle();
    expect(getByRole(dialog(), 'alert').textContent).toContain('draft and document are retained');
    expect(field('Media URL').value).toBe('/replacement.png'); expect(field('Media description').value).toBe('Retained draft');
    expect(service.getSerializedContent()).toBe(source);
    renderMarkdown.mockResolvedValueOnce({ body: html.replaceAll('figure.png', 'replacement.png').replaceAll('Selected image', 'Retained draft') });
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply media changes' })); await settle();
    expect(service.getSerializedContent()).toBe('![Retained draft](/replacement.png "Image title")');
  });
  it('cancels pending URL resolution without applying a late result', async () => {
    await createComponent(); await open(); let finish;
    renderMarkdown.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); input('Media URL', '/replacement.png');
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply media changes' })); await settle();
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Cancel media edit' })); await settle();
    expect(renderMarkdown.mock.calls[1][1].signal.aborted).toBe(true);
    finish({ body: html }); await settle(); expect(service.getSerializedContent()).toBe(source); expect(undo(service.editor)).toBe(false);
  });
  it('retains a draft and refuses Apply when the captured media changes', async () => {
    await createComponent(); await open(); input('Media description', 'My draft');
    service.editor.dispatch(service.editor.createTransaction().setNodeAttrs([0, 0], { ...service.editor.state.doc.child(0).child(0).attrs, alt: 'Another edit' })); await settle();
    expect(getByRole(dialog(), 'alert').textContent).toContain('selected media changed'); expect(field('Media description').value).toBe('My draft');
    expect(getByRole(dialog(), 'button', { name: 'Apply media changes' }).getAttribute('aria-disabled')).toBe('true');
  });
  it('deletes the selected atom and restores it with undo', async () => {
    await createComponent(); fireEvent.click(button('Delete media')); await settle();
    expect(service.editor.state.doc.child(0).child(0).isText).toBe(true); expect(undo(service.editor)).toBe(true);
    expect(service.getSerializedContent()).toBe(source);
  });
  it('keeps read-only opening/copy available while mutations are disabled', async () => {
    await createComponent(false); expect(button('Edit media properties').getAttribute('aria-disabled')).toBe('true');
    expect(button('Delete media').getAttribute('aria-disabled')).toBe('true');
    expect(getByRole(wrapper.element, 'link', { name: 'Open media' }).getAttribute('href')).toBe('/resolved/figure.png');
    expect(button('Copy media URL').getAttribute('aria-disabled')).not.toBe('true');
  });
  it('shows a preview-load failure without discarding the properties or document', async () => {
    await createComponent(); await open(); fireEvent.error(getByRole(dialog(), 'img', { name: 'Selected image' })); await settle();
    expect(getByRole(dialog(), 'status').textContent).toContain('preview could not load');
    expect(field('Media URL').value).toBe('/figure.png'); expect(service.getSerializedContent()).toBe(source);
  });
  it('owns teardown of an open asynchronous property session', async () => {
    await createComponent(); await open(); let finish;
    renderMarkdown.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); input('Media URL', '/replacement.png');
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply media changes' })); await settle();
    wrapper.destroy(); wrapper = null; expect(renderMarkdown.mock.calls[1][1].signal.aborted).toBe(true);
    finish({ body: html }); await settle(); expect(service.getSerializedContent()).toBe(source);
  });
});
