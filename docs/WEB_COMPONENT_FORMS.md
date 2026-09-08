# Web Components in native HTML forms

Unreleased, 2026-09-08. This is a browser integration feature, not a form builder,
submission service, permission system, or a claim of full native-input parity.

Register a distinct tag with native form association enabled:

```ts
import { registerFountainElement, StarterKit } from 'fountainjs-editor';

registerFountainElement({
  tagName: 'request-document',
  formAssociated: true,
  schema: StarterKit.schema,
  plugins: StarterKit.plugins,
});
```

```html
<form id="request">
  <label>Title <input name="title"></label>
  <request-document name="document" aria-label="Request document"></request-document>
  <button type="submit">Submit</button>
  <button type="reset">Reset</button>
</form>
```

`new FormData(form).get('document')` is the JSON string for the current Fountain
document, including root attributes. Each accepted document-changing transaction updates
that value. There is no hidden-input mirror or extra submission request. Normal
browser submission can send it to the form's action; the host must authenticate,
authorize, bound and validate received JSON before storing it. Browser validation
and a disabled UI are not authorization.

The [live workshop](https://eddolo.github.io/fountainjs/demos/java-approval-workflow.html#native-form)
prevents network submission and shows the actual native FormData instead.

## Contract

- Form association is opt-in at registration, and requires native
  `ElementInternals.setFormValue`. Existing registrations remain non-associated.
  Registration reuses an existing tag; choose a new tag to change its definition.
- `name` reflects the HTML attribute. Nameless editors are omitted by the browser.
  The read-only `form` property exposes the native owner, including an external
  `<form>` selected by the element's `form="id"` attribute.
- `disabled` reflects the own attribute. A disabled ancestor fieldset also
  disables a form-associated editor, according to the browser's normal rules.
  The editable view becomes inert, non-editable and `aria-disabled="true"`.
  Re-enabling it does not recreate the editor or discard its history.
- Disabled fields are omitted from FormData. Their document remains intact.
  Local document-changing editor commands are rejected while disabled. Explicit
  property assignments and host-designated remote collaboration transactions
  remain accepted, subject to the application's other transaction filters.
  The engine's fixed `editor.editable` flag is not rewritten; this is a view/form
  gate, not a change to core authorization or collaboration semantics.
- Assign `element.value` to replace the complete document. The schema validates
  it before dispatch. A rejected update throws rather than installing a stale
  pending value. Assigning `undefined` to an already mounted editor does not clear
  its document; assign a valid empty document to do that.
- Reset uses the current JSON `value` attribute when present; otherwise it uses
  the first mounted document (including a property assigned before mounting).
  Setting `value` after mounting changes the current document, not that default.
  Reset is a normal whole-document transaction and can be undone when the host
  installs history. It still respects host transaction filters and emits the
  existing `fountain-change` event when state changes.
- The state-restoration callback accepts serialized document JSON, validates it,
  and uses the same setter. Non-string or invalid state is rejected. Unit checks
  exercise this callback; actual session restoration/autofill scheduling remains
  browser-owned and is not certified by those checks.
- Disconnect/reconnect retains the current document. As before, it destroys and
  recreates the editor/view; plugin history is not a persisted form-session store.

Native `required`, `minlength`, custom-validity UI, alternative submission
formats, automatic label-to-inner-editor focus, and autofill-specific UX are
not implemented by this slice. Supply an accessible editor label and validate
document requirements in the host. They remain follow-up integration work.

## Metadata retention correction

The Web Component's old setter used content-only replacement, leaving previous
root attributes in place. It now uses the existing `replaceDocument` transaction.
The public `setContent` command received the same correction and now returns the
actual dispatch result when a host filter rejects the change. No new document
model or transaction kind was introduced. History restores complete root metadata.

## Evidence

`tests/web-component-forms.test.ts` covers value/schema/filter rejection,
metadata/history, disabled command behavior, allowed remote updates, reset and
state restoration. `tests/document-replacement.test.ts` covers the public command.
These tests do not simulate native browser FormData support in jsdom.

`tests/browser/web-component-form-journey.ts` exercises the public workshop using
real typing, a submit button, FormData, fieldset disabling, reset, external-form
association, name changes and direct disabling in Chromium, Firefox and WebKit.
Its manual counterpart records the same journey for visual review.

The implementation follows the [HTML Standard's form-associated custom-element
contract](https://html.spec.whatwg.org/multipage/custom-elements.html#custom-elements-face-example).
