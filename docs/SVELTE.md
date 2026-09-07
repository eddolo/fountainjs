# Svelte 5 integration

**Unreleased:** this entry is available in the repository build. Do not expect
it in the existing npm release until the next verified publication. Build the
checkout with `pnpm build` to try it locally.

`fountainjs-editor/svelte` supplies a client lifecycle helper, a readable state
store and a native Svelte action. It uses the same Fountain document engine,
commands, history and DOM view as the other surfaces. Svelte is an external,
optional peer (`>=5.46.4 <6`), not a dependency of the core, React or Vue entries.

## Start a component

Install Fountain and Svelte in your Svelte application. Use its normal Svelte
compiler (including SvelteKit or Vite's Svelte plugin):

```svelte
<script lang="ts">
  import { StarterKit, toggleMark } from 'fountainjs-editor';
  import { createFountain, fountainState, fountainEditor } from 'fountainjs-editor/svelte';
  import 'fountainjs-editor/styles.css';

  const editor = createFountain(() => ({
    schema: StarterKit.schema,
    plugins: StarterKit.plugins,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  }));
  const snapshot = fountainState(editor);
  const options = { ariaLabel: 'Article editor', placeholder: 'Start writing…' };
</script>

<button
  disabled={!$editor}
  onmousedown={event => event.preventDefault()}
  onclick={() => { if ($editor) toggleMark($editor, 'strong'); }}
>Bold</button>
<div use:fountainEditor={{ editor: $editor, options }}></div>
<p>{$snapshot?.doc.textContent.length ?? 0} characters</p>
```

`$editor` and `$snapshot` are Svelte's store auto-subscriptions. They are not
deeply reactive copies of Fountain classes. The host element belongs to Svelte;
Fountain owns its editable descendants. Do not render Svelte children or bind
an HTML string inside the host. Dispatch commands/transactions instead of
replacing the document on every reactive update.

## Ownership and updates

- Call `createFountain(configOrFactory)` during component initialization. It
  returns a read-only `Readable<Editor | null>`, initially null. Its factory runs
  on client mount, once per owning component; unmount destroys that engine.
- Configuration is initial, not watched. Ordinary prop changes must not reset
  a document, restart a provider or erase undo history. Use engine transactions
  for edits; use an explicit keyed owner component for a new editing session.
- `fountainState(editorStore)` returns `Readable<EditorState | null>`. It
  subscribes lazily while observed, shares one engine subscription across its
  observers, switches when the source changes, and releases the subscription
  when its last observer leaves. It never owns/destroys the supplied editor.
- `fountainEditor` owns only an `EditorView`. Its parameters are `{ editor,
  options? }`. Null removes the view; replacing the editor or options object
  rebuilds the view. Equivalent editor/options identities retain the existing
  DOM. Keep options stable unless rebuilding is intentional.
- Hiding just the action's host with `{#if visible}` retains the owner's
  document and undo history. Removing the owner component ends the session.
  Persistence across routes is application-owned; there is no automatic save.
- For an externally managed editor, use your own Svelte readable/writable store
  and the same action/state helper. Its creator remains responsible for disposal.

All `EditorViewOptions` pass through, including accessibility, paste reporting,
uploads, block handles and virtualization. `options.ariaLabel` labels the
editable region; a class on the host styles its wrapper. Every surrounding
control and stylesheet is replaceable.

For imperative integrations the action result exposes `view`,
`focus('current' | 'start' | 'end')`, `update(parameters)` and `destroy()`.
Destroy is idempotent and prevents subsequent action updates from remounting.
Formatting buttons should preserve the native mouse selection as above;
keyboard activation uses the engine's stored selection.

## Saving, collaboration and reader policy

Save accepted document changes with `EditorConfig.onUpdate`, checking
`transaction.docChanged`. Debouncing, errors, revisions and storage are host
responsibilities. Use `editor.getJSON()` for portable data; the demo inspector
is not a backend.

Supply collaboration plugins in the same configuration used by other Fountain
surfaces. Keep provider identities stable. For room changes, use the documented
collaboration adapter replacement boundary rather than recreating an editor on
every state update. The Svelte helper does not add a hosted collaboration service.

`editable: false` creates a read-only editing surface. This is not authorization:
enforce access in the backend/provider. For a finished reader presentation,
choose the reader projection and omit author controls, rather than merely
disabling this demo toolbar.

## Server rendering and tooling

The entry imports in pure Node without a fake DOM. During Svelte server
rendering the editor and snapshot remain null, the host is empty, and the
configuration factory does not run. Editing starts on client mount. To include
document content in server HTML, use the headless serializer/reader projection.
Do not expect an empty editing host to render an article for indexing.

Prefer the ESM entry with Svelte's bundler. The CommonJS entry imports Svelte's
ESM peer and therefore requires a runtime with synchronous ESM loading; its
package smoke test runs on Node 24. It is not a promise of CJS support on every
historical Node 20 release.

Repository contributors run `pnpm typecheck`, which includes `svelte-check` for
the actual demo components. The private `tools/svelte-check` workspace pins
TypeScript 6 for that tool's compiler-API requirement; the engine keeps its
existing TypeScript 7 compiler. The checker workspace is development-only and
is not part of the published editor package.

See Svelte's [lifecycle documentation](https://svelte.dev/docs/svelte/lifecycle-hooks),
[store contract](https://svelte.dev/docs/svelte/svelte-store) and
[action contract](https://svelte.dev/docs/svelte/use).

## Working demo and evidence

The [Svelte report](https://eddolo.github.io/fountainjs/demos/svelte-report.html)
uses compiled Svelte components for the toolbar, DOM action, state inspector
and owner lifecycle. The surrounding gallery is React; it dynamically mounts
the Svelte application. Source: `examples/react-app/src/SvelteReport.svelte`,
`SvelteReportEditor.svelte` and `svelte-report.ts`.

`tests/svelte-action.test.ts` exercises store subscriptions, action identity,
external ownership, options, focus, paste reporting and disposed editors.
`tests/svelte-ssr.test.ts` compiles and renders a real Svelte component in pure
Node using the built public entry. The browser journey types into tables,
adds rows/columns, checks full-document retention across view remounts,
undoes/redoes, applies bold and quotes, inspects Markdown and repeatedly resets
the owning component in Chromium, Firefox and WebKit. It also has a recorded
audit entry. Touch-viewport tests check editing, history, remount and reset;
these are emulated devices, not physical-device keyboard/IME evidence.
A separate compiled browser fixture verifies that custom block views dispose
while their owned engine is still alive, over five mount/unmount cycles.

This is a first-party Svelte binding, not a Svelte version of every optional
React UI panel. Equivalent framework-specific UI suites and an Angular binding
remain separate parity work.
