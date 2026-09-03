# Lean 4 in FountainJS

Lean support does not require FountainJS, an application developer, or an end
user to operate a public language server. The first-party `LeanExtension` is
useful with no provider and makes every execution boundary explicit when a
provider is added.

## What works without a provider

Source-only mode is the default. It provides:

- portable `code_block` content with `language: "lean"`;
- `insertLeanBlock` and `setLeanSource` commands;
- backslash Unicode expansion on Tab inside Lean blocks, including `\forall`,
  `\exists`, `\to`, `\Nat`, and common Greek letters;
- Lean/Lean 4 support in the supplied static syntax highlighter;
- JSON, Markdown fenced-code, HTML, and plain-text interchange;
- a `LeanController` whose no-provider checks return an explicit `not-checked`
  result rather than pretending the proof was verified.

No source leaves the editor in this mode. FountainJS does not download Lean,
spawn a process, read the file system, or choose a server.

```ts
import {
  LeanExtension, StarterKit, composeExtensions, createEditor,
} from 'fountainjs-editor'

const kit = composeExtensions([...StarterKit.extensions, LeanExtension])
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins })
kit.commands.insertLeanBlock(editor, 'example : 1 = 1 := rfl')

const controller = kit.services.lean.createController(editor)
const result = await controller.check()
// { status: 'not-checked', diagnostics: [], ... }
```

## Provider choices

An application may offer one or more of these choices to its users. None is a
global default.

| Mode | Where Lean runs | Good fit |
| --- | --- | --- |
| Source-only | Nowhere | Writing, teaching material, storage, interchange |
| Local | The user's computer | Privacy, full local projects and dependencies |
| Remote | An endpoint selected by the host or user | A team's own Lean service |
| Managed | A named third-party service | Users who want zero setup |
| One-shot | A callable checker, local or remote | Verify/save workflows without a persistent LSP |

A local web application normally needs a small authenticated loopback bridge
to the user's Lean installation. Desktop shells and IDE extensions may invoke
Lean directly. Lean's server mode can be launched in the selected Lake project
environment with `lake env lean --server`; the bridge—not FountainJS core—owns
process lifecycle, workspace access, and conversion between transport and the
provider interface. See Lean's official [server protocol
documentation](https://github.com/leanprover/lean4/blob/master/src/Lean/Server/README.md)
and [installation guide](https://lean-lang.org/install/).

## Attaching a provider

`createLeanProvider` accepts a host adapter with visible trust metadata and any
subset of check, goals, hover, and completion operations. `LeanController`
builds a frozen request containing only the chosen Lean block, its position,
URI, and version. Line and character positions use JavaScript/Language Server
Protocol UTF-16 code units; adapters for other encodings normalize at this
boundary.

```ts
import { createLeanExtension, createLeanProvider } from 'fountainjs-editor'

const provider = createLeanProvider({
  descriptor: {
    id: 'my-local-lean',
    label: 'Lean on this computer',
    mode: 'local',
    dataDestination: 'device',
    endpoint: 'http://127.0.0.1:32100',
  },
  check: (request, { signal }) => localBridge.check(request, { signal }),
  goals: (request, { signal }) => localBridge.goals(request, { signal }),
  hover: (request, { signal }) => localBridge.hover(request, { signal }),
  complete: (request, { signal }) => localBridge.complete(request, { signal }),
})

const lean = createLeanExtension({ provider })
```

Provider results are size-bounded and structurally validated. Invalid ranges
are rejected. Starting another request aborts the earlier one, and a response
is rejected as stale if its block moved or its source changed. Diagnostics,
goals, hover text, completions, endpoint details, and credentials never become
document JSON.

## Trust and credentials

The editor must show `descriptor.label`, `mode`, `dataDestination`, endpoint,
and any third-party `dataUseNotice` before a user enables a provider. FountainJS
enforces these baseline rules:

- `local` endpoints must be HTTP(S)/WebSocket loopback addresses and declare
  that source stays on the device;
- non-local endpoints must use HTTPS or secure WebSockets;
- third-party destinations must include a data-use notice;
- there is no built-in endpoint, automatic discovery, or random public server.

For a loopback bridge, bind only to loopback, require an unpredictable session
secret, validate browser origins, scope the process to a user-approved project,
and expose fixed Lean operations rather than arbitrary shell or file-system
access. Keep tokens in application runtime storage or an operating-system
credential store—not in FountainJS JSON, HTML, Markdown, or provider metadata.

The official `lean4web` project also uses a server-side Lean process rather than
turning the full current toolchain into an in-browser drop-in replacement; see
its [architecture and limitations](https://github.com/leanprover-community/lean4web/blob/main/README.md).

## Product UI contract

`LeanController.subscribe()` and `getSnapshot()` are framework-neutral. A host
can render provider state, diagnostics, goals, hover, and completions in React,
Vue, Svelte, Angular, a Web Component, or plain DOM. Calling `dispose()` aborts
work and removes listeners. Providers are host-owned and reusable by default;
pass `{ disposeProvider: true }` as the controller's third constructor argument
only for a controller-owned provider. Applications can build or replace the
presentation today without forking the editor engine; the parity programme
tracks supplied diagnostic and InfoView primitives separately from this API.
