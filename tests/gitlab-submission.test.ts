// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  bindMarkdownSubmission,
  prepareMarkdownSubmission,
  validateMarkdownSubmission,
  restoreMarkdownSubmissionDrafts,
  completeMarkdownSubmission,
} from '../integrations/gitlab/services/submission.js';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));
function setup() {
  const form = document.createElement('form'),
    element = document.createElement('section'),
    input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'description';
  input.value = 'Old';
  element.append(input);
  form.append(element);
  document.body.append(form);
  const model = { value: 'Current', fail: false, draft: 'Old' };
  const error = vi.fn(),
    ready = vi.fn(),
    clear = vi.fn(() => {
      model.draft = '';
    });
  const binding = bindMarkdownSubmission({
    element,
    read: () => {
      if (model.fail) throw new Error('Conversion refused');
      return model.value;
    },
    write: (value) => {
      input.value = value;
      model.draft = value;
    },
    onReady: ready,
    onError: error,
    clearDraft: clear,
    restoreDraft: () => {
      model.draft = input.value;
    },
  });
  cleanup.push(() => {
    binding.dispose();
    form.remove();
  });
  return { form, element, input, model, binding, error, ready, clear };
}

it('flushes current values synchronously before native form or AJAX collection', () => {
  const { form, input, binding, model } = setup();
  expect(binding.getValue()).toBe('Current');
  model.value = 'Newer';
  const snapshot = prepareMarkdownSubmission(form)!;
  expect(new FormData(form).get('description')).toBe('Newer');
  expect(input.value).toBe('Newer');
  expect(validateMarkdownSubmission(snapshot)).toBe(true);
});

it('blocks native submit before a transport sees stale fields and retains the draft', () => {
  const { form, model, error } = setup();
  model.fail = true;
  const transport = vi.fn();
  form.addEventListener('submit', transport);
  const event = new Event('submit', { bubbles: true, cancelable: true });
  expect(form.dispatchEvent(event)).toBe(false);
  expect(transport).not.toHaveBeenCalled();
  expect(model.draft).toBe('Old');
  expect(error).toHaveBeenCalled();
});

it('blocks an invalid submit-button click before optimistic draft reset handlers run', () => {
  const { form, model } = setup();
  model.fail = true;
  const button = document.createElement('button');
  button.type = 'submit';
  form.append(button);
  const reset = vi.fn();
  button.addEventListener('click', reset);
  button.click();
  expect(reset).not.toHaveBeenCalled();
  expect(model.draft).toBe('Old');
});

it('detects changed content after asynchronous checks without clearing newer work', () => {
  const { form, model, clear, error } = setup();
  const snapshot = prepareMarkdownSubmission(form)!;
  model.value = 'Changed while awaiting approval';
  expect(validateMarkdownSubmission(snapshot)).toBe(false);
  expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: 'changed' }));
  expect(completeMarkdownSubmission(snapshot)).toBe(false);
  expect(clear).not.toHaveBeenCalled();
  restoreMarkdownSubmissionDrafts(snapshot);
  expect(model.draft).toBe(model.value);
});

it('does not overwrite a newer safe draft with cached content when current conversion refuses', () => {
  const { form, model } = setup();
  const snapshot = prepareMarkdownSubmission(form)!;
  model.draft = 'Newer safe draft';
  model.fail = true;
  restoreMarkdownSubmissionDrafts(snapshot);
  expect(model.draft).toBe('Newer safe draft');
});

it('clears a matching draft only after the transport acknowledges the prepared submission', () => {
  const { form, model, clear } = setup();
  const snapshot = prepareMarkdownSubmission(form)!;
  expect(clear).not.toHaveBeenCalled();
  expect(completeMarkdownSubmission(snapshot)).toBe(true);
  expect(model.draft).toBe('');
});

it('rejects submission during composition in a native descendant control', () => {
  const { form, element, binding, error } = setup();
  const control = document.createElement('textarea');
  element.append(control);
  control.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  expect(prepareMarkdownSubmission(form)).toBe(null);
  expect(() => binding.getValue()).toThrow();
  expect(error).toHaveBeenCalled();
  control.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  expect(prepareMarkdownSubmission(form)).not.toBe(null);
});

it('invalidates a snapshot when an editor is removed and releases event listeners', () => {
  const { form, binding, model } = setup();
  const snapshot = prepareMarkdownSubmission(form)!;
  binding.dispose();
  expect(validateMarkdownSubmission(snapshot)).toBe(false);
  expect(completeMarkdownSubmission(snapshot)).toBe(false);
  expect(() => binding.getValue()).toThrow();
  model.fail = true;
  const event = new Event('submit', { cancelable: true });
  expect(form.dispatchEvent(event)).toBe(true);
});

it('still prevents native submission if the host error reporter itself throws', () => {
  const form = document.createElement('form'),
    element = document.createElement('div');
  form.append(element);
  document.body.append(form);
  const binding = bindMarkdownSubmission({
    element,
    read() {
      throw new Error('Conversion refused');
    },
    write() {},
    onReady() {},
    onError() {
      throw new Error('Reporter failed');
    },
    clearDraft() {},
    restoreDraft() {},
  });
  cleanup.push(() => {
    binding.dispose();
    form.remove();
  });
  const transport = vi.fn();
  form.addEventListener('submit', transport);
  expect(form.dispatchEvent(new Event('submit', { cancelable: true }))).toBe(false);
  expect(transport).not.toHaveBeenCalled();
});

it('does not publish any fields if another editor in the same form refuses conversion', () => {
  const { form, input } = setup();
  const second = document.createElement('section');
  form.append(second);
  const binding = bindMarkdownSubmission({
    element: second,
    read() {
      throw new Error('Second editor refused');
    },
    write: vi.fn(),
    onReady() {},
    onError() {},
    clearDraft() {},
    restoreDraft() {},
  });
  cleanup.push(() => binding.dispose());
  expect(prepareMarkdownSubmission(form)).toBe(null);
  expect(input.value).toBe('Old');
});
