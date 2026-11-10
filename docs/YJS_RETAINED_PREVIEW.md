# Retained collaboration guide

**Current local branch, 2026-11-10.** The ordinary
`fountainjs-editor/yjs` entry now uses the retained adapter. This is an
unreleased beta compatibility change. Existing XML rooms require the explicit
`fountainjs-editor/yjs/legacy` entry or a deliberate authority-backed migration.
Changing an import never converts stored data. Read the
[default adoption and migration contract](YJS_DEFAULT_ADOPTION.md) before
upgrading an application.

The original preview entry remains available with its explicit retained names
and checkpoint helpers:

```ts
import {
  createRetainedYjsCollaborationExtension,
  captureRetainedCheckpoint,
  restoreRetainedCheckpoint,
  type RetainedAdmission,
  type RetainedAdmissionLease,
  type RetainedCheckpoint,
  type DocumentRoomSnapshot,
} from 'fountainjs-editor/experimental/yjs-retained';
```

ESM and CommonJS are supported. Yjs remains an optional peer dependency. Runtime
document, schema, transactions, extensions, checkpoint and collaboration operations
run in Node without jsdom, `document`, `window` or `MutationObserver`. Browser
editing still requires the normal view and input layers. Web Crypto is required;
the package's supported Node 20+ runtime supplies it.

The retained implementation uses `fountain-retained-document/3` for collaboration and
`fountain-retained-checkpoint/1` for rollback. Store these separately from portable
document JSON. The earlier XML default's six structural concurrency failures
motivated this change. XML compatibility does not repair them. The public beta
API and stored-data migration rules still apply. [Release policy](RELEASES.md).

The measurements and completed browser runs below describe their recorded
preview builds. They do not replace the full package and browser validation
required for the new default.

## Try the homepage preview

The local website build uses the package preview entry in the homepage's
collaboration section. Launch and Planning are seeded independently. Each
starts with one authoritative in-memory document whose Yjs update is copied to
the second peer before it joins. Switching swaps the adapters on the existing
editor views. Returning to a room brings back its document edits.

Select **Pause document sync** and type inside a paragraph as Ada. In Grace's
editor, place the caret in the same paragraph and use **Toggle quote**,
**Toggle bullet list**, **Toggle numbered list**, or **Toggle task list**. You
can also select part of the paragraph and choose **Toggle bold**, or press
Enter to split it. Select **Resume document sync** to merge both changes.
Ada's Undo removes her typing while Grace's edit stays in both editors.
Grace's Undo removes her edit while retaining Ada's typing. The pause control
also hides peer cursors and requires a merge before switching rooms. Each room
has a separate in-memory comment store. New comments and reply drafts return
with their room during the same visit, along with posted threads and anchors.
The open composer keeps its target type. Its saved selection is restored when
the room document matches the version the author left.

You can also pause sync, use **Toggle quote** in Ada's editor and **Toggle
bullet list** in Grace's editor on the same paragraph, then resume. One
wrapper remains visible and both editors keep the paragraph and can continue
typing. The retained projection hides an empty quote or list wrapper only
when its children were placed elsewhere. It keeps the native references for
undo. If undo clears a winning placement, a surviving registered reference
can restore the paragraph and its text. When several offline authors wrapped
the same paragraph, recovery prefers the surviving reference with the same
Yjs replica precedence used for the original concurrent assignments.

Three-author tests cover both wrapper winners, undo and redo, subsequent
reordering, and exact checkpoint reopen. A recorded three-editor workflow
checks that undo shows the next surviving wrapper and that undoing all three
wraps leaves the third author's typing. The tests also cover two concurrent
splits with typing or deletion, and a concurrent join, split and insertion.
An empty required wrapper without displacement evidence still fails schema
validation. Older retained builds can refuse checkpoints containing these
conflicts, so all peers in the preview should use this projection together.

All six offline cases passed in the production site build in Chromium, Firefox
and WebKit, including undo by each author. Room switching and comment retention
also passed in those engines. The bold and task-list cases passed in mobile
Chromium and WebKit emulation. Desktop and narrow captures were visually
checked. These workflows use the retained adapter in the homepage preview.

The production website build passed 15 recorded desktop workflows across
Chromium, Firefox and WebKit, plus two mobile-emulation merge workflows. The
desktop suite checks switching, cursor overlays, author history, concurrent
settings changes, and comments. The mobile checks verify the headline phrase
fits on one line and the page has no horizontal overflow. A narrow Safari
capture and a desktop capture were visually inspected.

The room comment workflow checks an inline draft in Launch and a whole-document
draft in Planning. Returning to Launch restores the selected word and keeps
keyboard focus on the switch button. The author can post to that word and
return to the original thread to finish an unsubmitted reply. The production
build passed 18 desktop checks and four mobile-emulation checks. The comments
source suite passed 46 tests, including late snapshots, writes, and
mapped-anchor results from a retired provider.

The homepage prepares both destination Yjs adapters before switching either
editor or its comment store. If either preparation fails, both editors remain
in the original room with their edits, undo history, and open comment draft.
The notice identifies the room that stayed open and the switch can be retried
in place. The browser journey verifies that the draft can still be posted in
its original room before retrying the switch. The production build passed
18 recorded Chromium, Firefox and WebKit checks and four mobile-emulation
checks. Desktop and narrow captures show the retry notice and retained draft.

The homepage lazily loads the collaboration demo in a React Suspense boundary.
The hook can read its initial document during rendering. Editor plugin startup
waits for React to commit, so a suspended or discarded render leaves providers
untouched. A committed editor keeps its state across a temporary Suspense
fallback and cleans up its provider on unmount.

The React lifecycle regression verifies that a suspended descendant opens no
provider and that hiding an already committed editor preserves its document.
The production demo's slow-load journey holds the collaboration module request,
checks the visible loading state, and then exercises shared typing and author
undo. The desktop suite includes room switching, offline merging and scoped
comments. All 21 recorded Chromium, Firefox and WebKit journeys and 60 focused
React and collaboration tests passed. A WebKit capture was reviewed after
both editors returned to the shared heading. Recordings and screenshots are under
`artifacts/react-suspense-demo-20261107/`.

## Initialize once, then join

One authority must create the room once. Do not let several disconnected clients
each initialize an empty room, even from identical initial JSON. Their native
identities differ; merging those independently seeded rooms is refused rather
than selecting a winner and losing the other document.

An empty shared fragment can also be waiting for missing Yjs updates. Both
adapters refuse to seed it if Yjs has unresolved insertions or deletions.
The provider stays disconnected and the editor remains available as a local
draft. Once the initial state arrives, keep a copy of the draft and open a
separate session with the complete room. Reconnecting the refused adapter
keeps the draft in place.

Four Node regressions cover out-of-order insertions and deletions. Six
recorded browser journeys cover both protocols, continued typing, a refused
retry and a separate recovery session. Run them after `pnpm build` with
`pnpm exec playwright test --config playwright.yjs-incomplete-room.config.ts`.

If incompatible room data reaches an established legacy or retained editor,
the session stays in error. It clears shared presence and suspends shared
writes, undo and redo. The editor can still hold new local text. Removing the
foreign root or reconnecting the same adapter leaves that draft intact. Save
the current editor JSON before replacing the adapter with one bound to the
verified room. The host still controls the underlying transport and must
check room identity before routing updates.

An established editor also suspends shared editing if its schema or a host
transaction filter rejects an incoming document update. The transport may
already hold the raw Yjs update. Keep the visible draft as Fountain JSON and
open a fresh session from verified data. A repair delivered by the peer or
a provider status change leaves the original editor draft available.

For a local experiment, create one editor with the retained extension and an empty
`Y.Doc`, then copy `Y.encodeStateAsUpdate(seedDoc)` into a second empty `Y.Doc`
**before** creating its editor. After that, exchange Yjs updates normally. Keep
each editor's Yjs constructors in one module system; mixing ESM and CommonJS Yjs
instances in the same process creates incompatible constructor universes.

A shared application provisions on its authorized backend, persists an
authoritative checkpoint, and admits each client before its transport starts.
The server reference handles simultaneous first joins with an atomic insert and
reuses the saved room on retry. [Provisioning audit](YJS_RETAINED_PROVISIONING_AUDIT.md).
The host supplies the loader and binding through the extension options.

### Open a room through the application authority

The unreleased `fountainjs-editor/yjs/room` entry defaults to retained rooms.
It verifies the offered room, the bound checkpoint and the native document
identity before it returns an extension factory. The same entry exports the
retained extension factory and both checkpoint capture functions for hosts that need to
seed rooms or preserve an existing XML room.

To replace a room in an already mounted editor, prepare the next bound room
with the same editor schema and retain any unsubmitted draft from the
previous session. Pass a factory to the existing replacement command:

```ts
import { replaceCollaborationAdapter } from 'fountainjs-editor'

const switched = replaceCollaborationAdapter(editor, () => next.createAdapter({
  user,
  provider: createProvider(next.document, next.lease),
}))
```

Create the destination provider with auto-connect disabled. The adapter
checks the admitted root before the old session is detached.
Once the destination connects, it owns its own author undo history. Keep the
previous room's document until its provider has completed teardown. If the
destination is refused by an editor transaction filter, shared editing
reports an error and the visible draft remains available for recovery.

```ts
import { CoreExtension, composeExtensions, createEditor } from 'fountainjs-editor'
import { openYjsRoom } from 'fountainjs-editor/yjs/room'

const room = await openYjsRoom({
  schema,
  schemaVersion: 'article-v1',
  expected: { key: articleId },
  open: (protocols, signal) => api.openArticle(articleId, protocols, signal),
  admit: (offer, signal) => api.admitArticle(offer, signal),
})

// The application's provider starts disconnected and fences every write
// against the lease. api is the host's authorized transport.
const provider = api.createDisconnectedProvider(room.document, room.lease)
const kit = composeExtensions([CoreExtension, room.createExtension({
  user: currentUser,
  provider,
})])
const editor = createEditor({
  schema: kit.schema,
  plugins: kit.plugins,
  content: room.baseDocument.toJSON(),
})
// When leaving the room, destroy the editor before room.document.destroy().
```

Use the same schema and structured attribute definitions on the client and
authority, and compose the same schema extensions when mounting the editor.
For applications that are migrating XML rooms, pass `protocols: ['retained',
'legacy']` to open either stored format. The helper preserves a verified
nested XML fragment when selecting the legacy adapter. Both adapters pin the
native root returned by admission. A removed root or an equal-looking
replacement prevents provider startup. If the change reaches a mounted
editor, shared writes and shared history stop and the local draft stays
editable. Open a verified replacement session to resume collaboration.
Keep a draft available
until its saved edits are acknowledged. Pass an abort signal when leaving a
pending join and dispose the returned document if the editor never mounts.

An external install of the local tarball passed 15 collaboration checks each
in Node ESM and CommonJS, plus strict NodeNext consumer types. The private
SQLite migration demo uses the package opener and its extension factory.
Twelve recorded journeys across Chromium, Firefox and WebKit cover handoff,
rollback, mismatched formats and offline recovery. The older direct XML
entry still reproduces its six structural cases.

For a deployment with both formats, the SQLite reference offers
`CoordinatedDocumentRoom.openForEditing({ protocols, loadCheckpoint })`.
The client declares the formats it can edit. An absent room is seeded with the
retained format only if the client supports it. An existing room keeps its
stored format and namespace, and the initializer stays unused. The response
includes the snapshot and the native identity required for admission. Bind
through the authority before mounting the matching adapter or starting its
provider. A format or epoch change between these steps requires a fresh open.
The client must keep its local draft through that retry. The authority API
belongs to the host reference. Clients on the published beta still use the
legacy adapter. This local branch requires `/yjs/legacy` to select it directly.

The opening flow passed 84 focused source cases and 21 recorded journeys in
Chromium, Firefox and WebKit. The provisioning demo opens the same retained
room for two simultaneous first authors. The migration demo shows an existing
nested XML room opening with its legacy adapter, refusing a retained-only
client, and accepting that client after explicit migration. A source test
also checks that a legacy room winning the initial insert keeps its exact
bytes. At that earlier checkpoint, the XML default still reproduced its six
failures. Current default adoption is tracked separately in
[the adoption report](YJS_DEFAULT_ADOPTION.md).

```ts
import * as Y from 'yjs';
import type { YjsProvider } from 'fountainjs-editor/yjs';
import {
  createRetainedYjsCollaborationExtension,
  type RetainedAdmission,
} from 'fountainjs-editor/experimental/yjs-retained';

function collaboration(
  document: Y.Doc,
  provider: YjsProvider, // constructed with autoconnect disabled
  admission: RetainedAdmission,
) {
  return createRetainedYjsCollaborationExtension({
    document,
    user: { id: 'ada', name: 'Ada', color: '#7048e8' },
    provider,
    admission,
  });
}
```

The host provides the following options.

- `schemaVersion` specifies the application schema version.
- `load(signal)` returns an already authorized existing checkpoint or an authority
  snapshot with exactly `key`, `epoch`, `revision`, `phase`, `protocol`, and
  `checkpoint`. Transport codecs must restore checkpoint bytes as `Uint8Array`;
  store the bytes separately or encode them with a reversible binary codec.
- Optional `authority: { key, bind(lease, signal) }` validates and binds the active
  epoch/revision/native room identity before provider connection. Authority mode
  requires a retained snapshot. The exported generic `DocumentRoomSnapshot` type
  also describes legacy server records, which this client deliberately refuses.

Binding checks consistency at a single point in time. The backend must authorize
access and fence **every write** against its current
epoch and phase. If binding returns newer accepted state, the provider must
validate/apply that catch-up state with an untracked remote origin before reporting
initial synchronization complete. See the recorded HTTP/SQLite reference in the
[authority-admission audit](YJS_AUTHORITY_ADMISSION_AUDIT.md).

The [live HTTP transport reference](YJS_LIVE_HTTP_REFERENCE.md) also shows
automatic edit exchange after binding, retry after a dropped reply, and
recovery when a room refuses an old session. It includes an ephemeral peer
cursor and selection channel fenced to the active room epoch.
Its structural recovery matrix demonstrates the retained path for quote and
list wrapping, partial bold, and paragraph splitting across an offline reload.

Typing while admission is pending is retained locally. If it conflicts with the
loaded state, admission reports an error instead of overwriting it. Cancellation
prevents late callbacks from installing state or starting transport. An epoch
change on reconnect requires an explicit fresh session and draft recovery.

Checkpoint-based admission validates the saved structured fields in the staged
merge before binding or starting the provider. The client supplies definitions
for the saved top-level map, including its custom name where one is declared.
Missing definitions, an incompatible map or a local change to the saved map
name leave the draft and shared bytes intact. The recovery fixture shows the
refused draft alongside a new session that displays both saved fields.

The [browser draft reference](YJS_BROWSER_DRAFT_RECOVERY_AUDIT.md) shows how a
host can keep a rolling recovery copy in IndexedDB, including before switching
sessions. A saved copy from the same session can pass through ordinary admission
after reload. Pre-admission and retired-session drafts reopen separately as
editable local copies. Opening or resuming a saved draft requires an explicit
choice in the host example.

## Checkpoints and limits

`captureRetainedCheckpoint(doc, schema, schemaVersion, room?)` captures full wire
state with checksums and the projected document hash. `restoreRetainedCheckpoint`
validates and restores into a **new isolated document** and returns
`{ document, baseDocument, manifest }`. The caller owns and destroys that document.
Use the returned document as an isolated recovery point.

Compatible named top-level fragments are supported. Nested fragments, conflicting
independent initialization, legacy XML data, subdocuments and nonportable wire
values are refused. Existing XML rooms need the separately audited migration and
rollback workflow; this entry intentionally exports no migration/admin service.

Remaining adoption work includes deploying the reference transport, provisioning
and draft recovery with application authorization, multi-host authority, history
and metadata growth and compaction, broader application integration, and full
release CI. Recorded desktop-engine
journeys are not physical mobile/IME or assistive-technology certification.

The earlier preview was isolated from the default root, core, React and XML
adapter runtime graphs. The new `/yjs` default intentionally loads retained
storage. Its current package measurements must be checked independently of the
[historical preview measurements and installed consumer audit](YJS_RETAINED_PACKAGE_AUDIT.md).
