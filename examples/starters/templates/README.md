# FountainJS document templates

Create a reusable handoff, invite respondents, and read their completed documents. This project uses the published FountainJS beta for rich editing, validation and rendering, with a Node HTTP server and SQLite for persistence.

Use Node 24.12 or newer. Extract the ZIP, open a terminal in the directory containing `package.json`, and run:

```sh
npm install
npm start
```

Open the local address printed in the terminal. The server binds to `127.0.0.1`. Set `PORT` to choose another local port and `FOUNTAIN_TEMPLATE_DB` to choose another SQLite file. By default `workspace.sqlite` sits beside the application. Restarting with the same database and port preserves your links and records.

## Create and use a template

1. Choose **Create template** and bookmark the author page. Add fixed instructions and answer fields. Rich-text fields support paragraphs, bold and italic. To reuse a single-line answer in a sentence, place the cursor in the instructions, choose **Field to insert**, and press **Insert field**. Undo and redo work in the instructions toolbar. **Repeat an answer** places an entire answer in its own block and also supports rich text.
2. Save the template and choose **Create respondent link**. Each invitation has its own copy of that revision, draft and submission. Later template edits apply to future invitations.
3. Open the respondent link in another browser session on the same machine. Fill in fields, save a draft, close it and reopen the link. Required fields are checked on submission. The reader and downloaded Fountain JSON include the fixed instructions, answers and any repeated values.
4. Return to the author page and choose **Refresh submissions**. Read a completed response. Private drafts become visible to the author upon submission.

**Download template JSON** exports the current definition. **Open template file** creates an independent copy with a new author link. Invitations, access keys and responses belong to the original workspace.

The template and final document have different file structures. The template envelope contains ordered protected prose, field definitions and references. The final document uses ordinary Fountain heading, paragraph and text nodes. Text fields allow one line up to 4,000 characters. Rich fields allow 128 paragraphs and 16,000 characters with bold and italic marks. The server validates submitted content before publication.

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

A fragment in the author or respondent URL holds a random capability. Possession grants the corresponding access. The client sends it as an Authorization header on same-origin API calls. SQLite stores its digest. Keep author links private and share each respondent link only with its intended holder. The server accepts changes only to the role's own resource. It constructs completed documents from the invitation's stored template and validated answers. Submitted responses are read-only.

The local host can create templates. Authors can label and revoke individual links under **Respondent invitations**, including after reopening their workspace. Revocation prevents subsequent reads, saves and submissions through that link. A submitted document remains available to the author. Content already displayed or downloaded can remain with the recipient. For a multi-user deployment, integrate your application's authenticated sessions, invitation delivery, storage policy and HTTPS origin. The starter's loopback URLs and checks are specific to local use.

## Verify the workflow

`npm test` exercises the real HTTP and SQLite boundaries, including revision conflicts, two invitations, denied role changes, required rich text, variable reuse, and recovery after a database restart.

The FountainJS repository runs the installed starter browser journey against Chromium, Firefox and WebKit as part of its starter audit.
