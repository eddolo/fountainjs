// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerFountainElement, CoreSchemaSpec, COLLABORATION_REMOTE_META, Plugin, createHistoryPlugin, insertText, undo,
  type FountainEditorElement, type RegisterFountainElementOptions } from '../src';

let sequence = 0;
const doc = (text: string, owner = 'Ada') => ({ type: 'doc', attrs: { owner }, content: [
  { type: 'paragraph', attrs: { align: 'left' }, content: [{ type: 'text', text }] },
] });
type Element = FountainEditorElement & { formResetCallback(): void; formStateRestoreCallback(state: unknown): void };
function mount(options: RegisterFountainElementOptions = {}): Element {
  const tagName = `form-test-${++sequence}` as const;
  registerFountainElement({ tagName, ...options });
  const element = document.createElement(tagName) as Element;
  element.value = doc('Initial');
  document.body.append(element);
  return element;
}
afterEach(() => document.body.replaceChildren());

describe('Web Component value and disabled-state contracts (native form behavior is browser-tested)', () => {
  it('keeps legacy registrations independent of form internals', () => {
    const element = mount();
    expect(element.form).toBeNull();
    element.name = 'body';
    expect(element.getAttribute('name')).toBe('body');
    const serialize = vi.spyOn(element.editor!, 'getJSON');
    insertText(element.editor!, 'Changed');
    expect(serialize).not.toHaveBeenCalled();
  });
  it('reflects required while keeping legacy elements outside native validation', () => {
    const isEmpty = vi.fn(() => { throw new Error('Not a native form field'); });
    const element = mount({ isFormValueEmpty: isEmpty });
    element.required = true;
    expect(element.hasAttribute('required')).toBe(true);
    expect(element.willValidate).toBe(false);
    expect(element.validity).toBeNull();
    expect(element.labels).toBeNull();
    expect(element.validationMessage).toBe('');
    expect(element.checkValidity()).toBe(true);
    expect(element.reportValidity()).toBe(true);
    expect(() => element.setCustomValidity('Needs form association')).toThrow('formAssociated');
    insertText(element.editor!, 'Changed');
    expect(isEmpty).not.toHaveBeenCalled();
    element.required = false;
    expect(element.hasAttribute('required')).toBe(false);
  });
  it('forwards dynamic accessible names and descriptions without replacing the editor', () => {
    const element = mount(), editor = element.editor;
    element.setAttribute('aria-label', 'Updated document name');
    element.setAttribute('aria-labelledby', 'document-label');
    element.setAttribute('aria-describedby', 'document-help');
    const view = element.querySelector<HTMLElement>('[role=textbox]')!;
    expect(view.getAttribute('aria-label')).toBe('Updated document name');
    expect(view.getAttribute('aria-labelledby')).toBe('document-label');
    expect(view.getAttribute('aria-describedby')).toBe('document-help');
    element.removeAttribute('aria-labelledby');
    element.removeAttribute('aria-describedby');
    expect(view.hasAttribute('aria-labelledby')).toBe(false);
    expect(view.hasAttribute('aria-describedby')).toBe(false);
    expect(element.editor).toBe(editor);
  });
  it('replaces root metadata and content in one undoable update', () => {
    const element = mount({ plugins: [createHistoryPlugin()] });
    element.value = doc('Replacement', 'Grace');
    expect(element.value).toEqual(doc('Replacement', 'Grace'));
    expect(undo(element.editor!)).toBe(true);
    expect(element.value).toEqual(doc('Initial'));
  });
  it('keeps the accepted value on schema rejection, including after reconnect', () => {
    const element = mount({ schema: CoreSchemaSpec });
    expect(() => { element.value = { type: 'doc', content: [{ type: 'unknown' }] }; }).toThrow();
    element.remove(); document.body.append(element);
    expect(element.value).toEqual(doc('Initial'));
  });
  it('reports host-filter rejection without storing an unaccepted pending value', () => {
    const element = mount({ plugins: [new Plugin({ filterTransaction: tr => !tr.docChanged })] });
    expect(() => { element.value = doc('Rejected'); }).toThrow('rejected');
    element.remove(); document.body.append(element);
    expect(element.value).toEqual(doc('Initial'));
  });
  it('blocks disabled document commands but permits explicit property assignment without remounting', () => {
    const element = mount({ plugins: [createHistoryPlugin()] });
    const editor = element.editor!;
    element.disabled = true;
    const view = element.querySelector<HTMLElement>('[role=textbox]')!;
    expect(view.contentEditable).toBe('false');
    expect(view.inert).toBe(true);
    expect(insertText(editor, 'Blocked')).toBe(false);
    element.value = doc('Programmatic');
    expect(element.editor).toBe(editor);
    expect(element.value).toEqual(doc('Programmatic'));
    element.disabled = false;
    expect(view.contentEditable).toBe('true');
    expect(view.inert).toBe(false);
    expect(undo(editor)).toBe(true);
    expect(element.value).toEqual(doc('Initial'));
  });
  it('restores initial values and accepts a changed JSON value-attribute reset default', () => {
    const element = mount();
    element.value = doc('Edited', 'Grace');
    element.formResetCallback();
    expect(element.value).toEqual(doc('Initial'));
    element.setAttribute('value', JSON.stringify(doc('New default', 'Lin')));
    element.formResetCallback();
    expect(element.value).toEqual(doc('New default', 'Lin'));
  });
  it('continues accepting host-designated remote document updates while disabled', () => {
    const element = mount();
    element.disabled = true;
    const editor = element.editor!;
    const next = editor.state.schema.nodeFromJSON(doc('Remote', 'Grace'));
    expect(editor.dispatch(editor.createTransaction().replaceDocument(next).setMeta(COLLABORATION_REMOTE_META, true))).toBe(true);
    expect(element.value).toEqual(doc('Remote', 'Grace'));
    expect(element.querySelector<HTMLElement>('[role=textbox]')!.contentEditable).toBe('false');
  });
  it('validates restored JSON before replacing live state', () => {
    const element = mount();
    element.formStateRestoreCallback(JSON.stringify(doc('Restored', 'Grace')));
    expect(element.value).toEqual(doc('Restored', 'Grace'));
    expect(() => element.formStateRestoreCallback('{')).toThrow();
    expect(() => element.formStateRestoreCallback(new FormData())).toThrow('serialized document JSON');
    expect(element.value).toEqual(doc('Restored', 'Grace'));
  });
});
