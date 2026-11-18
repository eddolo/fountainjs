# FountainJS document templates

Create a reusable handoff, invite respondents, and read their completed documents. This project uses the published FountainJS beta for rich editing, validation and rendering, with a Node HTTP server and SQLite for persistence.

Use Node 24.12 or newer. Extract the ZIP, open a terminal in the directory containing `package.json`, and run:

```sh
npm install
npm start
```

Open the local address printed in the terminal. The server binds to `127.0.0.1`. Set `PORT` to choose another local port and `FOUNTAIN_TEMPLATE_DB` to choose another SQLite file. By default `workspace.sqlite` sits beside the application. Restarting with the same database and port preserves your links and records.

## Create and use a template

1. Choose **Create template** and bookmark the author page. Add fixed instructions and answer fields. Rich-text fields support paragraphs, bold and italic. To reuse a single-line answer in a sentence, place the cursor in the instructions, choose **Field to insert**, and press **Insert field**. Undo and redo work in the instructions toolbar. **Repeat an answer** places an entire answer in its own block and also supports rich text. Select **Allow editing here** on a repeated block to let the respondent edit from either location. Both copies share one saved answer. For rich text they also share formatting and undo history. Leave the option clear for a read-only repeat.
2. Save the template and choose **Create respondent link**. Each invitation has its own copy of that revision, draft and submission. Later template edits apply to future invitations.
3. Open the respondent link in another browser session on the same machine. Fill in fields, save a draft, close it and reopen the link. Required fields are checked on submission. The reader and downloaded Fountain JSON include the fixed instructions, answers and any repeated values.
4. Return to the author page and choose **Refresh submissions**. Read a completed response. Private drafts become visible to the author upon submission.

**Download template JSON** exports the current definition. **Open template file** creates an independent copy with a new author link. Invitations, access keys and responses belong to the original workspace.

The template and final document have different file structures. The template envelope contains ordered protected prose, field definitions and references. The final document uses ordinary Fountain heading, paragraph and text nodes. Text fields allow one line up to 4,000 characters. Rich fields allow 128 paragraphs and 16,000 characters with bold and italic marks. The server validates submitted content before publication.

## Compare answers before submission

Under **Answer rules**, choose **Add answer rule**. Select two single-line fields and a comparison. For example, compare **Study end** with **Study start** using **Date on or after**. Respondents see the required date format beside each field. When a submission fails, the workspace focuses the answer that needs correction.

**Must match** and **Must differ from** compare the exact text, including case and spaces. **Date on or after** accepts real calendar dates in YYYY-MM-DD format, including equal dates. An empty optional answer skips its own rule. Filling it in requires its comparison field. Respondents can save incomplete or inconsistent drafts and correct them later.

Rules travel in the template JSON. The server checks them against the template revision captured by each invitation. Changing the author’s template applies the new rules to future invitations.

## Check answers against application data

Set `FOUNTAIN_TEMPLATE_VALIDATION` to the path of a server-side ES module. An embedded host can pass the same object as the `validation` option to `createWorkspace`. For example, an application that maintains a study directory can register this check.

```js
import { directory } from './application-services.mjs';

export default {
  getContext({ accountId, templateId }) {
    return directory.openStudiesFor(accountId, templateId);
  },
  validators: {
    assigned_instrument: {
      label: 'Instrument assigned to study',
      inputs: ['Study ID', 'Instrument ID'],
      validate([study, instrument], studies) {
        if (!studies.has(study)) return { input: 0, message: 'Choose an open study.' };
        if (!studies.get(study).has(instrument))
          return { input: 1, message: 'Choose an instrument assigned to this study.' };
      },
    },
  },
};
```

Under **Application checks**, choose the check, click **Add application check**, and select a field for each input. Templates store its registered name and the ordered field keys. Use a new name for a new meaning when existing invitations must keep the old policy.

The server obtains context once per submission attempt, after ordinary document validation. The callback receives the response ID, template ID, invitation’s template revision, and the signed-in account ID in account mode. Validators may be asynchronous. Each receives its own copy of the selected answer values in input order. Single-line answers are strings, rich answers are Fountain JSON, and an unanswered optional input may be undefined. Returning null or undefined accepts the answer. Returning a message rejects it and focuses the input at the supplied zero-based index (default 0).

Drafts can be saved while a check fails or its registration is unavailable. A missing registration or changed input count blocks new invitations and submission under that check. Authors can open an imported template and remove the unavailable check. Previously submitted documents stay readable.

## Use inline fields in a custom schema

The download includes `inline-fields.mjs`. Compose its extension with your own nodes and marks. Any parent that accepts the inline group can contain a field, including a custom figure caption. The command inserts at the caret or replaces selected text in one parent. The field inherits the first text run's formatting.

```js
import { composeExtensions } from 'fountainjs-editor';
import { templateFieldExtension, resolveTemplateFields } from './inline-fields.mjs';

const kit = composeExtensions([applicationSchema, templateFieldExtension]);
// Use kit.schema when creating the editor.
kit.commands.insertTemplateField(editor, 'instrument');
const completed = resolveTemplateFields(editor.getJSON(), key => answers[key] ?? '');
editor.state.schema.nodeFromJSON(completed);
```

The resolver takes ordinary Fountain JSON and returns a document with text in place of each field. It preserves surrounding paragraphs, marks and host-defined attributes. Supply a string for each referenced key. An empty string omits that field from the completed sentence. The starter validates keys against the author's single-line field definitions on the server. Each template can contain up to 128 inline occurrences.

## Access and persistence

In private-link mode, a fragment in the author or respondent URL holds a random capability. Possession grants the corresponding access. The client sends it as an Authorization header on same-origin API calls. SQLite stores its digest. Keep author links private and share each respondent link only with its intended holder. The server accepts changes only to the role's own resource. It constructs completed documents from the invitation's stored template and validated answers. Submitted responses are read-only.

Anyone who can reach the private-link workspace on the local machine can create templates. Authors can label and revoke individual links under **Respondent invitations**, including after reopening their workspace. Revocation prevents subsequent reads, saves and submissions through that link. A submitted document remains available to the author. Content already displayed or downloaded can remain with the recipient.

## Connect your application's accounts

The default workspace uses private links. To run with accounts, set `FOUNTAIN_TEMPLATE_ACCOUNTS` to the path of a server-side ES module with the following default export. These example service calls belong to the host application.

```js
import { sessions, directory } from './application-services.mjs';

export default {
  signInUrl: 'https://app.example.com/login',
  async authenticate(request) {
    const user = await sessions.verify(request);
    return user && { id: user.subject, canCreateTemplates: user.permissions.includes('author') };
  },
  async resolveRecipient(authorId, handle) {
    const member = await directory.findInvitableMember(authorId, handle);
    return member?.subject;
  },
};
```

Use stable subjects unique across your tenants and identity providers. The server consults the host session on every API request. The directory callback controls which accounts the author can invite. The optional sign-in URL takes a signed-out visitor to the host login page. If a reverse proxy serves the workspace over HTTPS, set `FOUNTAIN_TEMPLATE_ORIGIN` to its exact origin, preserve the Host header, and route same-origin requests to the loopback listener. The host owns session management and invitation delivery.

After signing in, authors can reopen **Your templates**. A recipient opens **Assigned responses**, fills the form and submits it. The document address contains only a record ID. Forwarding that address grants no access. Saved private-link documents and account-owned documents can coexist in the database. Each is available through its original access mode. An application can also pass `{ accounts, publicOrigin }` as the third argument to `createWorkspace` when embedding the server.

## Verify the workflow

`npm test` exercises the real HTTP and SQLite boundaries, including revision conflicts, two invitations, denied role changes, required rich text, variable reuse, and recovery after a database restart.

The FountainJS repository runs the installed starter browser journey against Chromium, Firefox and WebKit as part of its starter audit.

### Calculate elapsed days

Add two single-line date fields. Choose **Add elapsed days**, label the result and select its start and end fields. Place the cursor in fixed instructions, select the calculation under **Field to insert**, then choose **Insert field**. You can insert the same result in several places.

The result updates as the respondent types YYYY-MM-DD dates. Matching dates give zero and an earlier end date gives a negative count. Both optional dates may be empty. An incomplete or invalid pair can be saved as a draft and must be corrected before submission. Each invitation keeps its issued calculation. The server derives the result from the answers and the completed document stores ordinary formatted text.
