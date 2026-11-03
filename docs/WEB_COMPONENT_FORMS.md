# Web Components in native HTML forms

Unreleased, updated 2026-11-03. This is a browser integration feature, not a form builder,
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
  <label for="request-document">Request document</label>
  <request-document id="request-document" name="document" required></request-document>
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
Its Clear action explicitly calls `focusEditor('start')` after replacing the
document with a childless paragraph, allowing immediate typing into that same
paragraph. Programmatic value assignments themselves do not request focus.

## Contract

- Form association is opt-in at registration, and requires native
  `ElementInternals.setFormValue` and `setValidity`. Existing registrations remain non-associated.
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

## Required content and custom errors

`required` reflects the attribute. By default a document satisfies it when it
contains non-whitespace text or a non-break atom (for example an image or
divider). Empty paragraphs, whitespace, hard breaks and empty code blocks do
not count. This checks content, not whether its meaning meets your application
rules. It never trims, normalizes or modifies the stored document; zero-width
characters are not silently sanitized.

Register `requiredMessage` for a localized missing-content message. The optional
synchronous `isFormValueEmpty(value)` callback can replace the emptiness rule,
for example to require prose rather than media. Throwing or returning a
non-boolean blocks validation with a custom error and reports the failure to
`onError`; an observer exception cannot bypass the error.

```ts
import type { FountainEditorElement } from 'fountainjs-editor';

const field = document.querySelector<FountainEditorElement>('request-document')!;
field.setCustomValidity('Please supply an approval owner.');
field.reportValidity(); // false; native invalid event and reporting
field.setCustomValidity(''); // clear the host-owned error
```

The element exposes native `validity`, `validationMessage`, `willValidate`,
`checkValidity()` and `reportValidity()`. Normal interactive form submission
and `requestSubmit()` run constraint validation; directly constructing
`FormData` does not. Canceling an `invalid` event suppresses native reporting,
not the invalid state. Custom errors persist across edits and reset until the
host clears them, like native inputs. Disabled controls are barred from native
validation and omitted from FormData.

Native popup appearance and lifetime remain browser-owned and can change when
focus moves to the editing surface. For persistent visible feedback, listen for
`invalid` and show `validationMessage`, as the workshop does. The SDK does not
inject an error panel or cancel the host's invalid events.

Non-associated legacy elements expose `validity: null`, `labels: null`,
`willValidate: false`, an empty validation message and successful check/report
results. `setCustomValidity()` throws `NotSupportedError` there: it requires an
explicit form-associated registration.

## Labels, focus and rendering

Native associated labels are exposed by `labels`. Clicking one focuses the
actual editable view. Its accessible name uses explicit `aria-label`, then the
registration's `ariaLabel`, then associated label text, then the default name.
Label text changes are observed; document content inside a wrapping label is
excluded from the name. Association is refreshed on focus and host ID/form
association changes. `aria-labelledby`, `aria-describedby` and
`aria-errormessage` are forwarded to the view. Required/invalid/disabled state
is reflected there for assistive technology; this is not certification of
every screen-reader/browser combination.

The host has a default programmatic `tabindex="-1"`; an explicit host tabindex
is respected. The editable view remains the normal keyboard stop. Native
validation uses an empty sibling anchor outside the document renderer,
forwarding focus to the editable view. This keeps browser-owned validation UI
out of document content and avoids a WebKit-port behavior in which that UI
hides an anchor's light-DOM children. The anchor is never serialized or submitted
as document content and is removed on disconnect. The anchor spans the field's
available width without adding vertical space, keeping the native popup away
from the viewport's left edge. Focus forwarding waits for
the browser's focus operation to finish, so repeated invalid submissions keep
working in Firefox. It respects focus moved elsewhere by another listener.

The isolated WebKit reproduction agrees with its fallback
[validation-message implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/ValidationMessage.cpp),
which uses a user-agent shadow tree when no native validation-message client is
available. This is evidence for the tested port, not a claim that every Safari
build has the same rendering defect.

`minlength`, alternative submission formats and autofill-specific UX remain
follow-up work. Server validation and authorization always belong to the host.

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

`tests/browser/web-component-validation-journey.ts` uses the public workshop's
label, clear, submit, type, custom-error, reset and fieldset controls. It checks
that an invalid empty paragraph still has a physical click target, then fixes
it with native typing and checks the actual submission JSON.
The separate childless-block journey clicks replaced paragraphs, headings and
code blocks, requires typing to fill the same block, and checks exact undo/redo.
`tests/browser/web-component-validation-contracts.ts` uses real browser
ElementInternals to check emptiness, atom versus prose policies, failed callbacks
and canceled invalid events; jsdom does not stand in for native validation.

The implementation follows the [HTML Standard's form-associated custom-element
contract](https://html.spec.whatwg.org/multipage/custom-elements.html#custom-elements-face-example).
