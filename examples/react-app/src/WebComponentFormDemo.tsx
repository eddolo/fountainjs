import { useEffect, useRef, useState } from 'react';
import { registerFountainElement, StarterKit, type FountainEditorElement } from 'fountainjs-editor';
import './web-component-form.css';

export function WebComponentFormDemo() {
  const mount = useRef<HTMLDivElement>(null);
  const [disabled, setDisabled] = useState(false);
  const [submitted, setSubmitted] = useState('Submit to inspect the native FormData. Nothing is sent to a server.');
  useEffect(() => {
    registerFountainElement({ tagName: 'fountain-native-form-editor', formAssociated: true,
      schema: StarterKit.schema, plugins: StarterKit.plugins });
    const element = document.createElement('fountain-native-form-editor') as FountainEditorElement;
    element.name = 'document';
    element.setAttribute('aria-label', 'Approval request document');
    element.value = { type: 'doc', attrs: { workflow: 'approval' }, content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Explain the requested exception.' }] },
    ] };
    mount.current!.append(element);
    return () => element.remove();
  }, []);
  return <section id="native-form" className="demo-surface native-form" aria-label="Native HTML form workshop">
    <h2>Submit a document through a normal HTML form</h2>
    <p>The title is a native input. The document is a form-associated Web Component. Submit reads both with <code>new FormData(form)</code>; reset restores the initial document. This local preview does not grant access or store a submission.</p>
    <label><input type="checkbox" checked={disabled} onChange={event => setDisabled(event.target.checked)} /> Disable the form fields</label>
    <form onSubmit={event => {
      event.preventDefault();
      setSubmitted(JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries()), null, 2));
    }} onReset={() => setSubmitted('Reset to the initial values. Submit again to inspect them.')}>
      <fieldset disabled={disabled}>
        <legend>Approval request</legend>
        <label>Request title <input name="title" defaultValue="Security exception" /></label>
        <div ref={mount} style={{ marginTop: 16 }} />
      </fieldset>
      <button type="submit">Preview form submission</button>{' '}<button type="reset">Reset form</button>
    </form>
    <pre aria-label="Native form payload">{submitted}</pre>
    <p>Disabled fields are omitted by the browser. The editor submits JSON only; required-content rules, custom validity, authorization and persistence remain application responsibilities. <a href="https://github.com/eddolo/fountainjs/blob/master/docs/WEB_COMPONENT_FORMS.md">Form integration guide →</a></p>
  </section>;
}
