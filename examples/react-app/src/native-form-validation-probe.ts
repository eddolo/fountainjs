import { registerFountainElement, type FountainEditorElement, type NodeJSON } from 'fountainjs-editor';

let sequence = 0;
export type FormPolicyProbe = 'default' | 'text-only' | 'throws' | 'invalid-return';

/** Browser contract fixture: real ElementInternals and built public package,
 * not a simulated form/validity implementation. Never sends a submission.
 */
export function probeNativeFormValidation(mode: FormPolicyProbe, value: NodeJSON, disabled = false) {
  const errors: string[] = [];
  const tagName = `fountain-form-probe-${++sequence}` as const;
  const containsText = (node: NodeJSON | undefined): boolean => Boolean(node && (
    node.type === 'text' ? /\S/u.test(node.text ?? '') : node.content?.some(containsText)
  ));
  registerFountainElement({ tagName, formAssociated: true, requiredMessage: 'Write an explanation.',
    isFormValueEmpty: mode === 'default' ? undefined : document => {
      if (mode === 'throws') throw new Error('Generated form-policy failure.');
      if (mode === 'invalid-return') return 'not a boolean' as unknown as boolean;
      return !containsText(document);
    }, onError: error => errors.push(error instanceof Error ? error.message : String(error)),
  });
  const form = document.createElement('form');
  const element = document.createElement(tagName) as FountainEditorElement;
  element.name = 'document'; element.value = value; element.required = true;
  let invalidEvents = 0;
  element.addEventListener('invalid', event => { invalidEvents++; event.preventDefault(); });
  form.append(element); document.body.append(form);
  try {
    element.disabled = disabled;
    const before = element.value;
    const checks = { element: element.checkValidity(), report: element.reportValidity(), form: form.checkValidity() };
    return { checks, invalidEvents, willValidate: element.willValidate,
      validity: { valid: element.validity!.valid, valueMissing: element.validity!.valueMissing, customError: element.validity!.customError },
      message: element.validationMessage, errors, unchanged: JSON.stringify(before) === JSON.stringify(element.value),
      value: element.value, submitted: new FormData(form).get('document'),
    };
  } finally { form.remove(); }
}
