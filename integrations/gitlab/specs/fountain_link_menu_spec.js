import { getByRole, queryByRole, fireEvent, waitFor } from '@testing-library/dom';
import { GlPopover } from '@gitlab/ui';
import { mountExtended } from 'helpers/vue_test_utils_helper';
import waitForPromises from 'helpers/wait_for_promises';
import {
  GitLabContentEditor,
  EditorView,
  Selection,
  undo,
  redo,
  insertText,
} from '~/content_editor/services/fountain_runtime';
import FountainLinkMenu from '~/content_editor/components/fountain_link_menu.vue';

describe('FountainLinkMenu', () => {
  let wrapper;
  let service;
  let view;
  let mount;
  let renderMarkdown;
  const original = 'Before [one**two**](/canonical-old) after';
  const html =
    '<p>Before <a href="/resolved-old" data-canonical-src="/canonical-old">one<strong>two</strong></a> after</p>';
  const dialog = () => getByRole(document.body, 'dialog', { name: 'Edit link' });
  const button = (name) => getByRole(wrapper.element, 'button', { name });
  const settle = async () => {
    await waitForPromises();
    await waitForPromises();
  };
  const open = async () => {
    fireEvent.click(button('Insert or edit link'));
    await settle();
  };
  const input = (name, value) =>
    fireEvent.input(getByRole(dialog(), 'textbox', { name }), { target: { value } });

  async function createComponent({ editable = true } = {}) {
    renderMarkdown = jest.fn((source) =>
      Promise.resolve({
        body: source === original ? html : '<p><a href="/resolved-next">link</a></p>',
      }),
    );
    service = new GitLabContentEditor({ renderMarkdown, describeLabels: () => '', editable });
    await service.setSerializedContent(original);
    mount = document.createElement('div');
    document.body.appendChild(mount);
    view = new EditorView(mount, service.editor, { ariaLabel: 'Link example document' });
    service.editor.dispatch(
      service.editor.createTransaction().setSelection(Selection.cursor([0, 2], 1)),
    );
    wrapper = mountExtended(FountainLinkMenu, {
      propsData: { contentEditor: service, getEditorRoot: () => view.dom, disabled: !editable },
      attachTo: document.body,
      stubs: { transition: false },
    });
    view.focus();
    await settle();
  }

  afterEach(async () => {
    wrapper?.destroy();
    view?.destroy();
    service?.dispose();
    mount?.remove();
    await settle();
    await waitFor(() => {
      if (queryByRole(document.body, 'dialog', { name: 'Edit link' }))
        throw new Error('Link modal still mounted after disposal');
    });
  });

  it('opens the complete mixed-format link with canonical URL and saves a one-step native edit', async () => {
    await createComponent();
    await open();
    expect(getByRole(dialog(), 'textbox', { name: 'Link text' })).toHaveValue('onetwo');
    expect(getByRole(dialog(), 'textbox', { name: 'Link URL' })).toHaveValue('/canonical-old');
    input('Link URL', '/next');
    await settle();
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply link' }));
    await settle();
    await waitFor(() =>
      expect(queryByRole(document.body, 'dialog', { name: 'Edit link' })).toBeNull(),
    );
    expect(service.getSerializedContent()).toContain('[one**two**](/next)');
    expect(view.dom.querySelector('a').getAttribute('href')).toBe('/resolved-next');
    expect(undo(service.editor)).toBe(true);
    expect(service.getSerializedContent()).toBe(original);
  });

  it('retains the entered draft on an actual renderer rejection and allows retry', async () => {
    await createComponent();
    await open();
    input('Link text', 'Retained label');
    input('Link URL', '/next');
    await settle();
    renderMarkdown.mockRejectedValueOnce(new Error('Renderer unavailable'));
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply link' }));
    await settle();
    expect(getByRole(dialog(), 'alert').textContent).toContain(
      'Your draft and document are retained',
    );
    expect(getByRole(dialog(), 'textbox', { name: 'Link text' })).toHaveValue('Retained label');
    expect(service.getSerializedContent()).toBe(original);
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply link' }));
    await settle();
    expect(service.getSerializedContent()).toContain('[Retained label](/next)');
  });

  it('cancels a pending request without allowing its late result to modify the document', async () => {
    await createComponent();
    await open();
    let finish;
    renderMarkdown.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    input('Link URL', '/next');
    await settle();
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply link' }));
    await settle();
    expect(
      getByRole(dialog(), 'button', { name: /Apply link/ }).getAttribute('aria-disabled'),
    ).toBe('true');
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Cancel link edit' }));
    await settle();
    expect(renderMarkdown.mock.calls[1][1].signal.aborted).toBe(true);
    finish({ body: '<p><a href="/late">link</a></p>' });
    await settle();
    expect(service.getSerializedContent()).toBe(original);
    expect(undo(service.editor)).toBe(false);
  });

  it('shows a conflict without erasing the form when selected content changes', async () => {
    await createComponent();
    await open();
    input('Link text', 'My draft');
    insertText(service.editor, '!');
    await settle();
    expect(getByRole(dialog(), 'alert').textContent).toContain('The selected content changed');
    expect(getByRole(dialog(), 'textbox', { name: 'Link text' })).toHaveValue('My draft');
    expect(
      getByRole(dialog(), 'button', { name: 'Apply link' }).getAttribute('aria-disabled'),
    ).toBe('true');
    expect(service.editor.getText()).toBe('Before onet!wo after');
  });

  it('disables authoring in read-only mode', async () => {
    await createComponent({ editable: false });
    expect(button('Insert or edit link').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button('Insert or edit link'));
    await settle();
    await waitFor(() =>
      expect(queryByRole(document.body, 'dialog', { name: 'Edit link' })).toBeNull(),
    );
    expect(service.getSerializedContent()).toBe(original);
  });

  it('opens the prefilled form from the focused preview action', async () => {
    await createComponent();
    const edit = getByRole(document.body, 'button', { name: 'Edit link' });
    expect(wrapper.findComponent(GlPopover).props('container')).toBe(wrapper.attributes('id'));
    expect(wrapper.element.contains(edit)).toBe(true);
    expect(view.dom.contains(edit)).toBe(false);
    edit.focus();
    expect(fireEvent.mouseDown(edit)).toBe(false);
    fireEvent.click(edit);
    await settle();
    expect(getByRole(dialog(), 'textbox', { name: 'Link text' }).value).toBe('onetwo');
    expect(getByRole(dialog(), 'textbox', { name: 'Link URL' }).value).toBe('/canonical-old');
  });

  it('reopens the same form from the preview after a successful edit', async () => {
    await createComponent();
    await open();
    input('Link URL', '/next');
    await settle();
    fireEvent.click(getByRole(dialog(), 'button', { name: 'Apply link' }));
    await waitFor(() =>
      expect(queryByRole(document.body, 'dialog', { name: 'Edit link' })).toBeNull(),
    );
    expect(undo(service.editor)).toBe(true);
    expect(redo(service.editor)).toBe(true);
    view.focus();
    await settle();
    fireEvent.click(getByRole(document.body, 'button', { name: 'Edit link' }));
    await waitFor(() =>
      expect(getByRole(dialog(), 'textbox', { name: 'Link URL' }).value).toBe('/next'),
    );
    expect(getByRole(dialog(), 'textbox', { name: 'Link text' }).value).toBe('onetwo');
  });

  it('retargets after a DOM-only view repair without changing source or history', async () => {
    await createComponent();
    const originalLink = view.dom.querySelector('a');
    const replacement = originalLink.cloneNode(true);
    originalLink.replaceWith(replacement);
    await waitFor(() => expect(wrapper.findComponent(GlPopover).props('target')).toBe(replacement));
    expect(service.getSerializedContent()).toBe(original);
    expect(undo(service.editor)).toBe(false);
  });
});
