# FountainJS extension authoring and compatibility

An extension is a framework-neutral, named bundle of document types, behavior,
commands, formats, or host services. The same extension can be composed into a
plain DOM editor, Web Component, React application, headless Node.js process,
or another framework adapter. UI bindings may consume an extension, but they
are not part of its core contract.

This guide covers independently published extensions. Built-in extensions use
the same composition path, although older built-ins may not yet carry public
package metadata.

## Create an extension package

Run the generator from any project using FountainJS:

```sh
npx fountainjs-editor create-extension ./fountain-callout --name callout
cd fountain-callout
npm install
npm run check
```

Use `--package @scope/fountain-callout` for a scoped npm name. `--dry-run`
prints every destination without creating anything. The command refuses to
write into a non-empty directory and never offers a force/overwrite mode.

The generated package includes:

- a typed node and command that can be replaced with real behavior;
- extension API and package version metadata;
- a peer dependency on FountainJS rather than a bundled editor copy;
- a document and command conformance test;
- TypeScript build settings, a README, and an MIT license.

The complete checked-in [callout example](../examples/extensions/callout-extension.ts)
uses the same contract without any frontend framework.

## Manifest and dependency contract

Use `defineExtension` for every distributed extension:

```ts
import {
  FOUNTAIN_EXTENSION_API_VERSION,
  defineExtension,
  insertBlock,
} from 'fountainjs-editor'

export const CalloutExtension = defineExtension({
  name: 'acme-callout',
  manifest: {
    version: '1.2.0',
    apiVersion: FOUNTAIN_EXTENSION_API_VERSION,
    displayName: 'Acme callout',
    description: 'Adds a portable callout block.',
    license: 'MIT',
    homepage: 'https://example.com/acme-callout',
    requires: ['fountain-core'],
  },
  nodes: {
    acme_callout: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['aside', { 'data-acme-callout': '' }, 0],
    },
  },
  commands: {
    insertAcmeCallout: (editor, text = '') =>
      insertBlock(editor, 'acme_callout', {}, text),
  },
})
```

The runtime name is the dependency identity. It starts with a lowercase letter
and may contain lowercase letters, numbers, `.`, `_`, `:`, or `-`. It does not
have to equal the npm package name, but it must remain stable after release.

`manifest.version` uses SemVer 2 syntax and should equal the containing package
version. `apiVersion` describes the extension object contract, not the npm
package version. FountainJS rejects an unknown API version before composition.
Metadata strings are bounded, homepages must use HTTPS, and requirements must
be unique valid runtime names.

`requires` is intentionally explicit and ordered. Every required extension
must occur earlier in `composeExtensions`:

```ts
const kit = composeExtensions([
  CoreExtension,       // runtime name: fountain-core
  CalloutExtension,
  ProductUIExtension,
])
```

A missing or incorrectly ordered requirement reports the dependent extension
and every missing runtime name. Duplicate extension names always fail.
Duplicate node, mark, command, format, or service names also fail unless the
host explicitly sets `onConflict: 'replace'`; published extensions should not
silently request that policy.

## Contributions

An extension may contribute any combination of:

| Contribution | Role | Portability rule |
| --- | --- | --- |
| `nodes` | Block or inline document structure | Define validation, safe output, readable text, and import rules where relevant. |
| `marks` | Inline formatting | Keep attributes portable and validate every externally supplied value. |
| `plugins` | State, input hooks, decorations, lifecycle | Release listeners and resources in `onDestroy`; keep persisted data in the document or an explicit adapter. |
| `commands` | Reusable editor operations | Return `false` when unavailable; keep document effects inside dispatched transactions so dry-runs and chains remain atomic. |
| `formats` | Parse/serialize boundaries | Validate imported trees and disclose lossy projections. |
| `services` | Host-owned integrations | Treat values as dependency injection; do not assume React, a network vendor, global credentials, or Fountain-hosted infrastructure. |

Document JSON is the lossless persistence boundary. Custom nodes and marks only
work when every writer/reader composes a compatible schema. HTML, Markdown, and
text may be lossy unless the extension contributes explicit rules or formats.

## Automated conformance

The isolated `fountainjs-editor/testing` entry contains no test-runner or React
dependency. Call it from Vitest, Jest, Node's test runner, or a release script:

```ts
import { assertExtensionConformance } from 'fountainjs-editor/testing'
import { CalloutExtension } from '../src/index.js'

const document = {
  type: 'doc',
  content: [{
    type: 'acme_callout',
    content: [{ type: 'text', text: 'Test fixture' }],
  }],
} as const

assertExtensionConformance(CalloutExtension, {
  documents: [{ name: 'basic callout', document }],
  commands: [{
    name: 'insertAcmeCallout',
    args: ['Another'],
    document,
    expectAccepted: true,
    expectDocumentChange: true,
  }],
})
```

`checkExtensionConformance` returns the same immutable report instead of
throwing. Its inventory lists every contribution, and its checks report:

- manifest syntax and extension API compatibility;
- use of the immutable `defineExtension` boundary;
- dependency order and contribution collisions;
- schema validation plus JSON round-trip for every document fixture;
- command existence, expected acceptance, dry-run state isolation, update
  isolation, and optional real document-change behavior;
- warnings for custom commands or document structures without fixtures.

A warning does not fail the report; a failed check does. Supply a fixture for
every meaningful attribute/content variant, malformed boundary, and command.
The conformance suite verifies the shared contract—it does not replace browser,
accessibility, collaboration, format, performance, or product-policy tests.

## Check a complete installation

Per-extension conformance cannot reveal a collision that only exists when two
packages meet. Export the ordered third-party set from a small module:

```js
// fountain.extensions.mjs
import { CalloutExtension } from '@acme/fountain-callout'
import { WorkflowExtension } from '@acme/fountain-workflow'

export default [CalloutExtension, WorkflowExtension]
```

Then run the installation doctor before the application starts:

```sh
npx fountainjs-editor doctor ./fountain.extensions.mjs
```

`checkExtensionCompatibility(extensions, options?)` and
`assertExtensionCompatibility(...)` expose the same behavior programmatically
from `fountainjs-editor/testing`. Core is included as the default base. The
doctor aggregates invalid or mutable definitions, missing manifests, duplicate
runtime names, absent or incorrectly ordered requirements, and collisions in
nodes, marks, commands, formats, and services. The generated package includes a
doctor module and runs it in `npm run check` after its build and conformance
test. The check script calls its local tools directly, so it can be launched by
npm, pnpm, or Yarn. The module is imported and therefore executes normal JavaScript; point the
doctor only at configuration and extension packages you already trust enough to
load in the application. It does not sandbox third-party code.

## Compatibility policy

| Boundary | Guarantee |
| --- | --- |
| Extension API | `apiVersion` must match exactly. A new value means the object contract is incompatible and requires an extension update. |
| FountainJS package | While FountainJS is `0.x`, a minor release may contain breaking public-API changes. Pin or use an explicit tested peer range. The stable-release programme will tighten this before `1.0`. |
| Extension package | Follow SemVer. Keep `manifest.version` synchronized with `package.json`; change the runtime name only for a deliberately separate extension identity. |
| Schema and JSON | Node/mark names and stored attributes are durable data. Add migrations before renaming/removing them; reject unknown or malformed data rather than guessing. |
| Frameworks | Core extensions depend on `fountainjs-editor`, not `fountainjs-editor/react`. Publish optional UI adapters as separate entry points or packages. |
| Peers | Declare FountainJS as a peer dependency so the host owns one engine instance. Optional renderer/provider libraries should also remain peers. |
| ProseMirror/Tiptap | There is no drop-in compatibility. Their schemas, positions, transactions, plugins, NodeViews, and extensions must be intentionally ported and retested. |

Compatibility is checked at runtime as defense in depth, but package managers
remain responsible for satisfying peer ranges. Unknown persisted node types
cannot be made safe by a manifest alone.

## Diagnosing failures

| Message | Meaning | Fix |
| --- | --- | --- |
| `incompatible with Fountain extension API` | The package targets another extension contract. | Install a compatible version or update and retest the extension. |
| `requires earlier extension` | A dependency is absent or later in the list. | Add/reorder the named runtime extensions. |
| `conflicts with an existing …` | Two extensions own the same contribution name. | Rename the contribution, remove one extension, or make an intentional host-level replacement. |
| `Document fixture …` | The fixture is invalid or did not survive serialization. | Fix the schema/spec, migration, or fixture; do not weaken validation. |
| `mutated observable state during a dry run` | A command escaped the transaction batch. | Route document changes through `editor.dispatch` and move external effects after an actual accepted command. |

## Release checklist

Before publishing an extension:

1. Run the conformance suite against every node, mark, and command variant.
2. Test undo/redo, selections, paste, IME, keyboard, touch, and teardown where applicable.
3. Test every supported browser and framework adapter against the packed package.
4. Test JSON and every claimed interchange format, including old stored data.
5. Verify collaboration only with clients using compatible schemas.
6. Declare security, network, credential, upload, and persistence ownership.
7. Pack the tarball and inspect its files, ESM/CommonJS/types exports, peers, and size.
8. Publish a migration note for any change to stored data or public behavior.

Never place provider secrets in an extension, browser bundle, fixture, repository,
or manifest. Network-backed services should accept host-owned authenticated
adapters and fail closed when responses do not validate.
