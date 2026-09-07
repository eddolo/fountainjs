# Vue 3 integration

**Unreleased:** this entry is available in the repository build and deployed
demo. Do not expect it in the existing npm release until the next verified
publication. Build this checkout with `pnpm build` to try the package locally.

The optional `fountainjs-editor/vue` entry supplies `useFountain`,
`useFountainState`, and `FountainEditor`. Vue is an external optional peer
(`>=3.5 <4`), not bundled into the editor engine. Plain DOM, React, and server
consumers do not need to install it. The binding uses Fountain's existing
transactions, schema, history, plugins and DOM view; it is not a second engine.

## Start a component

Install `fountainjs-editor` and `vue` in your Vue application. With Vue's normal
single-file-component tooling:

```vue
<script setup lang="ts">
import { StarterKit, toggleMark } from 'fountainjs-editor'
import { FountainEditor, useFountain, useFountainState } from 'fountainjs-editor/vue'
import 'fountainjs-editor/styles.css'

const editor = useFountain(() => ({
  schema: StarterKit.schema,
  plugins: StarterKit.plugins,
  content: { type: 'doc', content: [{ type: 'paragraph' }] },
}))
const state = useFountainState(editor)
const options = { ariaLabel: 'Article editor', placeholder: 'Start writing…' }
const bold = () => { if (editor.value) toggleMark(editor.value, 'strong') }
</script>

<template>
  <button :disabled="!editor" @mousedown.prevent @click="bold">Bold</button>
  <FountainEditor :editor="editor" :options="options" class="my-editor-host" />
  <p>{{ state?.doc.textContent.length ?? 0 }} characters</p>
</template>
```

Vue unwraps refs in templates; JavaScript uses `.value`. The library component
uses render functions and does not require a runtime template compiler. It
accepts all `EditorViewOptions` through the `options` prop, including upload,
paste-reporting, block-handle, placeholder, accessibility and virtualization
settings. The optional stylesheet and every surrounding control are replaceable.

## Ownership and reactive updates

- Call `useFountain` synchronously in `setup()`. It returns a shallow, readonly
  editor ref, initially `null`. It creates exactly one editor on client mount
  and destroys that editor after its component's child views unmount.
- A configuration factory runs only on client mount. Configuration is initial,
  not watched: changing a prop must not silently replace someone's document or
  restart collaboration. Use transactions for content changes; use a keyed owner
  component when intentionally replacing the entire editor/configuration.
- `useFountainState(editorOrRefOrGetter)` subscribes to final immutable engine
  state. It switches subscriptions synchronously when the editor changes and
  unsubscribes on scope disposal. It works in component setup or an explicit
  Vue `effectScope`; using it outside a scope throws instead of leaking.
- Neither composable deeply proxies editor classes, schemas or document nodes.
  Keep externally created editor instances in `shallowRef`, not a deep `ref` or
  `reactive` object. Store/export `editor.getJSON()` when you need portable data.
- `FountainEditor` owns only the DOM view. Passing an externally owned editor
  does **not** transfer ownership; its creator must eventually destroy it.
  Passing `null` removes the view; replacing the editor mounts the new one.
- A `v-if` on `FountainEditor` can hide/reopen the view while its parent retains
  the engine, document and history. A `v-if` on the owning component destroys
  the engine. Persistence across navigation is an application decision, not an
  automatic save service.
- Vue `KeepAlive` deactivation retains the editor and its providers until the
  cached owner is actually unmounted. It is not a provider pause/disconnect
  signal; implement any deliberate offline policy at the provider boundary.

Vue manages the host element, never the contenteditable descendants. Do not put
Vue children or a `v-model` HTML string into `FountainEditor`. Changes already
flow through Fountain transactions; reflecting every state update back through
a document replacement would corrupt ordinary undo/selection behavior.

Keep `options` stable during ordinary re-renders. Replacing the options object
intentionally rebuilds the view (not the engine/history); it is not a live
deep-options watcher. HTML fallthrough attributes such as `class` apply to the
host. Use `options.ariaLabel` and `options.attributes` for the editable element.

## Focus, saving, collaboration and read-only views

A component template ref typed as `FountainEditorHandle` exposes `view` and
`focus('current' | 'start' | 'end')`. Guard the ref before mount or after unmount.
Prevent the default mouse-down on formatting controls to keep native selection;
keyboard activation uses the engine's stored selection.

Use the `EditorConfig.onUpdate(state, transaction)` callback to save accepted
document changes (`transaction.docChanged`), with host-owned debouncing, error
handling and conflict protection. The demo inspector is not a storage backend.
Pass collaboration plugins in the same configuration as any other Fountain
surface; keep provider identities stable and use the documented adapter
replacement API when changing rooms, rather than rebuilding on every Vue render.

Set `editable: false` in the engine configuration for a read-only DOM view.
This is a presentation/input policy, **not authorization**. Enforce access in
your storage/provider backend. The initial editable policy is not a reactive
component prop; an intentional change requires an appropriately owned editor.

## Server rendering

The Vue entry can be imported and server-rendered without `document`, `window`,
or a fake DOM. It renders an empty host, with a null editor/state. It does not
evaluate the configuration factory or connect plugins on the server. Hydration
mounts the editable view on the client. For document HTML in server output, use
the separate headless serializer/reader projection—not this editing component.
See Vue's [lifecycle contract](https://vuejs.org/api/composition-api-lifecycle)
and [shallow reactivity](https://vuejs.org/api/reactivity-advanced.html).

## Working example and verification

[Vue runbook demo](https://eddolo.github.io/fountainjs/demos/vue-runbook.html)
uses the public package entry and a real Vue app for the editor, toolbar and
reactive inspector. The surrounding gallery navigation is React and is labelled
as such. Vue loads dynamically for that demo, not for all other editor surfaces.
Its source is `examples/react-app/src/vue-runbook.ts`.

`tests/vue-lifecycle.test.ts` covers ownership, provider cleanup, unproxied state,
transactions/history, editor replacement, view options, effect-scope cleanup,
hydration and KeepAlive caching.
`tests/vue-ssr.test.ts` runs in pure Node. The browser journey types and formats
using native keyboard input, toggles tasks, hides/reopens the view, checks undo,
exports Markdown, creates/resizes/deletes/recovers a table, toggles quotes, and
navigates away/back in Chromium, Firefox and WebKit. The same journey has a
recorded manual-audit entry. Separate touch-viewport tests exercise task toggles,
hide/reopen and history; these are emulation, not physical-device IME evidence.

This delivers the Vue binding, not a Vue equivalent of every optional React UI
panel. A separate [Svelte binding](SVELTE.md) is also available in the repository
build, alongside the [Angular binding](ANGULAR.md). Equivalent framework UI suites remain open; every
framework can already use the engine commands and DOM/Web Component boundaries.
