// Copyright Paolo Cappuccini. SPDX-License-Identifier: MIT
const forms = new WeakMap();
const snapshots = new WeakMap();

class SubmissionError extends Error {
  constructor(code) {
    super(
      code === 'changed'
        ? 'The document changed while submission was being checked.'
        : 'The editor is not ready for submission.',
    );
    this.code = code;
  }
}

function read(entry) {
  if (entry.composing) throw new SubmissionError('not-ready');
  const value = entry.read();
  if (typeof value !== 'string') throw new SubmissionError('not-ready');
  return value;
}

function notify(entry, error) {
  entry.onError(error);
}

function cancel(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

export function prepareMarkdownSubmission(form) {
  const entries = [...(forms.get(form)?.entries ?? [])];
  const values = new Map();
  let failed = false;
  for (const entry of entries) {
    try {
      values.set(entry, read(entry));
    } catch (error) {
      failed = true;
      notify(entry, error);
    }
  }
  if (failed) return null;
  for (const [entry, value] of values) {
    try {
      entry.write(value);
      entry.onReady();
    } catch (error) {
      failed = true;
      notify(entry, error);
    }
  }
  if (failed) return null;
  const current = forms.get(form)?.entries ?? new Set();
  if (current.size !== values.size || [...current].some((entry) => !values.has(entry))) {
    for (const entry of current) notify(entry, new SubmissionError('changed'));
    return null;
  }
  const snapshot = Object.freeze({ form });
  snapshots.set(snapshot, values);
  return snapshot;
}

export function validateMarkdownSubmission(snapshot) {
  const values = snapshots.get(snapshot);
  if (!values) return false;
  const current = forms.get(snapshot.form)?.entries ?? new Set();
  let valid = current.size === values.size;
  for (const entry of current) {
    try {
      if (!values.has(entry) || read(entry) !== values.get(entry)) valid = false;
    } catch (error) {
      valid = false;
      notify(entry, error);
    }
  }
  if (!valid) for (const entry of current) notify(entry, new SubmissionError('changed'));
  return valid;
}

export function restoreMarkdownSubmissionDrafts(snapshot) {
  if (!snapshot || !snapshots.has(snapshot)) return;
  for (const entry of forms.get(snapshot.form)?.entries ?? []) {
    try {
      entry.write(read(entry));
      entry.restoreDraft();
    } catch {
      /* Never replace an existing newer draft with an older cached value. */
    }
  }
}

export function completeMarkdownSubmission(snapshot) {
  const values = snapshots.get(snapshot);
  if (!values) return false;
  const entries = forms.get(snapshot.form)?.entries ?? new Set();
  let complete = entries.size === values.size;
  for (const entry of entries) {
    try {
      if (!values.has(entry) || read(entry) !== values.get(entry)) {
        complete = false;
        continue;
      }
      entry.clearDraft();
    } catch {
      complete = false;
      notify(entry, new SubmissionError('draft-clear'));
    }
  }
  return complete;
}

function attachForm(form) {
  let record = forms.get(form);
  if (record) return record;
  const click = (event) => {
    const target = event.target?.closest?.('button, input');
    if (target?.form !== form || !['submit', 'image'].includes(target.type)) return;
    try {
      if (!prepareMarkdownSubmission(form)) cancel(event);
    } catch {
      cancel(event);
    }
  };
  const submit = (event) => {
    let snapshot;
    try {
      snapshot = prepareMarkdownSubmission(form);
    } catch {
      cancel(event);
      return;
    }
    if (!snapshot) {
      cancel(event);
      return;
    }
    // Custom transports prevent the native submit and acknowledge success themselves.
    queueMicrotask(() => {
      if (!event.defaultPrevented && event.isTrusted) completeMarkdownSubmission(snapshot);
    });
  };
  record = { entries: new Set(), click, submit };
  forms.set(form, record);
  form.addEventListener('click', click, true);
  form.addEventListener('submit', submit, true);
  return record;
}

export function bindMarkdownSubmission(options) {
  const entry = { ...options, composing: false };
  const form = options.element.closest('form');
  const record = form ? attachForm(form) : null;
  record?.entries.add(entry);
  const start = () => {
    entry.composing = true;
  };
  const end = () => {
    entry.composing = false;
  };
  options.element.addEventListener('compositionstart', start, true);
  options.element.addEventListener('compositionend', end, true);
  let disposed = false;
  return {
    getValue() {
      if (disposed) throw new SubmissionError('not-ready');
      try {
        const value = read(entry);
        entry.onReady();
        return value;
      } catch (error) {
        notify(entry, error);
        throw error;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      options.element.removeEventListener('compositionstart', start, true);
      options.element.removeEventListener('compositionend', end, true);
      record?.entries.delete(entry);
      if (record && record.entries.size === 0) {
        form.removeEventListener('click', record.click, true);
        form.removeEventListener('submit', record.submit, true);
        forms.delete(form);
      }
    },
  };
}
