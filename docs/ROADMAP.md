# FountainJS roadmap

Updated 2026-11-16.

Latest task conversion checkpoint (2026-11-16): GitLab-generated checkbox spaces
and newlines before nested blocks no longer become authored text on export. The
adapter consults source positions to retain intentional newline entities and
preserves additional spaces, tabs, NBSP and escaped entity text. Seventeen actual
renderer samples cover these distinctions. All 1,167 GitLab unit cases / 43 files,
540 selected upstream cases (one inherited skip), types and frontend build pass.
The recorded application profile passes 20 checks, including checkbox undo/redo
and six rich/source cycles across MR/wiki editors with unrelated prose edits.
Task lines stay unchanged through Save/reopen/restart. The 18-patch reconstruction
and 28-file source rollback pass. [Task conversion evidence](../artifacts/task-whitespace-integration-20261116.json).

This resolves the spacing drift observed in the preceding discussion checkpoint.
Mixed task/bullet lists, inapplicable tasks, inline review/suggestions and broader
role/reconnect/mobile/product acceptance remain open. Public engine/API/package
and acceptance limits are unchanged; no publication or parity-row promotion.

Previous discussion checkpoint (2026-11-16): general MR threads now have recorded
real-service coverage for creation, immediate rich editing, replies and whole-thread
resolution, with exact saved bodies and state checked after reopen and restart.
GitLab's NoteForm supplies null suggestion metadata even for ordinary edits/replies;
the native adapter now accepts those inactive fields while still refusing active
or unknown suggestion configurations. The profile passes 19 service checks;
42 focused root cases, 540 selected upstream cases (one inherited skip), types,
frontend build, 18-patch reconstruction and 28-file source rollback pass.
Engine/API/limits are unchanged. [Discussion evidence](../artifacts/review-integration-20261116.json).

Inline suggestions, review batching, roles/concurrency and full product acceptance
remain open. The recorded MR/wiki cycles also expose growing encoded task-leading
spaces; investigate that conversion drift separately from saved-body persistence.
No publication or parity-row promotion is implied.

Previous workflow checkpoint (2026-11-16): existing merge-request descriptions
and wiki pages now have recorded real-service coverage for rich/source switching,
immediate rich-mode saving, reopening and an actual application restart. The
wiki journey includes its commit-message dialog. Saved Markdown remains exact
across restart; reader checks retain tables, math, decoded images and bold edits.
Direct editor entry exposed missing KaTeX styles; the editor now loads its own
stylesheet instead of depending on a prior reader visit. The profile passes
16 checks and 540 selected upstream tests (one inherited skip); frontend build,
18-patch reconstruction and 28-file source rollback pass. Engine/API/limits are
unchanged. [Workflow evidence](../artifacts/workflows-integration-20261116.json).

Records are seeded through real authenticated APIs; this does not prove UI
creation, MR inline review/suggestions, wiki history/templates, multiple roles,
concurrency or full product acceptance. Those remain open. No publication or
parity-row promotion is implied.

Previous UI checkpoint (2026-11-16): the contextual Note button now stays with
Document tools. Note actions use full-width rows, with removal below a divider;
mobile controls dock without horizontal overflow. The actual GitLab audit passes
29 checks through Save/reopen/restart, keyboard cancellation/focus at 1440/1100/
360px, and nine scoped accessibility scans. Reviewed screenshots and sampled
recording frames confirm the layout. Selected upstream tests pass 540 cases
(one inherited skip), the frontend builds, and 18-patch/28-file source rollback
passes. The engine/API/package are unchanged; this is not full product acceptance
or publication. [Control-layout evidence](../artifacts/note-controls-integration-20261116.json).

Previous engine checkpoint (2026-11-16): successful same-editor cuts now reuse unchanged
owned footnotes on the first paste. Ordinary/repeated copies stay independent;
changed dependency graphs retain both versions. Destination selections cannot
silently remove owned definitions, and cut/paste undo separately. GitLab keeps
the original labels for reused notes.

Validation: 6,572 root cases / 384 files with two workers; recorded Chromium and
Firefox whole-line cut/paste/undo/redo; 28 actual GitLab checks through
Save/reopen/restart with four definitions, six references and their backlinks;
six scoped accessibility scans and no browser errors. Framework types,
package/Node/workerd, the 144-module headless boundary, unchanged size/runtime
limits, 18-patch reconstruction and 28-file source rollback pass. The API adds
optional move/preparation context and remains at 452 declaration files.
No version, publication or parity-row promotion changes.

Open: physical Safari and installed WebKit clipboard transport, broader
selection/role/collaboration matrices and complete GitLab product acceptance.
The separate Footnote actions row is resolved by the control-layout checkpoint above.
[Cut/move evidence](../artifacts/footnote-cut-integration-20261116.json).

Previous cell-clipboard checkpoint: cell selections now use the same owned-document clipboard
pipeline. Rich grid paste preserves cell roles, marks, custom data and owned
notes, handles merged spans and table growth, and keeps untouched position
mapping. Deferred HTML fallback still distributes TSV with a loss report;
refusal publishes no partial state. Explicit nested-table insertion remains
available separately.

The private GitLab toolbar now wraps related controls together, including
Attach/Paste Markdown/Media. Media actions have distinct rows and divided
deletion. Recorded checks cover 1440/1100/390px, keyboard properties, mobile
cancellation and six automated accessibility scans. The whole-editor scan also
repaired invalid footnote role hosts while retaining older HTML input.
Three actual tables and three owned notes survive Save/reopen/restart in the
20-check profile. This adds to the preceding footnote-only evidence below.

Validation passes 6,553 tests in 383 files with two workers, 540 selected upstream
cases (one inherited skip), framework types, package/Node/workerd, the 144-module
headless boundary, 18 patches and 28-file source rollback. One default-parallel
SQLite test timed out; that witness remains recorded. Chromium/Firefox native
clipboard journeys pass; physical Safari, installed WebKit OS transport,
cut/move identity reuse and broader product acceptance remain open. No size
limit, version, publication or parity-row promotion changes.
[Current evidence](../artifacts/gitlab-table-clipboard-integration-20261115.json).

Previous footnote-only clipboard checkpoint:

The model clipboard delivery copies complete owned footnote bodies, remaps
colliding IDs without breaking shared references, preserves marks, and pastes
the graph in one undoable operation. Optional model clipboard hooks and the
Pages helper leave document text unchanged. The actual GitLab journey exposed
its page-wide reader clipboard transformer overwriting native copy data; the
private view now isolates handled clipboard events while leaving unhandled
ones available to the host. Four original/copied notes and six references
survive Save/reopen/restart, including every real forward/backlink.

Validation: 6,526 root tests / 380 suites, 540 selected upstream cases with one
inherited skip, 27 recorded service checks, six scoped accessibility scans,
framework types, headless/package/Node/workerd, unchanged latency/retention,
18-patch reconstruction and 28-file source rollback. Chromium and Firefox
OS-clipboard journeys pass. Installed WebKit ports still fail the format bridge;
minimal non-Fountain controls are retained, without synthetic-paste substitution.
Cell-grid clipboard ownership, cut/move identity reuse, physical Safari and
broader product acceptance remain open. The optional public API is additive;
reviewed CommonJS aggregate capacity is 1,440 KiB; other limits and parity rows
are unchanged. [Clipboard evidence](../artifacts/gitlab-footnote-clipboard-integration-20261115.json).

Previous source/typing checkpoint:

The private GitLab footnote adapter now has an actual-host two-cycle round-trip
matrix: 65 input/edit combinations, 208 authenticated renderings, 53 accepted
cases with equal native graphs after both reopenings, and 12 explicit source-
retaining refusals. The cases include direct note-body edits, empty/unused/shared
notes, Unicode labels, literal markers, frontmatter, tables, links and math.
The comparison normalizes only opaque note IDs, not body order or formatting.

That audit exposed a real editor/reader mismatch: an automatic typing paragraph
after terminal endnotes let prose appear below them in the editor and above them
after reopening. The private adapter now omits that automatic repair when the
last note body is already editable. Shared engine behavior, repairs after atomic
content and authored paragraphs are retained. A recorded 26-check UI journey
verifies Enter/typing before notes, source/rich switching, Save, reopen and
restart. Six scoped accessibility scans and browser-error checks pass.

Current validation passes 1,133 GitLab tests in 41 suites, 536 selected upstream
tests (one inherited skip), TypeScript, the rebuilt frontend, 18 ordered patches
and 28-file source rollback. Clipboard/native-fragment/authored-placement,
broader format/edit/context/role/browser matrices, cache rollout, large-document
costs and compiled deployment rollback remain open. No public API, size limit,
package version or parity row changes.
[Current evidence](../artifacts/gitlab-footnote-roundtrip-integration-20261115.json).

Previous label and reader-navigation checkpoint:

The private GitLab issue editor now supports footnote-label renaming through the
actual host renderer. It retains native identities and note bodies, updates shared
references atomically, supports undo/redo, and retains drafts on collision or
transport failure. Validation refuses a rename that changes other content or
reference ownership. Unused-note labels now wrap above their bodies rather than
overlapping the numeric gutter, including at 360px.

Real reader clicks exposed an upstream repeat-reference bug that link-count
checks missed. A separately declared, exact-pin server filter repair now joins
references by href and gives generated destinations collision-checked IDs. The
original backend baseline remains separate. The old cached test issue required
GitLab's documented derived-HTML invalidation; its source, title and timestamp
were unchanged. This is not evidence for a completed site-wide cache migration.

Current evidence: 1,057 GitLab model cases in 39 suites; 536 selected upstream
cases with one inherited skip; 24 pinned-image Ruby contracts; 45 actual Rails
renderings; and a recorded 25-check Chromium save/reopen/restart journey with six
scoped accessibility checks and no browser errors. Types, actual frontend build,
18-patch reconstruction and 28-file source rollback pass. Public APIs, package
version, size limits and parity rows are unchanged. Duplicate/ambiguous source
policies, complete canonical/clipboard/public-Pages and workflow/role/browser
matrices, large-document rename costs, cache rollout and compiled deployment
rollback remain open.
[Current evidence](../artifacts/gitlab-footnote-renaming-integration-20261115.json).

Earlier native authoring checkpoint:

The private GitLab adapter now imports and canonically exports verified footnote
cases using the existing native nodes. Its issue-editor controls insert notes,
reuse a shared note, edit bodies, remove one reference or delete the whole note.
Untouched source remains exact; ambiguous or unrepresented cases retain source
instead of enabling a lossy edit. Newly inserted notes receive independent labels.

The recorded 19-check Chromium journey verifies keyboard controls, undo/redo,
360px draft retention, source/rich switching, Save, reopen and application restart.
Four scoped accessibility checks pass. Visual/source review also found and fixed
End escaping a paragraph after an inline atom, and an automatic caret paragraph
being exported between definitions. The former has a three-engine footnote/math
regression; the latter has a failing witness and an authored-empty control.
All 1,005 current GitLab model cases, 536 selected upstream cases (one inherited
skip), TypeScript, package/API, measured size, frontend and source rollback/patch
checks pass. The earlier broad unit checkpoint passed 6,380 cases, before the
final private definition-placement adjustment covered by the current model set.
No size limit, API, package version or parity row is changed.

Label renaming, duplicate/ambiguous source policies, the full canonical re-render
and clipboard matrices, public Pages placement, MR/wiki/discussion/role/browser
acceptance and compiled deployment rollback remain open. This is not a complete
GitLab replacement or a global parity completion.
[Evidence](../artifacts/gitlab-footnote-authoring-integration-20261115.json).

The earlier native footnote checkpoint established an exact UTF-8-source-position foundation.
Forty-seven cases, including all 23 actual host renderings, verify label spans,
multibyte boundaries, nested/repeated/duplicate notes and exact newline offsets.
All 839 GitLab model cases and TypeScript passed at that checkpoint. The helper
was then unwired; native import and controls are now covered by the newer scoped
checkpoint above. No native footnote parity row is promoted.
[Position evidence](../artifacts/gitlab-footnote-positions-integration-20261114.json).

The image-restart investigation now correlates the earlier 403 with authenticated
Rails logs. A temporary diagnostic overlay leaves Workhorse verification unchanged
and records no tokens. The exact issue/image passes 25 uncached Chromium loads
across two restarts, each matched to successful verification and a Rails HTTP 200.
The ordinary deployment is restored and stopped with the diagnostic mount removed.
The original failure remains open: its negative queue time is a timing clue,
not a proven JWT cause, and the later passing run is not a repair. No package,
parity row or public feature claim changes.
[Diagnostic evidence and limits](../artifacts/gitlab-upload-restart-integration-20261114.json).

The GitLab footnote audit now has 23 authenticated renderer cases. It found a
real source-loss path: the previous codec accepted HTML that omitted unused
definitions, retained exact source while unchanged, then dropped the definitions
after an unrelated edit. A new source-inspection guard reuses Fountain's parser
and validated frontmatter boundary to refuse that incomplete conversion with the
original retained. It distinguishes code/comments, ordinary space-containing
labels and frontmatter examples; Unicode and non-breaking-space labels are
covered. This is source protection, not completed GitLab footnote editing.
All 792 GitLab model cases and 536 selected upstream cases pass (one original
skip). A recorded 13-check service journey verifies paste, failed load, Retry,
explicit recovery/cancel and unchanged source after restart. An earlier run
observed an uploaded image returning 403 after restart despite a later request
returning 200; a subsequent pass does not close that intermittent finding.
[Evidence and limits](../artifacts/gitlab-footnote-source-integration-20261114.json).
[Full footnote adapter plan](../integrations/gitlab/FOOTNOTE_ADAPTER_PLAN.md).

The private GitLab integration now connects reference suggestions and command
arguments to actual host endpoints, reactive work-item state and the Markdown
renderer. The recorded real-service profile passes 21 checks, including a label
argument, issue/user/merge-request/milestone insertion, a deliberate GET failure
and retry, keyboard use at 360px, source switching, Save, reopen and application
restart. Reference counts and source are checked against the document before
Save. Scoped desktop/mobile reference scans have no accessibility violations.
The journey exposed two focus defects: Retry removed its focused button, and
GitLab's responsive desktop sidebar stole editor focus after a debounced resize.
Both have regressions and repairs; the sidebar repair stays in the host patch.
All 6,134 Node cases and 536 selected upstream cases pass, with the one inherited
upstream skip unchanged. Eighteen patches and the 28-file source rollback verify.
Wiki/Gollum and emoji completion, all provider/context/role/browser matrices,
touch-first narrow-screen interaction, remaining GitLab surfaces, compiled
deployment rollback and full product acceptance remain open. No parity row or
public feature claim is promoted, and no package capacity limit changes.
[Autocomplete evidence and limits](../artifacts/gitlab-autocomplete-integration-20261114.json).

The offscreen-caret finding below now has a native-range visibility regression
and a DOM-view repair. Focused local edits reveal the caret through inner scroll
containers before adjusting the window, using the caret range rather than a
whole long paragraph. Host scroll padding and the visual viewport are respected;
remote-tagged updates, active composition, ranged selections and focus in other
controls do not trigger automatic reveal. Eighteen recorded desktop-engine
checks pass, including real public-demo typing/history and controlled nested
vertical/horizontal embeddings. The embedding probes distinguish remote-tagged
transactions from actual network collaboration acceptance. This closes the
recorded local caret finding, not full mobile/IME or GitLab acceptance.
All 6,078 unit cases, framework types, unchanged API declarations, headless
boundary and package checks pass. Twelve further browser executions recheck
the embedding guards on both axes plus 100,000-block virtualization and injected
page-gap selection/composition; six repeat the embedding cases above.
[Caret evidence and scope](../artifacts/caret-visibility-integration-20261114.json).

The preceding autocomplete foundation repaired shared suggestion matching across
adjacent differently formatted text leaves. Inline atom insertion now maps the
exact replaced span, preserving outside anchors and rebased undo; slash commands
remove the full formatted query. The optional `InlineAtomRange.endPath` stays
within one inline parent. Three recorded native-input journeys pass in Chromium,
Firefox and WebKit. Real GitLab autocomplete records are captured, including
missing IDs, differing global/local issue IDs and a genuinely unavailable
endpoint. They are evidence for the upcoming host adapter, not a completed
reference/argument UI. Its recording review retained a separate usability finding:
after toolbar scrolling, the public demo can resume editing with its caret below
the visible viewport. The caret follow-up above closes that finding; the earlier
passing semantic journey alone did not.
[Scoped foundation evidence](../artifacts/suggestion-ranges-integration-20261114.json).

The GitLab integration now adds command-name suggestions from the authenticated
host catalogue, toolbar insertion, server-generated effect previews, and an
explicit undoable literal/active interpretation switch. Escape stays within the
editor; Alt+F10 and arrow/Enter navigation work with the native selection. The
recorded real-service journey passes seventeen checks, including a UI-authored
label action, source switching, save, reopen, and application restart. Actual
desktop and 360px views are reviewed. Keyboard selection stays inside the
scrollable list, and the popup stays inside the work-item clipping boundaries.
The selected upstream set passes 462 tests across 21 suites, with the one original
skip unchanged, and the full Node set passes 6,059 cases in 364 files. The shared
context surface now honors Alt+F10 focus in docked mode as well as floating mode.
It also constrains both popup axes, including the unavailable-command state in a
short host. Six quick-action views and eight shared code/media views pass their
component browser, accessibility and geometry checks.
A shared suggestion-controller fix prevents late transport errors
from reopening a dismissed menu or publishing after destruction. No capacity
limits are raised. Argument/reference autocomplete, other command/context/role
matrices and full GitLab/product acceptance remain open; no parity row is promoted.
[Controls evidence and limits](../artifacts/gitlab-quick-action-controls-integration-20261114.json).

The preceding GitLab quick-action source/save foundation has a recorded real-service
journey. Commands retain their literal arguments, escaped slashes remain inert
after unrelated edits, and reference definitions following commands resolve.
Plain code without a language marker also imports as code. Source adapters use
renderer-input coordinates for blocks following an isolated command, so explicit
alert titles and fenced metadata keep their source ownership. A normal UI save
applies a real label command while leaving an escaped `/close` as text, including
after reopen and application restart. The journey exposed and fixed a stale
GitLab conflict flag carried into a new edit session; existing concurrent-edit
tests remain active. Native reference links now have a visible underline.
The final focused Node set passes 136 cases and the nineteen upstream suites
pass 440 cases with one unchanged skip. The earlier broad run passed 6,023 cases
before the final targeted refinements; it is not a claim of a new final full run.
All sixteen current browser checks pass. This is a private integration checkpoint,
not full quick-action or GitLab parity. The controls follow-up above supersedes
its insertion/preview gap; argument/reference autocomplete and the other GitLab
workflows remain required.
[Quick-action evidence and limits](../artifacts/gitlab-quick-actions-integration-20261114.json).

The November 13 presentation follow-up addresses the reviewed GitLab toolbar and
media-panel mismatch. Floating triggers retain their natural width; attachment,
Markdown paste and the contextual action share the desktop row. Markdown paste
uses the existing icon with its descriptive title and accessible name. The media
panel identifies the selection, emphasizes Properties, and separates deletion
from everyday actions. Popup placement also respects the visible scroll area.
The recorded UI profile adds explicit layout checks to
the existing save/reopen/restart journey. This is presentation work; the native
engine and persisted document format are unchanged. Quick actions and the other
remaining GitLab workflows stay next in the active integration programme.
[Presentation evidence](../artifacts/gitlab-context-ui-integration-20261113.json).

The latest GitLab checkpoint restores the original code/media menu entry points
with real native contextual controls. Captured block ownership now covers the
displayed actions, source copy, preview and source-session handoff after a later
caret move. Equal-content document replacement invalidates stale sessions.
Keyboard access/dismissal, host-form Escape isolation, popup bounds,
mobile docking, nested-modal hiding and final ARIA references are exercised
through the native view. All **5,949 root tests/361 files**, current types/API,
unchanged package-size checks and upstream lint pass. The selected nineteen-suite
GitLab set is **439 passed / zero failed / one inherited skip / 440 total**;
neither original menu assertion is weakened. Eight component states pass
full-body accessibility checks, real clipboard and audio/video preview playback.
The recorded real-service journey passes **21 checks**, including source-mode
handoff, save/reopen and application restart. Visual review found and repaired
menu/modal overlap as well as a popup crossing the owning content edge.
Twenty-five-file source rollback/reinstall and fourteen ordered test patches
verify. Full-document partial-edit source fidelity, remaining specialized GitLab
workflows, all surfaces/roles/browsers, compiled deployment rollback, hosted CI
and both other full products remain open. No parity row, public API, size limit
or publication is changed.
[Contextual-control evidence and retained failures](../artifacts/gitlab-context-integration-20261113.json).

The preceding GitLab checkpoint adds native document frontmatter. Source-aware
conversion distinguishes YAML/TOML/JSON headers from identically rendered code
fences; header source, comments, prefixes and delimiters survive unrelated body
edits. Native insertion, source/format controls, copy, delete, explicit code
conversion and undo use the existing engine. Premature closing delimiters and
conflicting drafts refuse silent changes; toolbar, keyboard and beforeinput
formatting protect header selections, including Select all and directed ranges.
Twenty-seven real renderer fixtures and **5,946 root tests/361 files** pass, as
do current TypeScript/API and unchanged public size checks. The eighteen-suite
GitLab set is **428 passed / 2 failed / 1 inherited skip / 431 total**. The
recorded Linux Chromium journey passes **18 checks**, including UI save/reopen/
restart, native source inspection, visually reviewed 360px layout and zero
scoped axe violations/browser errors. Twenty-two-file source rollback/reinstall
and thirteen ordered test patches verify. This is private integration work:
whole-document partial-edit source fidelity, the two original menu requirements,
other specialized content, remaining surfaces/roles/browsers, compiled deployment
rollback and both other full products remain open. Nothing is published and no
acceptance limit is raised.
[Frontmatter evidence and retained failures](../artifacts/gitlab-frontmatter-integration-20261113.json).

The preceding GitLab checkpoint verifies saved invalid-diagram recovery. Mermaid
parse errors are caught, the reader exposes its original inert source with Retry,
and native editing repairs both Mermaid and PlantUML after save/reopen/restart.
The actual run also reproduced a lazy-image failure: the decoded 1×1 placeholder
could remain collapsed when its real source was installed. The reader now reserves
space at that source switch, removes only its temporary sizing after load/error,
and preserves authored dimensions. The recorded journey passes **23 checks** with
zero browser errors and scoped axe violations; measured image geometry changes
from 32×32 pending to its natural 400×60 with the temporary classes removed.
All **5,900 root tests/359 files**, current types/API and existing size checks pass.
The seventeen-suite upstream set is **415 passed / 2 failed / 1 original skipped /
418 total**. Twenty-two-file source rollback/reinstall and twelve ordered test
patches verify. Broader browsers, roles, source fidelity, remaining GitLab surfaces
and both other full products remain open. No publication or parity promotion.
[Reader evidence and retained failures](../artifacts/gitlab-diagram-reader-integration-20261113.json).

The latest GitLab follow-up pairs diagram source and live preview in a responsive
authoring dialog. Draft previews leave the document unchanged; Apply targets the
captured block in one undoable transaction, Cancel discards the local draft, and
target changes retain copyable source while refusing overwrite. Unapplied source
blocks both native current-content reads and rich-to-Markdown handoff. All
**5,898 unit tests/359 files**, current TypeScript/API and existing size limits
pass. The eleven-suite upstream set is **329 passed / 2 failed / 331 total**.
The recorded real GitLab journey passes **24 checks**, including edited diagrams
after save/reopen/restart, a visually reviewed 360px layout and zero dialog axe
violations. Nineteen-file source rollback/reinstall and eleven ordered test
patches verify. At that checkpoint, saved invalid-diagram reader behavior, other browser/role/surface
coverage and both other full products remain open. Nothing is published.
[Authoring evidence and limits](../artifacts/gitlab-diagram-authoring-integration-20261113.json).

The latest GitLab checkpoint adds native Mermaid/PlantUML source creation and
editing with real previews, error/retry recovery, copy, language conversion and
delete/undo/redo. Actual toolbar creation after bold prose exposed inherited
formatting that blocked serialization; the explicit plain-code conversion now
retains text characters and semantic selection positions while clearing prose
marks. The recorded real-service run passes **21 checks**, including edited
reader output after save/reopen/restart. All **5,887 unit tests/359 files** pass;
the upstream ten-suite set is **318 passed / 2 failed / 320 total**. Guarded
nineteen-file source rollback/reinstall and eleven ordered patches verify.
At that checkpoint, preview/source pairing in long documents, saved invalid diagrams, remaining
specialized content, full roles/workflows and both other products remain open.
Public library/API/size limits are unchanged; nothing is published.
[Diagram evidence and limits](../integrations/gitlab/README.md#native-mermaid-and-plantuml).

The preceding GitLab checkpoint prevents reference loss when native text is typed
immediately beside issue/MR/user/label atoms. Canonical source preserves their
HTML text-node boundaries without adding visible separators; code/link marks
that would erase reference semantics refuse export while the document remains
editable. Thirty real-renderer fixtures and 29 new regression cases accompany a
recorded actual-service journey: **19 checks**, zero browser errors, and all four
kinds retained after save/reopen/restart. All **5,855 unit tests/357 files**,
current types/API and unchanged size limits pass. The 17-file source
rollback/reinstall passes; the nine-suite upstream set remains **304 passed /
2 failed / 306 total**, with the two unfinished requirements unchanged. Full
product acceptance and exact untouched-section spelling retention remain open.
[Boundary evidence and limits](../integrations/gitlab/README.md#reference-text-boundaries).

The preceding GitLab work adds native reference controls: ID/title/summary display,
absolute URL copy, real new-tab navigation, removal/undo, retained qualified
source and offline draft recovery without stealing the current cursor. The
actual-service journey passes **18 checks**, including save/reopen/restart;
twelve isolated component states pass 18 checks with zero accessibility violations.
All **5,826 unit tests/356 files**, current types/API and unchanged size checks pass.
The native reference-render boundary and thirteen new component cases pass.
GitLab's nine-suite set is **304 passed / 2 failed / 306 total**; specialized code
and full media requirements remain open. Reference autocomplete/hover cards,
EE-only epic acceptance, full roles/workflows and the other two complete products
also remain open. The GitLab bridge still uses canonical serialization after
edits; exact untouched-section source retention remains separate work. No public
library/API or size-limit change is introduced.
[Reference evidence and limits](../integrations/gitlab/README.md#native-reference-controls).

The preceding work hardens real media-file replacement: picker ownership, mapped retry
targets, preservation of image links/title/description/dimensions, wrong-kind
refusal and cleanup. The real workflow exposed a shared pipe-table alignment
defect; direct and nested imports now distinguish implicit/default from explicit
physical-left columns, including rendered RTL reopening in all three desktop
engines. All **5,786 tests/355 files** and existing package/API/runtime/format/
framework/size/performance gates pass. GitLab's eight-suite set is **290 passed /
3 failed / 293 total**. The real recorded service journey passes **24 checks**,
including upload/retry, source persistence, private-access refusal and restart;
reader video playback now requires advancing time and completion. Twelve isolated
component states pass 21 checks with no accessibility violations. Complete media,
specialized-code and reference menus,
remaining application workflows and the other two full products remain open.
Audio dimensions survive editing, but GitLab's reader still uses standard sizing.
[Current contracts and limits](../integrations/gitlab/README.md#native-media-file-replacement).

The preceding GitLab checkpoint adds native image/audio/video properties, canonical
URL retention, replacement uploads, dimensions, deletion, undo/redo and native
playback. Actual testing repaired inline-atom caret recovery, cold-image geometry
and node reveal, collapsed audio controls, Enter submission and description/title
recovery from GitLab's folded media labels. All **5,747 unit tests/353 files** pass,
along with package/API, runtime/headless, format, framework, size and performance/
retention gates. A retained table timeout under overlapping compilation passes
serially and in the bounded four-worker full suite without changing assertions
or timeouts. Six default/custom image-renderer journeys pass across Chromium,
Firefox and WebKit. The actual GitLab journey passes **21 checks**, including real
uploads/playback, blocked-save recovery, source switching, saved reader/reopen,
private access refusal and application restart. Nine isolated component states
pass keyboard/clipboard/accessibility checks. GitLab's eight-suite set remains
**283 passed / 3 failed / 286 total**; unfinished media, specialized-code and
reference-menu requirements remain open. Fifteen-file guarded source rollback/
reinstall and nine ordered patches verify. Aggregate CJS capacity grows by 1 KiB
for 979 measured bytes; entry, ESM, CSS, semantic and performance limits stay fixed.
This is incomplete product work, with no parity-row promotion or publication.
[Current evidence and limits](../integrations/gitlab/README.md#native-media-properties).

The preceding GitLab checkpoint adds native alerts: all five types, direct literal
title/body editing, insertion, conversion to text, deletion, undo/redo and keyboard/
mobile input boundaries. Actual renderer fixtures preserve generated versus
authored default-word titles. Structural export retains nested list, code and
fenced-math prefixes. A public opt-in export repair omits only the editor-owned
trailing caret paragraph; authored blank paragraphs remain intact. All **5,685
unit tests/350 files** and existing package/API, runtime/headless, format, size,
performance/retention and framework gates pass without changing acceptance limits.
GitLab's seven-suite set is **272 passed / 3 failed / 275 total**, including eleven
native alert cases; media, specialized code and reference-menu requirements remain
open. The final actual-service journey passes **17 checks**, including real
save/expanded-reader/reopen, private access refusal and application restart.
Thirteen-file source rollback/reinstall preserves every digest. An earlier reader
image-decode failure and an incorrectly synchronized loading assertion remain
recorded; the later pass does not establish that image intermittency is fixed.
This is Linux Chromium evidence and incomplete product work, with no parity-row
promotion or publication.
[Current evidence and limits](../integrations/gitlab/README.md#native-gitlab-alerts).

The preceding GitLab checkpoint adds native ordinary-code language controls, full-source
copy, deletion and undo/redo, with mapped targets and retained invalid/conflicting
drafts. Real renderer output is normalized through an explicit code adapter.
Public engine repairs retain required containers when deleting their final block
and land the caret in the immediate replacement or successor. All **5,614 unit
tests/347 files** pass. Package/API, headless/server, format, size, performance/
retention and framework type checks pass; an initial math-routing regression is
repaired and its failed run is retained. GitLab's scoped upstream set is
**260 passed / 4 failed / 264 total**, including ten passing new code-control
cases. Four component states at desktop/narrow widths pass eight checks with
zero accessibility violations. The final actual GitLab journey passes **17 checks**,
including a viewport assertion for nested deletion/typing, exact source saving,
reader reopen, anonymous refusal and application restart. Native acceptance is
currently Linux Chromium-only.
Diagrams, frontmatter, suggestions, GLQL and complete snippet workflows remain
unfinished. The four legacy contextual-menu requirements still fail; no parity
row or full-product claim is promoted.
[Current evidence and limits](../integrations/gitlab/README.md#native-ordinary-code-controls).

The preceding real GitLab checkpoint adds native text-link creation, preview, copy,
editing and removal, with mapped selection, one-step undo/redo, strict host URL
resolution and retained drafts during real network failure. Its recorded journey
passes **17 checks**, including actual save/reopen, anonymous refusal and application
restart. The preceding upload profile separately passed 18 checks; those scenarios
are not all rerun by the link profile. Public repairs preserve mark order during
attribute updates and serialize one continuous link across mixed text formatting.
The full unit suite passes **5,560 tests/344 files**; types/API, package/headless/
server runtimes, size and performance/retention checks pass. The actual upstream
set is **250 passed / 4 failed / 254 total** (includes 64 additional work-item
description cases). Alert, media, code-block and reference menus remain unfinished.
Seven isolated component states plus a narrow preview pass portal-inclusive
accessibility checks; these fixtures are separate from real GitLab acceptance.
Actual link acceptance is currently Linux Chromium-only. Full product/release
acceptance remains open. No parity row is promoted, and the other two full products
remain unimplemented. Immediate follow-up: the four remaining contextual menus.
The reader's intermittent initial lazy-image decode remains open despite later passes.
[Current evidence and remaining work](../integrations/gitlab/README.md#native-text-link-controls).

FountainJS is an MIT-licensed structured-document engine with a web editor,
framework bindings, and optional document modules. The immediate goal is a
reliable beta that developers can install, integrate, and evaluate through
complete editing, review, and conversion workflows.

## Next beta

The local candidate version is **0.5.0-beta.1**, not yet published. The next minor version accounts for the
change to the default Yjs storage adapter. Existing XML rooms require the legacy
entry or an explicit migration. The [adoption guide](YJS_DEFAULT_ADOPTION.md)
explains both routes.

The candidate includes the existing local engine, format, framework, and UI work.
Its scope is fixed around the following outcomes.

| Outcome | Acceptance evidence |
| --- | --- |
| Ordinary editing preserves content and selection | Native typing, Enter, deletion, forward/backward selection, tables, quotes, math, clipboard, and undo/redo work through public editor controls. |
| Collaboration preserves both authors' work | Offline and concurrent edits converge, author undo is isolated, room replacement preserves drafts, and recovery survives retries and reload. |
| Document conversion reports its actual fidelity | Supported Markdown, HTML, DOCX, JSON, and PDF workflows preserve their documented subset and report conversion losses. Actual exports receive visual review. |
| Applications can adopt the editor | Plain DOM, React, Web Component, Vue, Svelte, and Angular integrations have runnable examples and guides. Existing framework forms retain their values and reset behavior. |
| The tested package is the shipped package | One candidate revision passes package, browser, runtime, type, size, and performance gates. Published docs and demos identify its version and limits. |

Capability fixes that meet these outcomes take priority. The broader ideas below
remain available for later releases.

## Release gates

The beta remains pending until the candidate has the following evidence.

1. A complete `pnpm check` run for the exact runtime revision, including all
   source tests and existing latency, memory, and code-size limits.
2. Hosted CI covering Chromium, Firefox, WebKit, Android/Chromium emulation,
   and iPhone/WebKit emulation, including default Yjs and migration recovery.
3. Packed ESM/CommonJS imports and types, both Angular ESM entries, and clean
   consumer installation. Node, Bun, Deno, and workerd cover the server entry.
4. Real Lean integration against the pinned toolchain and recorded visual
   review of the release's editor, reader, and export workflows.
5. Matching version, tag, changelog, website, and package metadata. The approved
   npm stage and a registry installation establish publication.

The commands and publication procedure are in [RELEASES.md](RELEASES.md).
The latest complete local `pnpm check` passes **5,389 tests in 332 files**,
including the external source-capture API and inline-atom caret repairs. All
package/API, server/headless, format, type, size, performance and retention gates
pass. Compiled native reference typing/deletion/undo passes in all three desktop
engines. The broader GitLab profile remains 11 passes/one Windows WebKit copy
failure, with all four cases passing in Linux WebKit/Xvfb. The GitLab codec is
partial; unchanged source can be exact, but edited output is currently canonical.
This is not full product, physical-device, packed-consumer or hosted-release proof.
[Current evidence and missing conversions](../integrations/gitlab/README.md#gitlab-rendered-document-codec).

The following private integration audit repairs conversion failures interrupting
view updates and reference clicks leaving an editable draft. Explicit error
events with no current Markdown allow the host to prevent stale submission;
Undo and reload recover. All 54 focused cases, root types, nine compiled Windows
and five Linux WebKit native journeys pass. The 5,393-test full unit run precedes
the seven added interaction cases; the full package gate above remains the
5,389-test checkpoint. Actual host save/storage/auth and full product integration
remain unfinished. [Recovery evidence](../integrations/gitlab/README.md#serialized-content-lifecycle).

The subsequent GitLab math adapter reuses native editable math for the tested
dollar, legacy-backtick, inline-display, fenced and retained-annotation forms.
The final complete unit suite passes **5,437 tests in 335 files**, including 37
math cases; 91 focused cases and root types pass. Recorded current math journeys
pass in all desktop engines and all six Linux WebKit component journeys pass.
Known conversion refusals remain explicit. This is not a full GitLab application
or a refreshed complete package/hosted gate, and parity-row counts are unchanged.
[Math evidence and limits](../integrations/gitlab/README.md#gitlab-math-adapter).

A prepared patch now guards the actual GitLab host's rich-to-Markdown handoff:
read current serialized content before unmounting, keep the document open on
refusal, and route restored-mode preferences through the same check. The native
Fountain surface provides this protocol through a host-owned reader and
composition tracking. The full unit suite passes **5,452 cases/336 files**;
fifteen handoff cases, thirty focused cases, current native journeys and root
types pass. The actual GitLab application/upstream Jest suite remains unfinished.
No parity row is promoted.
[Host patch and scope](../integrations/gitlab/README.md#prepared-host-markdown-handoff-patch).

The cumulative patch now also guards native submission, the fresh-value facade
and the actual legacy asynchronous submit handler. Current fields are published
synchronously; conversion/composition refusal, changed content during checks and
duplicate attempts stop submission without clearing newer drafts. The complete
unit suite passes **5,472 cases/338 files**, 35 focused cases and root types pass,
and current Windows/Linux component journeys pass in their documented profiles.
These are selected-host/component checks, not real server acceptance. Arbitrary
custom AJAX handlers, upstream suites and authenticated application workflows
still need verification. A separately pinned real GitLab baseline is prepared;
the matching replacement build is not finished. Capability counts are unchanged.
[Submission scope](../integrations/gitlab/README.md#prepared-current-document-submission-patch).

The real original GitLab baseline now runs at the matched `19.5.3` image/source
pin. Recorded native Linux Chromium verifies authenticated issue creation,
image upload, rich editing, UI save/reopen, anonymous denial and exact saved
source/image retention after a container restart. The original source passes
160 tests; the matching prepared host patch passes 168 in the same three GitLab
Jest suites. Optional alert handlers and incomplete unit setup were repaired
without relaxing assertions or timeouts. The refreshed Fountain unit suite
passes 5,472 cases/338 files. The running application still uses its original
frontend; deployment of the complete Fountain component/toolbars/adapters and
broader product acceptance remain unfinished. No parity row is promoted.
[Real-product baseline and remaining scope](../integrations/gitlab/README.md#real-gitlab-original-product-baseline).

The matching full frontend now builds and runs with the prepared host patch.
Loaded script digests and a real rich/source/rich save/restart journey are
recorded. The final run passes; earlier blank-image failures after restart remain
an open intermittent finding. A new native Fountain document service also passes
a separate real GitLab render/edit/save/reimport audit in Node, with its own
upload and visually reviewed result. Full units pass **5,483/339 files**, plus
26 focused cases and root types. The browser still uses GitLab's existing editor;
native component/toolbar/provider deployment and broader acceptance remain open.
No capability-row promotion or refreshed publication gate is claimed.
[Native service/deployment scope](../integrations/gitlab/README.md#rebuilt-host-deployment-and-native-document-service).

The earlier complete local source check is the November 11 runtime-editability
repair: **5,300 tests in 327 files**, with all package, server, type, conformance,
size, performance and retention gates passing. Three native interaction-mode
journeys pass on Chromium/Firefox/WebKit. The actual Vue 2 surface bridge passes
both journeys in Chromium/Firefox on Windows and WebKit on Linux Xvfb; the
Windows WebKit external-copy failure remains recorded with an independent
control. This runtime change supersedes earlier archive identity claims: a
fresh final package and combined hosted checks remain required.
[Current bridge evidence](../integrations/gitlab/README.md#implemented-integration-primitive).

The subsequent serialized-content controller adds asynchronous load/template
history, cancellation, conflict protection and host change notifications. The
complete unit suite passes **5,311 tests in 328 files**, and root TypeScript
passes. Its native lifecycle journey passes in all desktop engines and Linux
WebKit; the existing Windows WebKit external-copy failure remains. These checks
use an explicit ordinary-Markdown codec, not a completed GitLab dialect adapter.
No library runtime/API or size limit changes in this follow-up.
[Lifecycle scope and evidence](../integrations/gitlab/README.md#serialized-content-lifecycle).

The GitLab resolver now implements the six rendered-resource/reference
operations using the host render callback, inert HTML parsing, bounded caching,
retry and cancellation. Thirty-seven focused Node cases and root TypeScript
pass; the private browser bundle compiles. Pinned fixture extraction records
provenance and retains the upstream license. A live public render attempt
returns 401, so no authenticated service or full-application pass is claimed.
The subsequent complete unit run passes **5,348 tests in 329 files**; this is
not a repeat of all packaging/browser/release gates.
[Resolver scope](../integrations/gitlab/README.md#rendered-resource-and-reference-resolver).

The earlier complete local source-check checkpoint is `e15335c7`, including the offline
equation HTML projection and earlier image-caption/recorded-audit repairs. Its library runtime is byte-identical to
`024ff8fe`, including the virtual-layout host-control repair. It passes all 5,279 source tests in 323 files and the
package, Node/workerd, type, performance, retention, format and size gates.
Fresh packed ESM/CommonJS consumers and both type analyses also pass outside
the repository without browser globals, React, Yjs or jsdom. Publint retains
its existing DOCX warning.

The complete local editor/mobile run finishes with 1,063 passes, 19 existing
skips and two Firefox lazy-loading timeouts. Both exact failed cases pass
serially with unchanged assertions and timeouts. The traces show much slower
browser/page setup in the failed run, consistent with transient contention;
the root cause is not established and this is not a clean parallel matrix.
The complete Firefox project subsequently passes with one worker: 333 passes,
nine existing skips, no retries or changed assertions/timeouts. All five
projects therefore have failure-free runs at the same runtime revision,
collected across the original matrix and the Firefox follow-up. Linux display
clipboard checks and fresh hosted CI remain required.
[Current checkpoint](RELEASES.md#repaired-runtime-integration-checkpoint--2026-11-11).

Fresh checks at `b03ad598` also pass pinned Lean, Bun, Deno, the production
site build, default Yjs (48), startup (24), migration recovery (21), compiled
native-presence (108), and three production starter-download journeys. All
1,008 distribution files remain byte-identical to the tested archive. Those
executions overlap and do not count as new capabilities; hosted CI must
refresh these outcomes for the final candidate.
[Supplementary evidence](RELEASES.md#supplementary-release-validation--2026-11-11).

The caption preview also passes three desktop source-server checks, three
production-subpath checks, and eight recorded release journeys. Visual review
covers eight full-resolution states, sampled recording timelines, and both
PDF pages in current bundled renderers. Continuous playback, older-renderer
differences and known DOCX viewer omissions remain distinct from these passes.
The earlier broad browser matrix predates this demo change; fresh combined
hosted CI remains required.
[Recorded journey evidence](RELEASES.md#recorded-release-journeys--2026-11-11).

CI now includes a required independent `recorded-ui` job for those eight
journeys and six built-site starter/caption checks. Local CI-mode execution
passes eight journeys; the stable production configuration passes all six.
Fourteen release-policy checks and both configuration/root typechecks pass.
These validate the new wiring locally; hosted Linux execution is still pending.

The actual Word research-paper journey is also registered in all three main
desktop projects. Six CI-mode local executions pass without retries, preserving
caption/math/table editing, line/history behavior and actual download/reopen
assertions. Its output is isolated per attempt and uploaded by CI. Captured
HTML math/page-template fallbacks remain documented limits, not visual parity.
[Research-document evidence](RELEASES.md#research-document-ci-coverage--2026-11-11).

Standalone candidate installation is now part of required CI too. Plain DOM
and React build outside the checkout and pass six desktop editing journeys;
the Node starter passes conversion and a blocked-optional-peer/no-DOM probe.
Three production download journeys verify the updated ZIPs. Visual review also
fixes the Windows WebKit font fallback in both starter shells. These are local
archive checks; hosted CI and registry consumption remain pending.
[Installed-starter evidence](RELEASES.md#installed-standalone-starters--2026-11-11).

The local Conversion Lab additionally offers offline MathML in HTML downloads,
with original TeX retained, an explicit source-only option and per-equation
fallback reports. Six desktop journeys and 50 focused checks pass, with captured
reader states reviewed. Library default HTML remains source-only; font/layout
and page-template fidelity remain separate. The full local gate and built-site
equation checks now pass; the combined hosted matrix remains pending.
[Equation-export evidence](RELEASES.md#offline-equation-html-projection--2026-11-11).

The website now labels its source/package/npm identity on all 20 public pages
before JavaScript runs, with narrow-screen and print checks. Framework and
preview copy is reconciled. Nineteen focused checks, six homepage interaction
checks, 15 built-site checks and eight recorded release journeys pass locally;
the built metadata names clean source `72174160`. These overlapping executions
are verification evidence, not new capability counts.
[Website identity contract](WEBSITE_BUILD_IDENTITY.md). Copy recovery and the named contrast repairs now have local evidence; broader
accessibility, larger-document/production profiling and marketing-page rendering stay open.

Homepage Copy now has an accessible manual recovery path and snapshot-bound
feedback. The targeted text colors measure at least 5.15:1 in all three desktop
engines. Recovery/race/contrast cases pass, but the positive Windows WebKit API
paste case fails in both Fountain and a plain native control: source 14/15,
built site 29/30. Required Linux display-backed checks retain that assertion;
publication remains pending those results.
[Copy/contrast evidence](RELEASES.md#homepage-copy-and-contrast--2026-11-11).

Homepage selection-only export work is repaired. Nine additional journeys use
a 502-block fixture within the existing character limit. The initial refusal
was caused by an oversized fixture; false success reporting is now fixed with
an explicit rejected outcome. Three source and three compiled native clipboard
journeys pass. The full local check passes 5,291 tests/325 files and every
existing package/runtime/type/format/size/performance gate. This is not whole
product, physical-device or hosted-release approval.
[Measured scope](WEBSITE_BUILD_IDENTITY.md#homepage-export-work).

The three flagship showcases must meet the [professional reference-product
requirements](PROFESSIONAL_REFERENCE_PRODUCTS.md). The existing limited issue
and task workflow labs do not satisfy that requirement. GitLab integration has
a pinned, reproducible upstream contract inventory and a tested real Vue 2
surface component. The complete Markdown/host/service adapters and real
application verification remain outstanding.

## Remaining parity work

The [capability ledger](TIPTAP_PARITY.md) records 61 Delivered, eight Partial,
two Host boundary and three Missing rows. The November 11 upstream catalogue
review added charts/diagrams, template slots and a whiteboard surface to the
previous 71-row scope. These are capability counts. Release readiness also
depends on the evidence above; the new outcomes do not expand this beta.

| Area | Work still required |
| --- | --- |
| Collaboration | Current release validation, sustained storage/history growth, realistic input responsiveness, and production adoption. |
| Formats and layout | Deeper DOCX/Word fidelity; clearer adoption of the distinct Markdown profiles, broader GFM coverage and exact model reopening; gradual ODT/EPUB support with independent fixtures. |
| Browser behavior | Complete cross-browser coverage for the current candidate and diagnosis of intermittent failures. |
| Mobile and IME | Physical iOS/Android keyboards, composition, autocorrect, selection, and clipboard evidence. |
| Accessibility | Additional menu and custom-renderer states plus assistive-technology testing. |
| RTL and localization | Remaining shared automatic-direction cases, inline isolation, broader host CSS and bidi behavior, and locale packages. |
| Frameworks | Broader framework-version coverage and equivalent optional UI/form integrations. |
| Onboarding | Stronger end-to-end examples, practical customization recipes, and independent developer integration evidence. |
| Host infrastructure | Tested self-host references and example storage, authorization, REST, webhook, and notification contracts. |

After the beta, measure browser input-to-paint latency and long-running
collaboration under representative workloads. Compare the same document and
operations with ProseMirror plus Tiptap. Current retained-Yjs measurements are
transaction bursts and in-memory exchanges. The
[diagnostic](YJS_ENDURANCE_DIAGNOSTIC.md) documents their workload and limits.

Markdown's default profile has 563/652 CommonMark fixture matches; the ordinary
complete-file profile has 635/652, with 17 documented policy differences. An
explicit source-data profile reaches 652/652 using inactive URI capture and
other declared options. That does not establish default editor, safe HTML,
GFM or exact model-reopening parity. Keep these contracts separate.
[Profile evidence and remaining boundaries](MARKDOWN_DOCUMENT_FLOW.md).

## Future work retained

The earlier proposals remain in [ROADMAP_HISTORY.md](ROADMAP_HISTORY.md),
including their scope, sources, and required proof.

- A self-contained `.fjs` package with assets and a portable local reader.
- Broader document ingestion, reproducibility tools, and migration adapters.
- Scientific workflows combining technical source, citations, references,
  proof checking, review, and verified publication output.
- Native renderer prototypes and a language-neutral document/operation protocol.
- Monaco/CodeMirror, Jupyter-kernel, and terminal adapters for structured workspaces.
- Authorable forms with separate definitions, respondent views, and submissions.
- Editable charts/source-backed diagrams, validated template slots and variable
  bindings, and an optional structured whiteboard surface. The
  [November 11 catalogue audit](TIPTAP_PARITY.md#catalogue-review--2026-11-11)
  records the missing outcomes and their upstream references.
- Provider-based audio/video transcription and further language-service modules.
- Further block, table, media, and editorial features justified by complete use cases.

These proposals enter an active release after their editing, persistence,
security, interoperability, accessibility, and performance contracts are defined.

## Project name

Keep **FountainJS**. The November 8 naming review found existing uses of
Inkognito in document processing and other products. A later naming decision
requires another candidate and a compatibility plan.
[Recorded naming review](ROADMAP_HISTORY.md#inkognito-naming-check-2026-11-08).

## Engineering record

[ROADMAP_HISTORY.md](ROADMAP_HISTORY.md) preserves the previous roadmap in full.
Its dated entries describe the evidence available at each checkpoint. Current
release decisions use this page, [the capability ledger](TIPTAP_PARITY.md), and
[the release evidence](RELEASES.md).
