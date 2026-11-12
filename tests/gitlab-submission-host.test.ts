// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import * as submission from '../integrations/gitlab/services/submission.js';
import data from '../integrations/gitlab/fixtures/handoff-methods.json';

const dispose: (() => void)[] = [];
afterEach(() => dispose.splice(0).forEach((action) => action()));
function selected(kind: string, dependencies: Record<string, unknown> = {}) {
  const source = data.files.find((file) => file.kind === kind)!;
  const body =
    kind === 'description-field'
      ? `return (${source.code});`
      : kind === 'draft-reset-binding'
        ? `${source.code}; return mountAutosaveClearOnSubmit;`
        : `return ({ ${source.code} }).${source.method};`;
  return new Function(...Object.keys(dependencies), body)(...Object.values(dependencies));
}
function setup() {
  const form = document.createElement('form'),
    root = document.createElement('section'),
    field = document.createElement('input');
  field.type = 'hidden';
  field.name = 'issue[description]';
  field.value = 'Old cached value';
  root.append(field);
  form.append(root);
  document.body.append(form);
  const model = { value: 'Current rich document', fail: false, draft: 'Old cached value' };
  const component: any = {
    $el: root,
    $refs: {
      submissionField: field,
      contentEditor: {
        getSerializedContentForHandoff() {
          if (model.fail) throw new Error('Conversion refused');
          return model.value;
        },
      },
    },
    isContentEditorActive: true,
    markdown: field.value,
    autosaveKey: 'issue/test',
    alert: null,
    updateMarkdownFromContentEditor({ markdown }: { markdown: string }) {
      this.markdown = markdown;
      this.saveDraft();
    },
    saveDraft() {
      model.draft = this.markdown;
    },
    clearDraft() {
      model.draft = '';
    },
  };
  selected('submission-binding', {
    bindMarkdownSubmission: submission.bindMarkdownSubmission,
    s__: (value: string) => value.split('|').slice(1).join('|'),
  }).call(component);
  dispose.push(() => {
    component.submissionBinding.dispose();
    form.remove();
  });
  const sent: unknown[] = [];
  const transport = vi.fn(() => sent.push(new FormData(form).get('issue[description]')));
  Object.defineProperty(form, 'submit', { value: transport, configurable: true });
  const button: any = { removeAttr: vi.fn(() => button), removeClass: vi.fn(() => button) };
  const legacy: any = {
    form: {
      find: (selector: string) => ({
        val: () => (form.querySelector(selector) as HTMLInputElement)?.value,
      }),
    },
    submitButton: button,
    resetAutosave: vi.fn(),
    showSubmitLoading: vi.fn(),
  };
  const selector = data.files.find((file) => file.kind === 'description-field')!;
  legacy.descriptionField = new Function(`return (${selector.code});`).call(legacy);
  const detector = vi.fn(async () => true),
    alert = vi.fn();
  const handler = selected('legacy-submit', {
    ...submission,
    detectAndConfirmSensitiveTokens: detector,
    createAlert: alert,
    __: (value: string) => value,
    trackSavedUsingEditor: vi.fn(),
    EDITING_MODE_CONTENT_EDITOR: 'contentEditor',
    getIssuableType: () => 'Issue',
    CONTENT_TYPE: { DESCRIPTION: 'description' },
  });
  const submit = () => handler.call(legacy, { target: form, preventDefault: vi.fn() });
  return { form, field, root, model, component, legacy, detector, alert, transport, sent, submit };
}

it('submits the fresh hidden rich-description value and checks exactly that content', async () => {
  const { submit, sent, detector, model, legacy } = setup();
  expect(await submit()).toBe(true);
  expect(detector).toHaveBeenCalledWith({
    content: 'Current rich document',
    contentType: 'description',
  });
  expect(sent).toEqual(['Current rich document']);
  expect(model.draft).toBe('');
  expect(legacy.resetAutosave).toHaveBeenCalledOnce();
});

it('blocks the real legacy handler on conversion refusal without transport or draft reset', async () => {
  const { submit, detector, transport, model, component, legacy } = setup();
  model.fail = true;
  expect(await submit()).toBe(false);
  expect(detector).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
  expect(model.draft).toBe('Old cached value');
  expect(component.alert.variant).toBe('danger');
  expect(legacy.resetAutosave).not.toHaveBeenCalled();
  expect(legacy.submissionPending).toBe(false);
});

it('retains the current draft when the asynchronous content check is declined', async () => {
  const { submit, detector, sent, model, legacy } = setup();
  detector.mockResolvedValue(false);
  expect(await submit()).toBe(false);
  expect(sent).toEqual([]);
  expect(model.draft).toBe('Current rich document');
  expect(legacy.resetAutosave).not.toHaveBeenCalled();
});

it('refuses unreviewed changes during the asynchronous check and retains the newer draft', async () => {
  const { submit, detector, sent, model, component } = setup();
  let resolve!: (value: boolean) => void;
  detector.mockImplementation(
    () =>
      new Promise((result) => {
        resolve = result;
      }),
  );
  const result = submit();
  model.value = 'Changed while check pending';
  resolve(true);
  expect(await result).toBe(false);
  expect(sent).toEqual([]);
  expect(model.draft).toBe(model.value);
  expect(component.alert.message).toContain('document changed');
});

it('coalesces repeated submit attempts while checking, without sending duplicate requests', async () => {
  const { submit, detector, sent } = setup();
  let resolve!: (value: boolean) => void;
  detector.mockImplementation(
    () =>
      new Promise((result) => {
        resolve = result;
      }),
  );
  const first = submit();
  expect(await submit()).toBe(false);
  resolve(true);
  expect(await first).toBe(true);
  expect(detector).toHaveBeenCalledOnce();
  expect(sent).toHaveLength(1);
});

it.each(['check', 'transport'])(
  'retains the draft and releases pending UI after %s failure',
  async (stage) => {
    const { submit, detector, transport, model, legacy, alert } = setup();
    if (stage === 'check') detector.mockRejectedValue(new Error('Check unavailable'));
    else
      transport.mockImplementation(() => {
        throw new Error('Transport unavailable');
      });
    expect(await submit()).toBe(false);
    expect(model.draft).toBe('Current rich document');
    expect(legacy.submissionPending).toBe(false);
    expect(legacy.submitButton.removeAttr).toHaveBeenCalledWith('disabled');
    expect(alert).toHaveBeenCalled();
    expect(legacy.resetAutosave).not.toHaveBeenCalled();
  },
);

it('exposes current values through the actual AJAX facade method and refuses stale fallback', () => {
  const { component, model } = setup();
  const getValue = selected('submission-value');
  expect(getValue.call(component)).toBe('Current rich document');
  model.fail = true;
  expect(() => getValue.call(component)).toThrow('Conversion refused');
});

it('keeps facade reads free of draft writes or input publication', () => {
  const { component, model, field } = setup();
  const before = model.draft;
  expect(selected('submission-value').call(component)).toBe('Current rich document');
  expect(model.draft).toBe(before);
  expect(field.value).toBe('Old cached value');
});

it('clears submit drafts after acceptance while keeping explicit discard-button behavior', () => {
  const submit = document.createElement('button'),
    discard = document.createElement('button');
  submit.type = 'submit';
  discard.type = 'button';
  submit.className = discard.className = 'js-reset-autosave';
  document.body.append(submit, discard);
  dispose.push(() => {
    submit.remove();
    discard.remove();
  });
  const eventHub = { $emit: vi.fn() };
  selected('draft-reset-binding', { eventHub, CLEAR_AUTOSAVE_ENTRY_EVENT: 'clear', document })(
    'draft-key',
  );
  submit.click();
  expect(eventHub.$emit).not.toHaveBeenCalled();
  discard.click();
  expect(eventHub.$emit).toHaveBeenCalledWith('clear', 'draft-key');
});
