# Retained provider session ownership audit

Local audit on 2026-11-10, following the retained-default adoption in `2c28c0ea`. This is a source correction and test record, not a publication claim.

## Finding

`src/yjs/retained-adapter.ts` kept the caller's entire mutable options object and reread its `document`, `provider`, and awareness bindings throughout the adapter lifetime. Although TypeScript declares those option properties readonly, a JavaScript host can reuse or modify its original configuration object. The older explicit XML adapter already captured these bindings at construction.

Three reproducible retained-adapter failures followed:

1. Reassigning the options to a different room after connecting made disconnect target the replacement provider and awareness. The actual connected provider and presence listener remained attached.
2. Replacing `provider.awareness` made cleanup remove a listener from the replacement object, leaving the originally attached awareness listener and published cursor behind.
3. Reassigning `options.document` while admission awaited its checkpoint made admission install the checkpoint into the replacement `Y.Doc`. The adapter then failed because its root fragment still belonged to the original document. This could modify an unrelated host document even though the original session reported an error.

The default `/yjs` and the experimental retained entry both reproduced these failures. Changing an options object is not a supported way to switch an existing collaboration session, but it must not redirect pending work or cleanup into another room.

## Correction

The constructor now captures only the document, provider, capture timeout, resolved awareness object, and structured-map name it needs later. Existing normalized user/structured-attribute definitions and admission snapshots remain in place. It neither freezes nor clones host-owned `Y.Doc`, provider, or awareness instances. Asynchronous admission, reconnect, local transactions, and disconnect all retain the original session bindings.

Changing rooms still requires the explicit collaboration-session replacement API. The correction does not migrate XML storage, change the retained wire protocol, or grant a provider permission to initialize an unadmitted room.

## Evidence

`tests/yjs-options-ownership.test.ts` adds eight cases:

- Default, experimental retained, and explicit legacy: reuse the options object for another document/provider/awareness after connection; verify the original provider disconnects, original listeners and cursor clear, replacement objects stay untouched, and reconnect returns to the original room.
- The same three entry points: replace the provider's awareness object and verify cleanup still targets the object originally subscribed.
- Default and experimental retained: change document/provider bindings during awaited admission; verify admission completes on the original room, the unrelated document's encoded bytes remain unchanged, and the replacement provider never connects.

The six retained cases reproduced the defect before the correction. All eight pass with the correction. Together with `yjs-provider-initialization`, `yjs-default-adoption`, `yjs-retained-adapter`, and `yjs-collaboration`, **113 source tests pass** in one worker. Release build, packed-consumer, and native-browser checks are recorded separately by the release audit.

## Status subscriber follow-up

A synchronous editor subscriber could cancel a connection while the
collaboration core was publishing `connecting`. The adapter could still
start its provider if the editor and saved room already matched. A mismatch
instead left the editor in an error state after cancellation. In the reverse
direction, reconnecting from `disconnected` could invoke the new connection
before the old disconnect hook ran. A local update that switched rooms could
also send its subsequent selection to the retired adapter.

The collaboration core now checks session ownership after publishing the
connection request and after sending a local edit. It retires the old context
and calls the disconnect hook before announcing disconnection. A room chosen
by a synchronous subscriber takes precedence over the earlier request.

Six source regressions reproduce these cases against the parent core, including
two cases using the default Yjs adapter. Nine recorded journeys through the
homepage verify switching both editors in place, preserving an unsent draft,
and continuing after an offline merge across Chromium, Firefox and WebKit.
The package build, bundle budgets, public API, packed imports, headless
boundary and framework types pass. The first broader source run passed 991
of 994 tests. Three storage and migration cases hit the default 5-second
timeout. The three passed against the parent core at the default limit and
against the candidate in a separate diagnostic run. All 994 passed when the
full candidate suite was rerun at the original limits.
[Collaboration tests](../tests/collaboration.test.ts)
· [Default Yjs startup tests](../tests/yjs-provider-initialization.test.ts)

## Private edits after explicit disconnect

The retained adapter used to take a new baseline when reconnecting, after
private edits had already been made. A room loaded from an initialized
`Y.Doc` could replace those edits immediately. Checkpoint admission could
also treat the private draft as an unchanged opening template. The shared
UndoManager still accepted commands after the editor had detached.

The adapter now retains the last attached document as the baseline across
retries. A draft that differs from both that baseline and the incoming room
blocks the join before the provider starts. The tests check both ways out of
that state, restoring the last attached document or choosing the current
shared version. Shared undo and redo are available again after rejoining.

Five source regressions failed on the previous implementation. The compiled
default package also lost the private text in the Chromium browser
reproduction. The updated workflow types two different edits, refuses the
unsafe rejoin, downloads and verifies the private JSON, opens the reviewed
shared version, and confirms that new typing reaches the other editor.
The three desktop browsers pass this workflow and the existing room recovery
matrix for 24 recorded checks. Three additional homepage recordings confirm
that pausing the network with the adapter attached still merges offline edits.
The declaration review found three private member changes in each module
format and identical exported signatures. All 999 collaboration source tests,
packed imports, headless and framework types, and existing bundle limits pass.
[Recovery workflow](../tests/manual/yjs-detached-draft-real.spec.ts)
· [Integration guidance](COLLABORATION.md#private-drafts-after-disconnecting)

## Package boundary review

The current package requires `yjs >=13.6.32 <14` and exports the retained default and explicit XML compatibility entry separately. The packed-package fixture exercises the default class through the ESM and CommonJS entry points; the explicit legacy entry remains separately available. Inspected application examples and packaging scripts do not treat the retained marker fragment as a legacy XML document tree. Existing stored XML still requires an explicit legacy open or an authority-controlled migration, rather than an import-path substitution.

The DOCX `publint` warning encountered during release inspection is unrelated to this Yjs correction. `artifacts/docx-publint-format-proof-20261110.json` records the exact bundle hash, the false-positive regular-expression match, and successful CommonJS loading. Its format detector mistakes the diagnostic text `export defaults` for ESM syntax after naive comment stripping hides actual CommonJS code. No valid package extension or emitted code was changed to satisfy that heuristic.
