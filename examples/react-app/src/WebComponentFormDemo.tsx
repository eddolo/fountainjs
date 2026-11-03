import { useEffect, useRef, useState } from 'react';
import { registerFountainElement, StarterKit, type FountainEditorElement } from 'fountainjs-editor';
import './web-component-form.css';

export function WebComponentFormDemo() {
  const mount = useRef<HTMLDivElement>(null);
  const field = useRef<FountainEditorElement>(undefined);
  const attempted = useRef(false);
  const [disabled, setDisabled] = useState(false);
  const [required, setRequired] = useState(true);
  const [problem, setProblem] = useState('');
  const [submitted, setSubmitted] = useState('Submit to inspect the native FormData. Nothing is sent to a server.');
  useEffect(() => {
    registerFountainElement({ tagName: 'fountain-native-form-editor', formAssociated: true,
      schema: StarterKit.schema, plugins: StarterKit.plugins });
    const element = document.createElement('fountain-native-form-editor') as FountainEditorElement;
    field.current = element;
    element.id = 'native-approval-document';
    element.name = 'document';
    element.setAttribute('required', '');
    element.setAttribute('aria-describedby', 'native-form-document-hint native-form-validation-message');
    element.value = { type: 'doc', attrs: { workflow: 'approval' }, content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Explain the requested exception.' }] },
    ] };
    const invalid = () => { attempted.current = true; setProblem(element.validationMessage); };
    const changed = () => { if (attempted.current) setProblem(element.validationMessage); };
    element.addEventListener('invalid', invalid);
    element.addEventListener('fountain-change', changed);
    mount.current!.append(element);
    return () => {
      element.removeEventListener('invalid', invalid);
      element.removeEventListener('fountain-change', changed);
      element.remove(); field.current = undefined;
    };
  }, []);
  useEffect(() => {
    field.current?.toggleAttribute('required', required);
    if (attempted.current) setProblem(field.current?.validationMessage ?? '');
  }, [required, disabled]);
  return <section id="native-form" className="demo-surface native-form" aria-label="Native HTML form workshop">
    <h2>Submit a document through a normal HTML form</h2>
    <p>The title is a native input. The document is a form-associated Web Component. Clear the required document and submit to see native validation; type content to fix it. This local preview does not send or store a submission.</p>
    <label><input type="checkbox" checked={disabled} onChange={event => setDisabled(event.target.checked)} /> Disable the form fields</label>
    <label><input type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} /> Require document content</label>
    <form onSubmit={event => {
      event.preventDefault();
      setProblem('');
      setSubmitted(JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries()), null, 2));
    }} onReset={() => {
      attempted.current = false; setProblem('');
      setSubmitted('Reset to the initial values. Submit again to inspect them.');
    }}>
      <fieldset disabled={disabled}>
        <legend>Approval request</legend>
        <label>Request title <input name="title" defaultValue="Security exception" /></label>
        <label htmlFor="native-approval-document" style={{ marginTop: 16 }}>Approval request document</label>
        <p id="native-form-document-hint">Required means non-whitespace text or a non-break content atom. The host can override this rule. Reset restores the initial document.</p>
        <div ref={mount} style={{ marginTop: 16 }} />
        <p id="native-form-validation-message" role="alert" hidden={!problem} className="native-form__error">{problem}</p>
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => {
            if (field.current) field.current.value = { type: 'doc', attrs: field.current.value?.attrs, content: [{ type: 'paragraph' }] };
          }}>Clear document</button>
          <button type="button" onClick={() => {
            attempted.current = true;
            field.current?.setCustomValidity('Approval owner confirmation is required by this example.');
            setProblem(field.current?.validationMessage ?? '');
          }}>Set approval-rule error</button>
          <button type="button" onClick={() => {
            field.current?.setCustomValidity('');
            setProblem(attempted.current ? field.current?.validationMessage ?? '' : '');
          }}>Clear approval-rule error</button>
        </div>
      </fieldset>
      <button type="submit">Preview form submission</button>{' '}<button type="reset">Reset form</button>
    </form>
    <pre aria-label="Native form payload">{submitted}</pre>
    <p>Disabled fields are omitted by the browser. The editor submits JSON only. Required-content validation and host custom errors participate in native submission; application rules, authorization and persistence remain host responsibilities. <a href="https://github.com/eddolo/fountainjs/blob/master/docs/WEB_COMPONENT_FORMS.md">Form integration guide →</a></p>
  </section>;
}
