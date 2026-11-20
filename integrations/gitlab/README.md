# GitLab application integration

**Merge-request creation, November 20.** On GitLab CE 19.5.3 in Linux Chromium 151, both editors created a merge request from the branch picker and reopened its formatted description. Both contained the new second paragraph immediately before Save. Fountain `44219116` retained it in both the API and the reloaded reader on !224. Stock GitLab lost it from both on !225. The ten checks yield eight parity and two improvements measuring the same saved edit. A stock attempt stopped before creation when the GitLab upgrade notice interrupted the branch picker. The recorded comparison uses the completed retry. [Matched builds and checks](../../artifacts/gitlab-compatibility/mr-create-20261120/verified/report.md) · [Fountain after reload](../../artifacts/gitlab-compatibility/mr-create-20261120/fountain-2/updated-reader.png) · [Stock after reload](../../artifacts/gitlab-compatibility/mr-create-20261120/original-3/updated-reader.png) · [Reproduce the workflow](runtime/README.md#reproduce-merge-request-creation).

The same administrator workflow on Fountain `44219116` passed all ten checks on [Firefox 153](../../artifacts/gitlab-compatibility/mr-create-firefox-20261120/reviewed/report.md). Both [WebKit 26.5 runs](../../artifacts/gitlab-compatibility/mr-create-webkit-20261120/reviewed/report.md) retained the added paragraph and formatting. Each recorded eleven browser errors involving event collection, branch search, GraphQL, CI environment status, drafts and notes. Their messages include run-specific URLs. Nine checks matched; the browser-error check remains incomplete. These two pairs used the collector at `1e60e804`.

On Chromium 151 a signed-in project Developer created !232 on Fountain and !233 on stock, then used **Edit merge request**. GitLab identified the same Developer as author before and after each edit. Both live drafts contained “The smoke test passed.” immediately before Save. Fountain retained it after reload. Stock lost it from the API and reader in this run; stock had retained it in an earlier attempt. The first attempt also sampled the stock editor during loading. The collector now waits for a populated paragraph, and the comparator withholds that earlier observation. [Matched result and builds](../../artifacts/gitlab-compatibility/mr-create-developer-20261120/verified/report.md) · [Earlier loading observation](../../artifacts/gitlab-compatibility/mr-create-developer-20261120/loading/report.md).

**Issue drawer layout, November 20.** On GitLab CE 19.5.3, stock and Fountain `44219116` passed all 13 board-to-issue checks in Linux Chromium 151. Both short descriptions had a 140 CSS pixel editing area. At desktop width, Save sat 453 pixels from the top of the stock drawer and 463 in Fountain. At 390 pixels wide, both Save buttons remained reachable and the Fountain limits disclosure opened and closed by keyboard. An earlier attempt showed two cards for issue #610 just after creation. The completed runs showed one card when the drawer was ready and after reload. The cause of the earlier duplicate remains open. [Matched results and build identities](../../artifacts/gitlab-compatibility/board-layout-20261120/comparison-2/report.md) · [Fountain drawer](../../artifacts/gitlab-compatibility/board-layout-20261120/fountain-2/board-drawer-edit.png) · [Narrow disclosure](../../artifacts/gitlab-compatibility/board-layout-20261120/fountain-2/board-limits-narrow.png) · [Earlier duplicate cards](../../artifacts/gitlab-compatibility/board-layout-20261120/fountain-1/board-interrupted.png)

**Issue-board editing, November 20.** GitLab CE 19.5.3 and Fountain build `8fb3bd2c` passed the same ten checks on Chromium 151. An administrator created an issue from the board, saved a formatted description in its drawer, followed the issue link and posted a bold comment. After returning through the project navigation and reloading, reopening the original card showed both edits. GitLab’s APIs confirmed the exact Markdown on issues #608 and #609. The Fountain editor occupied more vertical space in the drawer, including its integration notice. Other board types, mobile input and non-administrator roles remain open for this workflow. [Matched builds and results](../../artifacts/gitlab-compatibility/board-issue-20261120/comparison-2/report.md) · [Stock drawer](../../artifacts/gitlab-compatibility/board-issue-20261120/original-2/board-drawer-edit.png) · [Fountain drawer](../../artifacts/gitlab-compatibility/board-issue-20261120/fountain-2/board-drawer-edit.png) · [Reproduction steps](runtime/README.md#reproduce-issue-board-editing)

**Personal saved replies, November 20.** In the GitLab CE 19.5.3 issue discussion, an administrator and a Reporter each searched for the same prefix and saw only their own matching template. GitLab attributed each posted comment to the correct author. Both readers reopened the comments with bold and inline-code formatting intact. In a separate issue, cancelling the picker preserved the draft, and replacing selected text supported one-step undo and redo while the issue description stayed open. On Chromium 151, Fountain build `8fb3bd2c` passed all 18 checks. Stock GitLab matched 17. Immediately after insertion, keyboard focus was in the Fountain comment editor and outside the stock editor. Group and project templates, mobile input, and other GitLab editions remain unverified here. [Matched builds and results](../../artifacts/gitlab-compatibility/reply-accounts-20261120/comparison-3/report.md) · [Reproduction steps](runtime/README.md#reproduce-personal-saved-replies)

**Active acceptance work, November 19.** In GitLab CE 19.5.3 an issue description
and its discussion composer can stay open together. The stock and Fountain
runs passed all 44 checks across both save orders. The comment toolbar applied
bold, the description toolbar applied italic, and undo and redo acted on the
intended editor. Switching the description to Markdown preserved the comment.
The API and reloaded issue confirmed independent persisted records. This run
used one administrator and a local backend. The emoji repair build passed all 44 checks on Chromium 151. [Comparison and rollback on the same build](../../artifacts/gitlab-compatibility/emoji-composer-rollback-20261119/comparison-2/report.md). The earlier review-feedback build passed all 44 checks on Chromium 151 and Firefox 153. [Chromium comparison](../../artifacts/gitlab-compatibility/confirmed-review-rollback-20261119/comparison-1/report.md) · [Firefox comparison](../../artifacts/gitlab-compatibility/composer-firefox-20261119/comparison-1/report.md). The subsequent Unicode repair build passed the same 44 checks on Linux WebKit 26.5. [WebKit comparison and four-record rollback](../../artifacts/gitlab-compatibility/unicode-composer-rollback-20261119/comparison-2/report.md).

On the merged-table build `7c85ae01`, both save orders again passed all 44 independent-editor checks in Chromium. After rollback, stock GitLab reopened issues #554–557 and retained each bold discussion comment and subsequent Markdown edit. Immediate rich-text Save at 4.7–9.2 ms lost the final edit on all four, including both stock-authored controls. The strict rollback check remains open. [Matched controls and four-record rollback](../../artifacts/gitlab-compatibility/merged-composer-rollback-20261119/comparison-1/report.md). The same build preserved merged issue tables through copy, cut, undo, redo and reopening. [Table comparison](COMPATIBILITY_GRID_RESULTS.md#merged-cell-clipboard-and-save).

A later build restored original Unicode spaces when reopening a GitLab suggestion. The live test verified the source in the editor, the saved review and the actual file change. [Deletion and whitespace results](COMPATIBILITY_DELETION_RESULTS.md).

For GitLab emoji, the adapter keeps the visible glyph inside its original formatting. Unchanged documents retain their exact Markdown. On an edited document it can retain a shortcode on original text when the source uses that spelling unambiguously. New text and ambiguous mixtures of literal glyphs and shortcodes can serialize as Unicode. Custom image emoji and emoji autocomplete remain open. [Project-preview fixtures](fixtures/clipboard-unicode-live-html.json).

Two reviewers clicked Apply on one suggestion from separate sessions. Both stock GitLab and Fountain saved one commit. Fountain’s second reviewer immediately saw the Applied badge once GitLab confirmed the saved suggestion. Stock still showed a reference error and an Apply button until reload. The two improvement checks cover the message and controls for this one interaction. [Matched live screens and persisted results](../../artifacts/gitlab-compatibility/review-feedback-20261119/comparison-3/report.md).

The review-feedback build restored 12 original files byte-for-byte, removed 22 integration files, and reproduced all 34 file hashes on reinstall.
The compiled-frontend rollback for this build retained issue descriptions and bold comments on
the same database volumes. Stock GitLab saved and reopened changes made in
Markdown on both Fountain-authored issues and both stock-authored controls.
Immediate rich-text Save lost the last edit on all four. This behavior also
affects records created entirely in stock GitLab. The packaged frontend fails the rapid rich-text Save check. An [opt-in Tiptap fallback](runtime/README.md#reproduce-the-prepared-tiptap-rich-text-rollback) reads the current document at Save and recognizes the returned Markdown without reloading the editor. That deployment retained the final character on all 12 tested issues across Linux Chromium, Firefox and WebKit. The revised fallback `307cccf7` returns focus during the formatting click. With Fountain `44219116`, the same fallback build passed on 12 issues across desktop Chromium, Firefox and WebKit. All rapid insertions, deletions, subsequent Markdown edits and bold comments survived reload. Earlier Firefox runs recorded one wrong-character deletion and one unavailable edit form. Their causes remain unconfirmed. [Browser results, build identities and reproduction](runtime/README.md#reproduce-the-prepared-tiptap-rich-text-rollback).
Removing the optional Ruby footnote repair also preserved the fixture's Markdown and cached links. Regenerating its HTML under stock GitLab reproduced the same broken repeated reference as a fresh stock issue. Wider role, device, workflow and production deployment acceptance remains open.
[Cache rollback procedure and receipts](runtime/README.md#reproduce-rollback-with-the-footnote-renderer) · [Controlled rollback and build identities](../../artifacts/gitlab-compatibility/confirmed-review-rollback-20261119/comparison-1/report.md) ·
[Source restore and reinstall](../../artifacts/gitlab-native-browser-install/roundtrip.json) ·
[Deployment instructions](runtime/README.md#reproduce-the-frontend-deployment-and-rollback).

On the active Fountain frontend, immediate rich-text Save retained both the
last character typed and a final Backspace. Stock GitLab lost both edits despite
showing the correct text when Save was clicked. The measured intervals were
49–56 ms across the four immediate trials. Both editors retained both edits in
the 552–566 ms controls. Each result was checked in the issue API, reloaded
reader and reopened rich editor. The eight improvement rows measure two edits
at four observation points. These desktop Chromium results leave the stock
rollback limitation open.
[Builds, timings and saved outcomes](../../artifacts/gitlab-compatibility/immediate-save-20261119/comparison-1/report.md).

Two more workflows disconnect the browser while the author edits an issue.
Each records a failed GitLab mutation containing the exact draft and checks the
server from a separate online session. Both editors retained the draft and
saved it after reconnecting, including when the author reloaded the page before
retrying. Fountain displayed a failed-Save alert explaining that the draft was
kept. Stock GitLab left the edit form open without that warning. Both trials
used a single author.
[Offline Save and retry comparison](../../artifacts/gitlab-compatibility/reconnect-save-20261119/comparison-1/report.md).

The two-author follow-up passed 18 matched checks. A Developer's rich-text Save
failed offline. The issue author edited the same paragraph in Markdown and
saved it from another session. Both editors showed the Developer their draft and
the author's exact newer text on reconnect. Discard kept the author's edit.
Explicit overwrite saved the Developer's draft. The API and reloaded reader
agreed in all four trials. The conflict was hidden before reconnect and visible
before an ordinary retry could be clicked.
[Comparison and build identities](../../artifacts/gitlab-compatibility/offline-conflict-20261119/comparison-2/report.md).

The [concurrent issue comparison](../../artifacts/gitlab-compatibility/issue-races-20261119/comparison-5/report.md) adds 30 parity checks and one shared limitation. The open disclosure updated to show the issue author's second saved change. Discard kept that version and explicit overwrite saved the Developer's original draft. With two overlapping rich-text Saves, GitLab acknowledged one, persisted its full description, and kept the other person's draft and conflict controls visible. The competing request returned HTTP 500 on each build. The pinned server's logs for earlier overlapping calls identified `ActiveRecord::StaleObjectError` in `IssuableBaseService#transaction_update`. The earlier runs preserve the [reopened-field observation](../../artifacts/gitlab-compatibility/issue-races-20261119/comparison-2/report.md) and [immediate stock Save failing to establish the incoming edit](../../artifacts/gitlab-compatibility/issue-races-20261119/comparison-4/report.md).

The first pair switched the online author immediately from rich text to Markdown.
Both stock trials lost the new suffix during that switch, before the competing
edit could be saved. Those trials could not establish the conflict precondition
and received no conflict score.
[First attempt](../../artifacts/gitlab-compatibility/offline-conflict-20261119/comparison-1/report.md).

Merge-request review now has 63 matched Chromium checks across three ranges:
line 2 expanded to 1–3, lines 2–3 narrowed to 3, and line 2 extended to 2–4.
The first run found that the replacement-text dialog refused an edit when a
posted suggestion covered two lines and the host supplied its anchor line.
Fountain now retains the stored range for a text-only edit. Extending beyond
the known lines still requires the original file. All three proposals survived
undo, redo, Save and reopen, and each Apply created one commit changing exactly
the intended lines. The repaired build was compared with the same stock run
after checking the unchanged fixture, harness and backend. Reinstall restored
all 32 owned files to their recorded bytes.
[Repaired comparison](../../artifacts/gitlab-compatibility/review-ranges-20261119/comparison-2/report.md) ·
[Earlier failure](../../artifacts/gitlab-compatibility/review-ranges-20261119/comparison-1/report.md).

Desktop WebKit 26.5 on Linux passed the same 44 independence checks on the
repaired Fountain build and stock GitLab. A timed comparison reproduced the
stock Save loss on a final character and Backspace at 21–22 ms. Fountain kept
both edits at 24–36 ms. Both retained them in the half-second controls.
[Timed WebKit comparison](../../artifacts/gitlab-compatibility/quick-webkit-20261119/comparison-2/report.md).

The stock frontend reopened the data after rollback. At 7–11 ms between the
final key and clicking Save, it lost the edit on both Fountain-authored records
and both stock controls. Markdown Save and the existing bold comment survived
on every record. The earlier rollback run passed at ordinary interaction speed
without measuring the interval. The rollback check now requires trusted input,
the expected visible text at click time and a measured interval under 100 ms.
[WebKit rollback, exact builds and issue IDs](../../artifacts/gitlab-compatibility/composer-webkit-20261119/comparison-2/report.md).

Two stale-review cases change an actual branch after a suggestion is posted.
Both editors sent the Apply request. GitLab refused it in all four trials and
kept the newer source, branch head, original note and unapplied suggestion ID
through reload. The refreshed review named the changed line. The live discussion
said only that a file had changed. This gives 21 parity checks and one shared
feedback limitation. An initial run that only closed the live dropdown lacked
proof of an Apply attempt and received no score for that case.
[Stale review results](../../artifacts/gitlab-compatibility/stale-review-20261119/comparison-2/report.md).

The expanded suite also deletes the target line. After refresh, both editors
disabled Apply and explained why. GitLab's API confirmed the same suggestion
was inapplicable. With a live discussion and an identical line elsewhere, both
submitted Apply and GitLab returned HTTP 400. The other line, branch head, note
and suggestion ID survived reload. Across all four cases, 46 checks reached
parity and two live discussions gave only a generic file-change message.
[Changed and deleted targets, pinned builds and outcomes](../../artifacts/gitlab-compatibility/deleted-target-20261119/comparison-2/report.md).

When an insertion shifted the reviewed line, both editors applied the posted
suggestion at the new position after refresh. The whole file matched, the new
commit had the competing commit as its sole parent, and the same suggestion
remained Applied after reload. When the line itself moved to the end while
the discussion was open, both received HTTP 400 and preserved the moved file
and unapplied review. Automatic relocation in that live case remains open.
[Relocated review results](../../artifacts/gitlab-compatibility/relocated-target-20261119/comparison-1/report.md).

Native mode retention (2026-11-17): the real GitLab integration keeps the same
owned model/history across unchanged source mode, with hidden view/listener/menu
cleanup and context/host-option revalidation. The recorded matched pair passes
all 64 requirements: 52 parity/12 improvement/zero regression or shared failures.
This closes the earlier nonempty rich-return failure in these two workflows,
without relaxing backend access. 1,573 integration tests / 61 files, strict types,
429 upstream cases, nine recorded bridge journeys and 32-file source rollback
pass. Larger/native-browser/mobile/modal matrices and full release proof remain
open. Capability counts, public APIs, budgets, version and publication are unchanged.
[Mode-retention evidence](COMPATIBILITY_MODE_RETENTION_RESULTS.md).

Full membership removal (2026-11-17): the actual non-author workflow now warns
on rejected Save, preserves empty/whitespace drafts and serializes a cleared
native document as empty Markdown. Restored access, reload, Save and reopen keep
text and empty intent. The final loading-aware pair records 52 parity/10
improvement/zero regression/two shared checks across 64 requirements. Full
acceptance stays red: nonempty source-to-rich rendering after access removal
still fails on both sides. 1,567 integration tests / 60 files, strict types,
194 upstream component tests, lint and 32-file source rollback pass. No overall
capability status, public engine/API, budget, version or publication changes.
[Membership-removal evidence](COMPATIBILITY_MEMBERSHIP_REMOVAL_RESULTS.md).

Revoked-save repair (2026-11-17): the actual non-admin workflow now keeps the
pending draft and shows a clear failure when returned update authority is false;
restored access, reload, Save and reopen retain exact source. A false conflict
exposed by the retained form is also repaired. The fresh matched pair verifies
24 parity/seven improvement checks, with a separate passing feedback gate and
native-only genuine-conflict controls. 1,531 integration tests / 60 files, strict
types and 187 upstream component tests pass. Older red/partial results remain
retained. Broader roles, offline/racing cases and full application acceptance
remain open.
[Repair evidence](COMPATIBILITY_ACCESS_REPAIR_RESULTS.md).

Matched non-author access audit (2026-11-17): Guest description access and
anonymous private-record refusal pass. A real Developer-to-Guest downgrade while
editing exposes shared draft loss: UI Save closes without an error, persisted
source stays unchanged, and restoring access/reloading does not recover the draft.
The pair records 24 parity and seven correlated shared-failure checks / 31;
**feature acceptance remains red**. 1,510 integration tests / 58 files and strict
types pass. The next repair belongs at the host Save acknowledgement/draft-clearing
boundary. No production repair or capability promotion is claimed.
[Access findings](COMPATIBILITY_ACCESS_RESULTS.md).

Matched competing-edit audit (2026-11-17): two independent browser sessions
using the same root account verify 37 parity checks for local-draft retention,
actual conflict/current-version disclosure, explicit discard/overwrite and normal
fresh-session Save/reopen. 1,504 integration tests / 58 files and strict types pass.
No production repair was needed. This is UI conflict
recovery, not CRDT/atomic locking or a multi-role/offline/racing-submit matrix.
[Conflict evidence](COMPATIBILITY_CONFLICT_RESULTS.md).

Quoted/container child conversion (2026-11-17): four actual workflows verify
63 parity and 41 improvement checks / 104 correlated requirements, with zero
regressions or incomplete outcomes. Child titles/source, code indentation and
remaining parent quote/list ownership survive creation, Save and reopen. Two
nesting improvements predate this repair. 1,500 integration tests / 58 files,
strict types, 26 upstream tests and lint pass. A separate native visual follow-up
shows all four complete code prefills; it adds no matched score. Tabbed/custom
prefixes, other roles/platforms and broader application acceptance remain open.
[Container evidence](COMPATIBILITY_TASK_CONTAINER_RESULTS.md).

Matched child-conversion repair (2026-11-17): plain/scoped/ordered/nested real
workflows verify 66 parity and 14 improvement checks, with zero regressions or
incomplete outcomes. Code indentation and ordered child titles survive conversion;
the native extra paragraph is repaired without dropping authored blanks or table/
list exits. Reopened parents can be edited, saved and reloaded. 1,485 integration
cases / 58 files, strict types, 26 upstream helper tests and lint pass. Premature
loading snapshots are excluded. Quoted/custom-prefix fidelity, other roles and
broader application/UI acceptance remain open.
[Repair evidence](COMPATIBILITY_TASK_CONVERSION_REPAIR_RESULTS.md).

Matched child-task conversion audit (2026-11-17): actual parent/child records,
remaining checklist items, marks and links survive, but both implementations lose
Python indentation in GitLab's shared extraction helper. Across two profiles:
25 parity, one strict UI-structure regression (a native empty paragraph requiring
caret-provenance qualification), and six correlated shared-limitation checks.
**Acceptance remains red.** 1,462 integration cases / 57 files and strict types
pass; neither production behavior nor requirements were changed to pass the audit.
[Conversion findings](COMPATIBILITY_TASK_CONVERSION_RESULTS.md).

Matched reader-menu follow-up (2026-11-17): plain/scoped documents verify 54
parity checks for disable, rich-edit retention, restore and deletion of the nested
item among duplicate labels. Authored strike remains distinct from generated
inactive styling; exact menu source deltas and persisted task totals pass. Earlier
heading/prose observer mistakes are retained and contribute no improvement claim.
1,452 integration cases / 57 files and strict types pass. Other roles, parent/child
operations and broader platform/layout acceptance remain open.
[Reader-menu evidence](COMPATIBILITY_TASK_MENU_RESULTS.md).

Matched task recovery follow-up (2026-11-17): real populated leaf-item deletion,
two-step undo/redo, reopened editor checkboxes and reader checkbox persistence
pass. Two command-intent profiles yield 48 parity/eight improvement checks; the
improvements concern one literal-container boundary, with an actual root-command
positive control. 1,437 integration tests / 56 files and strict types pass. Terminal
startup failures are retained separately; the runner now detects confirmed exits
promptly without changing backend requirements. Wider role/platform/application
coverage remains open. [Recovery evidence](COMPATIBILITY_TASK_RECOVERY_RESULTS.md).

Matched task follow-up (2026-11-17): the actual original/Fountain lifecycle
verifies 22 parity and four improvement checks across 26 invariants. The improved
checks concern one empty-task Enter/list-exit behavior. A native conversion error
blocking Save after list exit is repaired with an explicit GitLab direction
container; real Save/reopen and backend task counts pass. Earlier collector,
expectation and startup failures remain retained separately. 1,426 integration
tests / 55 files and strict types pass. Wider task/platform/application acceptance
remains open. [Task evidence](COMPATIBILITY_TASK_RESULTS.md).

Matched directed-selection follow-up (2026-11-17): four keyboard/pointer
forward/backward workflows verify 188 parity checks for rich partial copy/cut,
external/internal paste, history and save/reopen. Document readiness is required;
empty caret formatting is distinguished from marked content. Earlier unpaced
failures and premature snapshots remain retained and unapproved as wins. 1393
integration tests / 54 files and strict types pass. Rapid input, cross-block/Unicode
and wider platform behavior remain open. [Selection evidence](COMPATIBILITY_PARTIAL_RESULTS.md).

Matched clipboard follow-up (2026-11-17): one actual original/Fountain rich
workflow verifies 84 parity outcomes across internal/external transfer, paste
history, cut/paste and save/reopen, including actual caret/clipboard readiness.
No superiority claim is made. Earlier inadequate screenshots and an intermittent
baseline append anomaly are retained; the latter remains open for stress/selection
investigation. 1387 integration tests / 54 files and strict types pass.
[Clipboard evidence and limits](COMPATIBILITY_CLIPBOARD_RESULTS.md).

Matched posted-review follow-up (2026-11-17): actual original/Fountain editing
verifies 21 parity outcomes across posted source changes, range expansion,
undo/redo, exact save/reopen and a real apply commit. No regressions or additional
improvement claim in this case. 1383 integration tests / 54 files and strict types
pass. Shared Applied-history retention and wider range/role/browser/persistence
requirements remain open. [Review evidence and reproduction](COMPATIBILITY_REVIEW_RESULTS.md).

Matched deletion follow-up (2026-11-16): two additional real original/Fountain
workflows verify 26 parity and four improvement outcomes across 30 checks, with
zero regression. Native explicit deletion explanations, whitespace-intent gating
and newline retention on rich reopen are now compared against the actual original
UI. Stock whitespace deletion and the prior Applied-history failure remain open
requirements; this is not overall product acceptance. 1381 integration tests /
54 files and strict types pass. [Deletion results and reproduction](COMPATIBILITY_DELETION_RESULTS.md).

First paired GitLab compatibility run completed (2026-11-16): matching stock
backend/browser/fixtures/instruments verify 20 parity, 12 improvement, zero
regression and four shared-limitation outcomes across 36 checks in four scenarios.
The improvements concern rapid source handoff and lossy diff-source prefill;
multiple checks exercise the same underlying issues. Both actual editors lose
Applied history on prose-only note editing, so absolute feature acceptance remains
false. 1377 scoped integration tests / 54 files and strict types pass. The previous
555 upstream tests remain the unchanged runtime baseline. No global parity,
latest-Tiptap, browser/mobile or release promotion is claimed.
[Matched results and reproduction](COMPATIBILITY_RESULTS.md).
[Wider suite plan](COMPATIBILITY_SUITE_PLAN.md).

Deletion-effect and posted-review follow-up (2026-11-16): actual application
proved that stock GitLab treats nonempty whitespace-only suggestion source as
deletion. Fountain now labels deletion blocks, uses an explicit Apply deletion
action, and requires intent confirmation for nonempty whitespace source in the
source dialog. Changing the draft resets confirmation; the command itself also
enforces it. Original source remains exact. The rule matches every Unicode scalar
against the actual pinned embedded Ruby whitespace predicate; zero-width source
and BOM are not blindly classified with JavaScript trim().

Three real native posted-note workflows verify replacement, empty deletion and
explicitly confirmed whitespace deletion, caption updates, one-step undo/redo,
exact save/reopen/application and unchanged source commits during prose-only
comment edits. Cold restart retains source, comments and commits. 1364 scoped
integration tests / 53 files, strict types and 555 selected upstream tests / 23
suites pass (one inherited skip); frontend build, 19 ordered test patches and
28-file guarded source rollback/reinstall pass.

Overall review acceptance deliberately remains FAILED: prose-only edits clear
GitLab's persisted Applied metadata. A direct stock REST control reproduces the
record replacement without Fountain editing. Its computed eligibility can also
change after restart and is recorded separately from persisted fields. The original
intended-blank-line application failure is retained; the new UI makes its deletion
effect explicit and does not claim meaningful blank-line application support.
No public API/capacity limit/version/publication or overall parity row changes.
At that earlier checkpoint, paired UI classifications were still pending; the
subsequent matched results supersede that status for their scoped workflows.

[Deletion-effect evidence](../../artifacts/suggestion-effects-integration-20261116.json).

Previous raw-source integrity follow-up (2026-11-16): native suggestion insertion now fetches
and validates raw repository lines before prefilling. Six real Rapid Diffs
contexts include literal backslash-n, genuine U+E000, their mixture, invisible
characters/trailing spaces, a blank line and an actual two-line drag selection.
The displayed transport collision is verified; Fountain preserves raw characters
rather than reversing or stripping the marker. The existing asynchronous queue
owns the captured comment target, maps unrelated edits, refuses overlap, cancels
on replacement/disposal, and blocks duplicate insertion and old-source handoff.

The actual selected-multiline UI journey inserts both distinct source values,
edits source/range, undoes/redoes, posts exact Markdown and applies a real GitLab
commit. Repository APIs verify the intended file and untouched remaining lines;
cold restart retains the note, source commit and visible Applied state. Physical
review covers the source/range modal, native draft and posted/restarted readers.
1351 integration tests / 52 files, strict TypeScript, 552 selected upstream tests /
23 suites (one inherited skip), frontend build, 19 ordered source patches and
28-file guarded source rollback/reinstall pass. No public API, capacity limit,
package version, publication or overall parity row changes. Actual context-line/
legacy variants, posted/applied-note editing, deletion/blank UI, review batches,
roles/concurrency and broader native browser/mobile/hosted acceptance remain open.
The previously retained resolved-gutter issue remains open.

[Source-integrity evidence](../../artifacts/suggestion-transport-integration-20261116.json).

Earlier native GitLab suggestion checkpoint (2026-11-16): the explicit native
candidate now inserts proposals from real diff context and exposes source/range
controls in its existing code menu. Applying source and range is one undoable
transaction. The real UI posts exact Markdown, GitLab applies it through its
normal action, and repository APIs verify the resulting file, new commit and
source-branch head. A cold container restart retains the note, file/commit and
visible Applied state in the MR overview reader.

Physical review caught and fixed unreadable replacement text under GitLab's
inline-code CSS and an unwanted empty paragraph on insertion. Ctrl+Enter exits
code without submitting the host form. Ten real contextual previews already fit
the source-aware codec. Read-only Git objects explain the different preview head
as a merge-result commit; the host's actual revision metadata is retained.

1323 GitLab integration cases / 51 files, TypeScript and 546 selected upstream
cases / 23 suites pass (one inherited skip). Nineteen test patches reconstruct
the tested source; guarded 28-file source rollback/reinstall passes. [Native suggestion evidence](../../artifacts/suggestion-native-integration-20261116.json).

This verifies a single live authoring/application/restart workflow, not full
GitLab or overall parity. Posted/applied-note editing, multiline/transport edge
cases, review batches, roles/concurrency and broader native browser/mobile
acceptance remain open. The resolved Rapid Diffs gutter did not reopen in the
probe; MR overview Applied display works and that gutter issue remains recorded.
That immediate raw-source transport finding is resolved by the follow-up above;
the earlier evidence remains a historical single-anchor checkpoint.
Default guard callers still refuse active configuration; the known native
component explicitly opts into its adapter. Public API/size/performance limits,
package version and publication are unchanged. Hosted CI/full-root release checks
were not claimed for this checkpoint.

Previous live GitLab suggestion context check (2026-11-16): the default Rapid
Diffs UI supplies extra file/commit preview metadata. Three actual form contexts
(Unicode zero-width character, empty line, trailing spaces) match the raw
repository response. The service now validates/freezes that known metadata and
rejects pending edits if the revision context changes. The production host guard
remains closed; the captured real forms visibly show its error state.

1307 GitLab integration cases / 50 files and TypeScript pass for this checkpoint.
This is not MR posting/application acceptance or a new full-root/hosted CI result.
The capture records differing MR-reported and preview SHA values separately;
their revision relationship still needs verification. Multiline/transport edge
cases, expanded preview rendering, production controls, posting/applying/batching
and native frontend/upstream/restart acceptance remain open. [Live context evidence](../../artifacts/suggestion-context-integration-20261116.json).

Previous suggestion-editing service checkpoint (2026-11-16): the native content
service now owns proposal insertion and captured source/range edit sessions.
Sessions follow unrelated edits but refuse an edited/removed/replaced target,
changed host context, revoked permission and late or superseded raw-file loads.
Range expansion checks the selected original lines and rechecks the exact file
snapshot, including line endings, before committing. Changing a range keeps the
author's replacement source intact. Conversion/filter refusals roll back content
and history. Disposal cancels the owned session and request.

A recorded browser journey found no prose paragraph after a suggestion-only
document. Ctrl/Cmd+Enter now leaves GitLab code through the existing parent-aware
gap command; ordinary Enter stays literal source. Root, quote and list cases
retain their source and structure, with exit and later typing separately undoable.

All 1290 GitLab integration unit cases / 50 files pass, including 43 new service
cases; TypeScript passes. Two recorded Chromium/Firefox journeys exercise source,
range, undo, insertion, permission refusal and keyboard exit. Screenshots and
sampled video frames were inspected. [Suggestion-editing evidence](../../artifacts/suggestion-editing-integration-20261116.json).

This is local service/control evidence using captured GitLab previews and a
fixed raw-file fixture. The actual native host still rejects active suggestions.
Live inline context capture, production controls, MR posting/applying/batching
and the new candidate's native runtime/frontend/upstream/restart acceptance remain
open. No public API/size/performance limit changes, version bump or publication.
The earlier full-root-suite results below belong to their own checkpoints.

Previous suggestion-node checkpoint (2026-11-16): source and range metadata now
live in editable typed nodes. JSON/HTML clipboard and canonical Markdown retain
empty/blank-only replacements and nested quote/list structure. A host-owned block
serializer hook reuses the native container writer. Physical tests exposed and
fixed custom-code HTML flattening, leading-LF loss, stale code-region focus and
an automatic caret becoming an authored blank after raw JSON persistence. JSON
export now has an explicit option to omit only that proven view repair.

All 6695 unit cases / 395 files pass. Six recorded Chromium/Firefox
journeys use native typing, Enter/Tab, external-text and same-editor clipboard,
and local JSON save/reopen. Types, API/package, Node/Worker/headless, existing
size/performance limits and the Markdown conformance gate pass. Screenshots and
sampled frames were inspected. [Suggestion-node evidence](../../artifacts/suggestion-node-integration-20261116.json).

Active inline suggestion context remains guarded. Insertion/range controls,
actual MR posting/applying and batching, and this candidate's native runtime/
frontend/upstream/restart acceptance remain open. The last installed GitLab
runtime is still the separately verified task-state checkpoint. No publication,
version increase or overall parity-row promotion.

Previous GitLab task-state checkpoint (2026-11-16): pending, completed and
not-applicable tasks now remain distinct through author controls, Markdown,
HTML and clipboard. Native buttons support Enter/Space; checking an N/A task
completes it, and splitting creates a pending task. Concurrent peer typing and
author undo/redo retain state and text in both tested update orders.

All 6645 unit cases / 391 files pass, alongside framework types,
540 selected upstream cases (one inherited skip), package/API/Node/Worker and
headless checks. The recorded real GitLab profile passes 20 checks,
including N/A keyboard changes, actual external-text and same-editor clipboard,
six MR/wiki rich/source cycles and Save/reopen/restart. Screenshot review caught
and repaired displaced numbered text; geometry and 24px control targets are now
asserted. Source patch reconstruction and rollback pass. [Task-state evidence](../../artifacts/task-states-integration-20261116.json).

The third state belongs to the explicit GitLab schema; the default public task
schema remains boolean-only. Generic third-state Markdown ingestion, native DOCX
checkbox retention, inline review/suggestions and broader product acceptance
remain open. Limits, package version and publication are unchanged.

Run `node scripts/run-gitlab-native-browser-audit.mjs --task-states` after matching
runtime/frontend preparation. It records the third-state controls and clipboard
journeys, restarts the app and stops the isolated container.

Previous mixed-list checkpoint (2026-11-16): ordinary bullets and checkboxes now
share one list, including numbered tasks. Markdown, browser/server HTML and
clipboard retain item kinds and state; indent/lift, split/join and selected-item
conversion preserve neighbouring content and concurrent peer typing.

All 6,623 unit cases / 388 files pass. Recorded Chromium and Firefox clipboard
journeys pass; the actual GitLab MR/wiki profile passes 20 checks, including six
rich/source cycles, Save/reopen and application restart. Screenshots and sampled
recording frames were reviewed. The 18-patch reconstruction and 28-file source
rollback pass. [Mixed-list evidence](../../artifacts/mixed-lists-integration-20261116.json).

Inapplicable `[~]` tasks still refuse editing with exact source retained; inline
review/suggestions and broader product acceptance remain open. DOCX reports lost
checkbox state explicitly; native task fidelity is still unfinished. CSS grows
336 bytes with a measured 320-byte ceiling increase; JavaScript and performance
limits remain unchanged. No package version, publication or parity-row promotion.

Run `node scripts/run-gitlab-native-browser-audit.mjs --mixed-lists` after
matching runtime/frontend preparation. The profile restarts and stops the app.
The public list containers now accept the `listItem` schema group; custom
list-item overrides should preserve that group. Existing document JSON remains
valid. Ordinary and task item types remain distinct.

Previous task conversion checkpoint (2026-11-16): GitLab-generated checkbox spaces
and newlines before nested blocks no longer become authored text on export. The
adapter consults source positions to retain intentional newline entities and
preserves additional spaces, tabs, NBSP and escaped entity text. Seventeen actual
renderer samples cover these distinctions. All 1,167 GitLab unit cases / 43 files,
540 selected upstream cases (one inherited skip), types and frontend build pass.
The recorded application profile passes 20 checks, including checkbox undo/redo
and six rich/source cycles across MR/wiki editors with unrelated prose edits.
Task lines stay unchanged through Save/reopen/restart. The 18-patch reconstruction
and 28-file source rollback pass. [Task conversion evidence](../../artifacts/task-whitespace-integration-20261116.json).

This resolves the spacing drift observed in the preceding discussion checkpoint.
Mixed task/bullet lists, inapplicable tasks, inline review/suggestions and broader
role/reconnect/mobile/product acceptance remain open. Public engine/API/package
and acceptance limits are unchanged; no publication or parity-row promotion.

Run `node scripts/run-gitlab-native-browser-audit.mjs --task-roundtrip` after
matching runtime/frontend preparation. `--task-fixtures` independently refreshes
the pinned renderer corpus. Both stop the isolated app after completion.

Previous discussion checkpoint (2026-11-16): general MR threads now have recorded
real-service coverage for creation, immediate rich editing, replies and whole-thread
resolution, with exact saved bodies and state checked after reopen and restart.
GitLab's NoteForm supplies null suggestion metadata even for ordinary edits/replies;
the native adapter now accepts those inactive fields while still refusing active
or unknown suggestion configurations. The profile passes 19 service checks;
42 focused root cases, 540 selected upstream cases (one inherited skip), types,
frontend build, 18-patch reconstruction and 28-file source rollback pass.
Engine/API/limits are unchanged. [Discussion evidence](../../artifacts/review-integration-20261116.json).

Inline suggestions, review batching, roles/concurrency and full product acceptance
remain open. The recorded MR/wiki cycles also expose growing encoded task-leading
spaces; investigate that conversion drift separately from saved-body persistence.
No publication or parity-row promotion is implied.

Run `node scripts/run-gitlab-native-browser-audit.mjs --review` after matching
runtime/frontend preparation. It includes MR/wiki editing, restarts and stops
the isolated app. The audit uses real accounts, APIs and UI controls.

Previous workflow checkpoint (2026-11-16): existing merge-request descriptions
and wiki pages now have recorded real-service coverage for rich/source switching,
immediate rich-mode saving, reopening and an actual application restart. The
wiki journey includes its commit-message dialog. Saved Markdown remains exact
across restart; reader checks retain tables, math, decoded images and bold edits.
Direct editor entry exposed missing KaTeX styles; the editor now loads its own
stylesheet instead of depending on a prior reader visit. The profile passes
16 checks and 540 selected upstream tests (one inherited skip); frontend build,
18-patch reconstruction and 28-file source rollback pass. Engine/API/limits are
unchanged. [Workflow evidence](../../artifacts/workflows-integration-20261116.json).

Run `node scripts/run-gitlab-native-browser-audit.mjs --workflows` after the
matching runtime/frontend preparation. It restarts and then stops the task app.

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
or publication. [Control-layout evidence](../../artifacts/note-controls-integration-20261116.json).

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
[Cut/move evidence](../../artifacts/footnote-cut-integration-20261116.json).

After runtime build/install and frontend preparation, run
`node scripts/run-gitlab-native-browser-audit.mjs --footnote-cut` inside the
isolated Linux setup. Use `--footnote-controls` instead to include the current
responsive layout and keyboard checks. Both profiles include a real restart and
stop the task container.

Previous checkpoint: rich cell-grid clipboard ownership and grouped native
controls. A recorded actual-host profile passes 20 checks with three tables and
three owned notes retained through Save/reopen/restart, six automated
accessibility scans and no browser errors. The toolbar keeps Attach/Paste
Markdown/Media together when wrapping; desktop/narrow/mobile layouts, keyboard
properties and mobile cancellation are checked. Media actions use separate rows
and divided deletion. Footnote role hosts are repaired without losing older
HTML IDs/source labels.

Validation passes 6,553 root cases with two workers, 540 selected upstream cases
(one inherited skip), types, package/Node/workerd, a 144-module headless boundary,
18 patches and 28-file rollback/reinstall. A default-parallel SQLite timeout is
retained separately. Engine cell-grid paste supports merged spans; noncanonical
GitLab GFM cases still refuse without changing the source. Cut/move identity,
WebKit OS transport, physical Safari and full product acceptance remain open.
[Current evidence](../../artifacts/gitlab-table-clipboard-integration-20261115.json).

After the runtime build/install and frontend preparation below, run the isolated
Linux audit with `node scripts/run-gitlab-native-browser-audit.mjs --table-clipboard`.
It includes actual application restart and stops the task container afterward.

Previous checkpoint: footnote clipboard ownership and host event isolation. Copy
includes complete owned definitions; paste remaps collisions and preserves
shared references, marks and root placement in one undoable operation. A real
application failure exposed its global reader copy handler overwriting native
data; the view now isolates handled clipboard events. Four definitions and six
references survive Save/reopen/restart with all real links/backlinks verified.
Validation passes 6,526 root cases, 540 upstream cases (one inherited skip), 27
recorded service checks, six scoped accessibility scans, types, package/Node/
workerd, size/runtime gates, 18 patches and 28-file rollback/reinstall.
Chromium/Firefox OS clipboard journeys pass. Installed WebKit format-bridge
failures, cell-grid ownership, cut/move identity reuse and broader product
acceptance remain open. [Evidence](../../artifacts/gitlab-footnote-clipboard-integration-20261115.json).

For the preceding footnote-only profile, the isolated Linux audit command is
`node scripts/run-gitlab-native-browser-audit.mjs --footnote-clipboard`.
It includes actual application restart and stops the task container afterward.

This is the integration work area, not a finished replacement or a flagship
application. The current website issue-description example is a smaller workflow
lab and does not satisfy this project's acceptance criteria.

The target is FountainJS in a real GitLab application, using GitLab's actual
accounts, projects, storage, uploads, authorization, issue/MR/wiki workflows and
collaboration services. These services remain real GitLab services. Recreating
their controls with local-only state does not meet the requirement.

## Footnote round trips and the prose boundary — November 15

The actual renderer corpus now covers 65 input/edit combinations with 208
authenticated responses. Fifty-three accepted cases keep the full native graph
through two edit/export/reopen cycles; twelve unsupported cases retain their
original source. It includes eight direct note-body edits, shared/unused/empty
notes, Unicode labels, literal markers, frontmatter, tables, links and math.
Only opaque note IDs are joined through labels; content order and formatting are
not normalized away to pass the comparison.

The matrix found an automatic typing paragraph after terminal endnotes, allowing
prose to appear below them before GitLab moved it above them on reopen.
`footnote_boundary.ts` wraps the existing trailing-block extension only for this
host: an already editable terminal note needs no extra root paragraph. It keeps
repairs after atomic content and never deletes authored paragraphs. Source
placement of arbitrary authored paragraphs after definitions remains outside
this accepted matrix; GitLab's reader projects endnotes after the prose.
Atomic-only note endings retain the normal caret repair; their full host layout
contract remains outside this matrix.

The recorded UI profile passes 26 checks through real Enter/typing, Save, reopen
and restart; six scoped accessibility scans and browser-error checks pass.
Models pass 1,133 cases in 41 suites, selected upstream checks pass 536 with one
inherited skip, and types/frontend/source-rollback/patch checks pass.

```sh
# After the normal current runtime install and host frontend build:
node scripts/run-gitlab-native-browser-audit.mjs --footnote-boundary --capture-footnote-roundtrip
# Renderer corpus alone, with the explicitly declared server repair:
node scripts/run-gitlab-native-browser-audit.mjs --footnote-roundtrip-fixtures
```

Broader source/edit/context, clipboard/native-fragment, public Pages placement,
workflow/role/browser and deployment matrices remain open. No public release or
parity claim changes. [Evidence](../../artifacts/gitlab-footnote-roundtrip-integration-20261115.json).

## Footnote labels and real reader navigation — November 15

The native issue editor now renames source labels through a captured/rebased
session. Actual before/after host projections must preserve the rest of the
document; native IDs and bodies remain stable, references update together, and
undo/redo is atomic. Exact or renderer-resolved collisions are refused. Failed
checks retain the draft for retry; cancelled or late requests cannot publish it.
Unused long labels wrap above their body instead of overprinting its first line.

Stronger reader checks found that the pinned original server left a repeated
footnote pointing at a missing destination. Native browser runs now declare a
separate read-only, exact-hash Ruby repair that joins definitions by original href
and assigns collision-checked generated IDs. The original image and reference
captures remain separate. See [deployment/cache requirements](runtime/README.md#native-footnote-server-repair).
The prior cached issue was verified broken after deployment, then repaired by
invalidating only its derived HTML; source, title and timestamp stayed unchanged.

The recorded profile passes 25 real-service checks through Save, reopen and
restart, including repeated-reference/backlink clicks in each phase, six scoped
accessibility scans, keyboard use and 360px retained drafts. Models pass 1,057
cases in 39 suites; upstream tests pass 536 with one inherited skip. Twenty-four
pinned-image Ruby contracts and 45 actual Rails renders separately validate the
filter. Types, rebuilt host frontend, 18 ordered patches and the 28-file source
round trip pass. No public package/API/size limit or parity-row claim changes.

```sh
# After building/installing the current native runtime and host frontend:
node scripts/run-gitlab-native-browser-audit.mjs --footnote-renaming --verify-footnote-server
```

Full source/canonical/clipboard matrices, MR/wiki/discussion/roles/browsers,
large-document rename costs, production cache rollout and compiled rollback are
still open. [Evidence](../../artifacts/gitlab-footnote-renaming-integration-20261115.json).

Earlier authoring checkpoint:

## Native footnote import/export and issue authoring — November 15

The verified adapter cases are now installed. Native controls insert a note,
reuse an existing note, edit its body, remove a single reference, or delete the
shared note and references. Original labels stay separate from safe native IDs;
newly inserted notes get independent numeric labels. Unchanged source stays
exact, changed documents export canonically, and unsupported/ambiguous cases
retain their original source.

The recorded 19-check issue journey passes through source/rich switching, Save,
reopen and an actual application restart. It also covers keyboard access,
undo/redo, a retained 360px dialog draft and four scoped accessibility checks.
Current screenshots verify that attachment, Markdown paste and media actions
stay on one desktop toolbar row, with media deletion visibly separated.

Review found and repaired End leaving a paragraph after an inline atom and an
automatic final caret paragraph becoming exported content between definitions.
All 1,005 final GitLab model cases and 536 selected upstream cases pass, with one
inherited skip. The caret regression additionally passes Chromium, Firefox and
WebKit. Types, package/API, unchanged size limits, frontend, source rollback and
patch checks pass. This does not complete the host's other workflows, role/
browser matrix, note renaming, all source cases or compiled deployment rollback.

```sh
node scripts/build-gitlab-native-runtime.mjs
# In Linux, after the normal native runtime install and host frontend build:
node scripts/run-gitlab-native-browser-audit.mjs --footnote-editing
```

[Evidence and limits](../../artifacts/gitlab-footnote-authoring-integration-20261115.json).
[Remaining work](FOOTNOTE_ADAPTER_PLAN.md).

## Earlier decoded footnote retention and adapter model — November 14–15

The installed guard now protects hidden definitions whose decoded labels contain
brackets or ASCII spaces. Actual parent-codec witnesses reproduce body loss on
an unrelated edit. The current native service profile passes 13 recorded checks,
including escaped-label paste refusal, entity-space failed-load recovery/cancel
and unchanged server source after restart. This is a source-loss repair, not
completed native footnote authoring.

Forty-seven normal and forty-two verification renderings additionally exercise
a bounded, read-only prelude for unused bodies. The unwired adapter model
retains raw labels, uses the existing native footnote nodes and validates
response-local reference ownership. It refuses missing definitions, ambiguous
source-authored back-reference markup, duplicate-label navigation hazards, BOM
role changes and the captured CR-only mismatch. Source/export, paste-label
collisions, authoring and full host acceptance remain in the adapter plan.
All 954 GitLab model cases, 536 selected upstream cases (one inherited skip),
TypeScript, frontend build, source rollback and patch checks pass.

```sh
node scripts/build-gitlab-footnote-probe.mjs
# In Linux, after the normal native runtime install and host frontend build:
node scripts/run-gitlab-native-browser-audit.mjs --footnote-probe-fixtures
node scripts/run-gitlab-native-browser-audit.mjs --footnote-decoded-source
```

[Evidence and limits](../../artifacts/gitlab-footnote-projection-integration-20261115.json).
[Remaining adapter work](FOOTNOTE_ADAPTER_PLAN.md).

## Uploaded-image restart investigation — November 14

The earlier image failure is now correlated with an authenticated Rails HTTP
403 in `Banzai::UploadsController#show`. Its negative queue duration is a timing
clue, not proof of a particular JWT failure. A temporary, read-only diagnostic
initializer calls the original Workhorse verifier and re-raises its errors;
it records request IDs, verification outcomes and numeric timestamps, never
tokens or session headers. It is not part of the ordinary deployment.

The exact issue/image passed 25 uncached Chromium loads across two restarts.
Every response matches both a successful verification and a Rails HTTP 200.
Five decoded-image screenshots and sampled recording frames were inspected.
The original failure did not recur and remains open; no retry or authentication
relaxation is a repair. The cleanup helper's unsupported Compose flag was fixed
and its restore-only path verified. The normal deployment is restored and stopped,
with the diagnostic mount removed and persistent volumes retained.
[Reproduction](runtime/README.md#uploaded-image-restart-diagnostics).
[Evidence and limits](../../artifacts/gitlab-upload-restart-integration-20261114.json).

## Footnote source protection — November 14

The next bridge foundation now maps GitLab's inclusive UTF-8 positions to exact
JavaScript source spans. All 23 captured renderings supply matching label spans,
including repeated, Unicode/NBSP, nested and duplicate labels. Forty-seven cases
verify byte boundaries, newline retention and refusal of invalid/lossy input;
all 839 GitLab model cases and TypeScript pass. The helper is not yet wired into
native import: schema/identity mapping, body conversion, unused-note handling,
export and authoring remain in the full adapter plan. The guard stays enabled.
[Position evidence](../../artifacts/gitlab-footnote-positions-integration-20261114.json).

The actual renderer omits unused footnote definitions. A recorded parent-codec
counterexample shows why accepting that HTML is unsafe: unchanged source is
retained, but an unrelated edit canonically exports without the hidden definition.
`services/footnote_source.ts` now inspects source with Fountain's existing parser
and the validated GitLab frontmatter boundary, refusing that incomplete
conversion while retaining original Markdown. Its inspection labels never become
editor IDs or DOM anchors. Extra parsing is byte-bounded and ordinary documents
stay on the fast path. This does not implement native GitLab footnote authoring.

Twenty-three captured host cases cover repeated references, Unicode/NBSP labels,
multi-block and nested notes, omitted/duplicate definitions, literal examples and
frontmatter. All 792 GitLab model cases and 536 selected upstream cases pass,
with one inherited skip. The final recorded 13-check service profile verifies
omitted-definition paste refusal, saved-load refusal/Retry, explicit local
recovery/cancel and exact original source after restart. An earlier reader-image
403 after restart remains open; the later pass is not evidence of a repair.

After the normal native runtime install and actual GitLab frontend build:

```sh
node scripts/run-gitlab-native-browser-audit.mjs --footnote-source --capture-footnotes
# With the isolated application stopped:
node scripts/check-gitlab-native-patches.mjs /absolute/pinned/gitlab-source --footnote-source
node scripts/check-gitlab-native-install.mjs /absolute/pinned/gitlab-source --footnote-source
```

[Evidence and limits](../../artifacts/gitlab-footnote-source-integration-20261114.json).
[Full adapter plan](FOOTNOTE_ADAPTER_PLAN.md) preserves the remaining source,
authoring, reader navigation and full product acceptance requirements.

## Native reference and command-argument completion — November 14

`services/autocomplete_data.ts` validates real provider records without a DOM.
`services/autocomplete_editing.ts` owns formatted query matching, cancellation,
captured/rebased insertion targets and undo. The host-only
`services/autocomplete_host.js` imports GitLab's axios transport, sorter, fuzzy
label search and reactive work-item state; it does not simulate an editor.
URLs stay same-origin, successful response caching is bounded, and malformed or
unresolved results are refused with the query/source retained. Vue presents the
shared command/reference list and owns focus and ARIA restoration.

Choosing `/label` hands the author to actual label suggestions. The recorded
service journey additionally inserts an issue, user, merge request and milestone,
checks a declared GET failure and real retry, then verifies source/reference
counts through UI Save, reopen and a real application restart. Its 21 checks
include desktop and 360px keyboard interaction; scoped panel accessibility scans
have no violations. A Retry focus defect and GitLab's delayed desktop sidebar
focus theft both have regressions and repairs. The sidebar change is a host
patch, not a new DOM assumption in the engine.
All 6,134 Node cases pass; the selected 23-suite upstream set passes 536 cases
with one inherited skip. Types/API/headless/package/size and source rollback
checks pass. This is source rollback, not compiled deployment rollback.

Reproduce in the pinned Linux checkout after the preceding sixteen patches:

```sh
node scripts/prepare-gitlab-autocomplete-tests.mjs /absolute/pinned/gitlab-source
node scripts/prepare-gitlab-sidebar-focus-tests.mjs /absolute/pinned/gitlab-source
node scripts/build-gitlab-native-runtime.mjs
node scripts/install-gitlab-native-browser.mjs /absolute/pinned/gitlab-source
node scripts/check-gitlab-native-patches.mjs /absolute/pinned/gitlab-source --autocomplete
# Build the actual GitLab frontend before running this service journey.
node scripts/run-gitlab-native-browser-audit.mjs --autocomplete
# Run only with the isolated application stopped:
node scripts/check-gitlab-native-install.mjs /absolute/pinned/gitlab-source --autocomplete
```

The native installer is format 13 with 28 owned files; the eighteenth ordered
patch repairs the host sidebar. Wiki/Gollum and emoji completion remain open.
Status/type and context-sensitive removal providers have isolated host-contract
tests, not a complete real-service role/context matrix. The 360px dock is verified
with keyboard navigation, not physical mobile keyboards or touch-first discovery.
All other reference/provider/browser matrices, compiled deployment rollback,
remaining GitLab surfaces and full product acceptance remain separate work.
[Evidence and limits](../../artifacts/gitlab-autocomplete-integration-20261114.json).

## Autocomplete provider inspection — November 14

`fixtures/autocomplete-live.json` captures authenticated records from the pinned
private GitLab project. Usernames and label titles arrive without numeric IDs;
milestones use `iid` while `id` is null. Global issue ID and local IID differ.
The contacts source returns 404, and several available sources are genuinely
empty. Preserve these distinctions when wiring providers; do not manufacture
successful results or infer IDs from array order. The shared SDK now supports
formatted query spans and long prefixes, but this fixture capture does not
itself implement the native reference/argument UI or certify its contexts and roles.
[Foundation evidence](../../artifacts/suggestion-ranges-integration-20261114.json).

## Quick-action source/save checkpoint — November 14

`services/quick_actions.ts` matches the pinned host's fence-aware command-line
isolation; 32 authenticated render fixtures also retain the result of running
the original host transform as an oracle. Fountain retains its own schema and
source parser. Command arguments serialize as literal command source. Imported
escaped/entity/HTML slashes retain a literal marker, including when inline
formatting is removed or a nested paragraph moves to the root. Ambiguous source
ownership or renderer-truncated arguments refuse conversion with source retained.
This does not assert support for every command, formatting or host context.
Source-position adapters use the actual isolated renderer input, preserving
explicit alert titles and fenced metadata after command-induced line shifts.

The recorded issue workflow pastes a label command with a following link
definition and literal close text, edits, undoes/redoes, switches source/rich
mode, saves through the UI, and checks actual server labels and open state.
Saved source reopens exactly, remains literal on another edit, and survives a
real application restart. It exposed a stale host conflict flag, fixed in
`gitlab-19.5.3-native-quick-action-tests.patch`, applied after the existing
fourteen patches. That reset starts a fresh edit session without disabling
active-session conflict detection. The journey's accessibility check also led
to underlining native reference links.

Current evidence is 136 final focused Node cases, 440 passing upstream cases
with one existing skip, lint/types/build, source checks, and 16 recorded browser
checks. A 6,023-case broad Node run preceded the final targeted refinements.
Quick-action insertion, explanations, autocomplete and broader product acceptance
remain open. No public demo or package claim is promoted from this checkpoint.
[Report](../../artifacts/gitlab-quick-actions-integration-20261114.json).

## Inspected upstream contract

`upstream.json` pins a GitLab source commit, not an assumed current release.
Reproduce the source-backed inventory with:

```sh
node scripts/audit-gitlab-editor-contract.mjs
```

The audit fetches eight immutable upstream files, records their byte counts and
SHA-256 digests, parses the Vue component's props/events/methods/watchers/slots
and its host contract, inventories the exported editor extensions, and records
the document/deserializer/asset service imports and class methods. It reads
upstream source; it does not execute downloaded code. Its report is evidence
about the interface to implement, not a passing integration test.

GitLab's content editor uses `@tiptap/vue-2`. Fountain's Vue 3 binding cannot
simply be substituted. A Vue 2 lifecycle bridge can mount Fountain's DOM view;
it must implement the inspected GitLab component contract and use the actual
host services. GitLab's Tiptap extensions and collaboration-provider object
also require explicit adapters, not acceptance followed by silent ignoring.

Inspect these upstream files through the pinned source links in the report:

- `content_editor/components/content_editor.vue`: public props, change events,
  focus, loading, Markdown replacement/history, accessibility and slots.
- `vue_shared/components/markdown/markdown_editor.vue`: actual host mode
  switching, templates, input events, draft ownership and editor references.
- `content_editor/services/create_content_editor.js`: asynchronous GitLab
  Markdown rendering, asset resolution, serialization and collaboration.
- `content_editor/services/content_editor.js`: document loads, template/history
  behavior, change suppression, and coordinated collaborative seeding.
- `content_editor/services/gl_api_markdown_deserializer.js`: actual GitLab
  render callback, quick-action handling and ProseMirror/DOM conversion.
- `content_editor/services/asset_resolver.js`: canonical URLs, references,
  placeholders, diagram rendering and quick-action explanations.
- `content_editor/extensions/index.js`: the feature inventory, including
  GitLab references, code suggestions, quick-action-related behavior, diagrams,
  uploads, frontmatter, footnotes, table operations and specialized content.

## Implemented integration primitive

`components/fountain_editor_surface.vue` is a real Vue 2.7 Options API component
which mounts the public Fountain `EditorView`. The application owns its editor
model. Removing/recreating the view retains that model's document and undo
history. Runtime `editable` changes update the existing outer view and refresh
its controls. A refused mode change removes the view and reports an error;
switching back can recover without losing the document. This is interaction
state, not backend authorization.

The isolated tool workspace pins GitLab's Vue 2.7.16 runtime and SFC compiler.
It does not add Vue 2 to Fountain's public dependencies or replace its Vue 3
binding. Build the package, then exercise the compiled component with:

```sh
pnpm build
pnpm audit:gitlab-bridge
```

On Linux, native clipboard verification uses a real X11 display:

```sh
GDK_BACKEND=x11 xvfb-run --auto-servernum pnpm audit:gitlab-bridge --headed
```

The initial November 11 surface result is five of six cases passing on Windows: Chromium
and Firefox pass both journeys; WebKit passes refusal/recovery but its native
copy to an external textarea receives empty text. A separate plain HTML control
reproduces the Windows result. The same two component journeys pass in Linux
WebKit on Xvfb, including exact external copy; its independent control passes
too. No assertions, timeouts or skips were changed to obtain the Linux pass.
Initial WSL runs exposed a separate first-click timeout while Wayland remained
available; selecting X11 explicitly resolves it in the recorded run. This does
not establish the precise Windows browser/OS cause or certify physical Safari.
The required hosted CI job retains these cases and the additional lifecycle
journey below, and uploads evidence.

[Evidence and remaining boundaries](../../artifacts/editability-integration-20261111.json).

This component is **not** GitLab's complete `ContentEditor` contract: it does not
yet replace its Markdown service, extension/toolbars, upload handling,
collaboration provider or host draft/template behavior. The original-product
baseline below runs the real backend. The later native browser checkpoint mounts
Fountain in that application; the complete contract and feature adapters remain
unfinished. Those requirements still apply before describing the product as ready.

## Serialized-content lifecycle

`services/serialized_content.ts` implements the non-collaborative document
lifecycle over the actual public Fountain editor. It requires an explicit
codec implementing the host dialect; it does not quietly use ordinary Markdown
as GitLab Markdown. Initial/reopened loads establish a clean undo baseline;
template replacement is undoable. Whole-document transactions preserve root
attributes. Host change subscribers receive actual edits, not initial loads,
selection-only updates or interaction-mode changes.

`subscribeChange` now reports a discriminated result: `{ status: 'ready',
markdown }` or `{ status: 'error', error }`. An export error does not undo the
already applied edit and must not throw through the editor's remaining view
notifications. The host must clear its current serialized value and prevent
submission on an error; it must not save the last successful string as the
current document. `getSerializedContent()` still throws on conversion failure.
Undo can restore a serializable document. A successful explicit load establishes
a new baseline silently, so its caller must refresh the serialized value and
clear its error state. Host callback exceptions remain application errors;
they are not misreported as converter failures.

Newer loads cancel older ones, which settle as `superseded` even if a renderer
ignores cancellation. An intervening document edit causes a typed conflict
instead of overwriting the newer work, including edits followed by undo. Active
rendering errors and refused/invalid document replacements remain explicit.
Disposal cancels pending work and releases subscriptions; the host owns and
destroys the editor separately. A collaboration adapter prohibits this local
replacement route. GitLab's elected seeding/replacement protocol must be adapted
before collaborative Markdown initialization is supported.

Eleven focused tests use the built public package in Node without jsdom. The
recorded Vue 2 journey uses the real ordinary Fountain Markdown importer/exporter
to exercise loads, typing, template application, quote/heading rendering,
undo/redo, reopening and change notifications. It intentionally does not certify
the GitLab dialect or service implementation. The expanded Windows profile is
eight passes/one retained WebKit clipboard failure; Linux WebKit on explicit
X11/Xvfb passes all three cases. Recorded Windows/Linux frames and the detailed
heading/template states receive visual review.

[Lifecycle evidence](../../artifacts/gitlab-serialized-content-integration-20261111.json).

The later conversion-recovery audit finds and repairs both interrupted view
notifications and unintended navigation from editable reference atoms. Install
`createGitLabReferenceNavigationPlugin()` from `plugins/reference_navigation.ts`
with the GitLab schema/view: ordinary left clicks stay in the draft, while
modified clicks and read-only link use remain browser navigation. This is a
view interaction policy, not authorization or a replacement router.

Four recovery cases and seven reference-interaction cases pass alongside the
existing lifecycle/codec cases (54 focused tests). The earlier full unit run
passes 5,393 tests/333 files, before the seven added navigation cases; root
TypeScript subsequently passes with all new code. Nine compiled Windows native
journeys pass across Chromium/Firefox/WebKit, and all five Linux WebKit/Xvfb
journeys pass, including native external copy. Recorded refusal, continued
typing, undo and explicit reload states receive visual review. The initial
Windows run's accidental-navigation failures and a Firefox context-teardown
timeout are retained; no assertions or timeouts are weakened. This establishes
the scoped component recovery behavior, not real GitLab saving or source-mode
recovery in the complete application.

[Recovery evidence](../../artifacts/gitlab-export-recovery-20261111.json).

## Rendered-resource and reference resolver

`services/asset_resolver.ts` implements GitLab's six resolver operations:
canonical-to-display URLs, iframe source/provider data, placeholders, reference
expansions, quick-action explanations and diagram image URLs. The host supplies
its actual `renderMarkdown` callback and label-description localizer. Credentials,
HTTP/CSRF handling, project context, permissions and provider authorization stay
in the application. The resolver does not create its own network client or
substitute the public REST endpoint for the internal preview callback.

The implementation uses the existing pinned `parse5` 8.0.1 dependency and the
public Fountain URL gate. It has no browser `document`, fake DOM, script
execution or layout dependency. It reads inert parsed data without fetching
links/images. Canonical input is retained as the safe fallback when URL lookup
fails; references, placeholders and diagrams use their explicit empty fallback.
An optional issue callback distinguishes rendering failure, invalid response
and unsafe returned URL without logging source text or provider error details.

The cache is per resolver/project context, coalesces concurrent identical
requests and evicts failures for retry. Defaults are 100 LRU entries and 4 MiB
of retained UTF-8 request/HTML strings; the HTML/input envelope is bounded at
1 MiB, with 50,000-node/128-depth inspection limits. These are string/structure
bounds, not a measured total-heap guarantee or a concurrency limit. Clearing or
disposing cancels tracked requests, including in-flight requests already evicted
from the LRU. Callers settle even if their provider ignores the optional signal;
the provider must forward that signal to cancel the underlying transport too.
Create a new resolver when project/auth context changes.

`fixtures/service-html.json` now contains twenty-two expression-free literals extracted
from the pinned upstream test module. The extraction script records source and
license hashes and never executes upstream code. The accompanying
`fixtures/GITLAB-LICENSE.txt` retains its copyright/license notice. Refresh with
`node scripts/update-gitlab-service-fixtures.mjs`.

The full unit suite passes 5,348 tests in 329 files and root TypeScript passes.
Thirty-seven focused Node cases cover the eight upstream reference kinds,
suffix expansion, wiki/repository/upload/proxy URLs, embeds, placeholders,
localized quick-action labels, diagram fences, LRU/byte bounds, retry,
cancellation, unsafe URLs, malformed envelopes and structural/UTF-8 limits.
The browser-targeted production bundle compiles at 196,701 raw bytes including
parse5 and the URL gate; it is a private integration prototype, not added bytes
in the shipped Fountain engine. This is not a browser user journey or a running
GitLab service check.

The attempted unauthenticated public Markdown render returns HTTP 401. GitLab's
[API documentation](https://docs.gitlab.com/api/markdown/) requires authentication.
The actual host callback normalizes `html`/`body` and carries quick-action
metadata from its preview route. Neither the public endpoint nor local HTML
fixtures establish that complete contract. Authenticated host-service use,
document conversion/source retention and end-to-end application verification
remain required. No public product/showcase action is added from this fixture
test evidence.

[Resolver evidence](../../artifacts/gitlab-asset-resolver-integration-20261111.json).

## GitLab-rendered document codec

`services/markdown_codec.ts` converts the actual host renderer's `body` through
the public DOM-free HTML importer. `createGitLabSchemaSpec(base?)` adds typed
references and placeholders, plus distinct canonical/display URL attributes on
images and links. It uses Fountain's model and transactions, not ProseMirror or
literal AST compatibility. Register the explicit schema before using this codec
with `SerializedContentController`. The host still supplies its real renderer.

The public `MarkdownSourceSnapshot.capture(source, document)` now binds source
after external conversion. It validates the document without running Fountain's
Markdown parser over a different dialect. It deliberately infers neither source
positions nor frontmatter. The codec retains exact source for an unchanged
document (and provenance-verified automatic caret repair), but edited output is
currently canonical. Untouched-block source retention after edits is unfinished.
Snapshots are import-local, not a persisted source/asset package format.

Current evidence and remaining conversion work:

| Content | Current behavior and limit |
| --- | --- |
| Basic rendered paragraphs/headings/lists/tables | Uses the existing model/importer; this is not full GitLab Flavored Markdown conformance. |
| Issue/MR/user/label/commit paragraph | Typed references keep original syntax separately from visible text and display URLs. Native edits/delete/undo preserve the tested source tokens. Labels retain background color with a contrasting foreground. Broader reference-kind/expansion document cases still need explicit coverage. |
| Repository/upload/proxy images and links | Canonical addresses survive unrelated edits, including tested nested-list/table/linked-image cases. Lazy-loading GIF/proxy addresses are not written back as source. This is address/structure proof, not authenticated asset loading or image visual fidelity. |
| Missing canonical image carrier | Untouched source remains exact; edited export reports the missing mapping and refuses silent URL substitution. Recovering the actual address from source is unfinished. |
| Placeholders | Resolved visible value remains separate from the original placeholder token. |
| Homogeneous nested task lists | Checkbox state comes from the item's own input, not a checked descendant. Mixed task/bullet lists, task-table cells and inapplicable tasks need dedicated adapters. |
| Highlight/underline/subscript/superscript | Ordinary text exports the actual GitLab HTML dialect (`mark`, `u`, `sub`, `sup`). Custom highlight colors, certain combined code/atom formatting and authored layout require an explicit retained representation. |
| Math | The source-backed adapter below covers tested dollar, legacy backtick, inline display and fenced forms, plus retained KaTeX annotations. It reuses native editable math nodes. Additional metadata, delimiter collisions and table-sensitive source still require explicit retention. |
| Mermaid / PlantUML diagrams | Native source editing and preview, direct block creation, language changes, copy/delete/undo and scoped real saved-reader acceptance are implemented. PlantUML requires a configured provider. Long-document paired preview UX, saved invalid diagrams and broader browser/role coverage remain open. |
| Frontmatter, review suggestions, GLQL, footnotes, embeds, TOC and other specialized GitLab renderers | Known markers are reported before flattening. Their source-aware GitLab adapters remain required, even when Fountain already has a corresponding native feature. |
| Quick actions | A preview response containing command metadata is refused until a dedicated document/source adapter is implemented. Source is retained; nothing is executed by the codec. |
| Error/recovery and host workflow | Typed import/export issues are available. Complete host error presentation/source-mode recovery, provider/auth context, uploads, collaboration and the full application are still required. |

The new native journey uncovered an engine caret defect: a native parent edge
after an inline atom was incorrectly mapped to preceding text. Firefox also
places End inside the uneditable atom's display text. The engine now maps those
exact edges structurally while leaving native controls/interior positions alone.
Regression cases fail before the repairs and pass afterward. Native typing,
deleting the final reference and undo pass in all three desktop engines. The
expanded profile is 11 passes/one existing Windows WebKit clipboard failure;
Linux WebKit on explicit X11/Xvfb passes all four journeys. Captured states were
visually reviewed; this private fixture is not the running GitLab product.

The source-capture API changes two declaration hashes. Its implementation and
the caret repair measure about 1,455,787 aggregate CJS bytes, 571 more than the prior
runtime. Aggregate capacity changes from 1421.25 to 1421.75 KiB; individual
entries, ESM, CSS, latency and heap ceilings remain unchanged. Earlier archives
are stale. Final packed consumers/hosted CI and publication are still required.

[Codec and caret evidence](../../artifacts/gitlab-codec-integration-20261111.json).

## GitLab math adapter

`services/math.ts` connects GitLab's renderer carriers to Fountain's existing
`inline_math`/`math_block` nodes. `createGitLabSchemaSpec(base?)` supplies the
native defaults and preserves math node views/renderers already registered in
the base schema. Keep using the public native source controls and math commands;
the adapter does not introduce a second editing engine or a ProseMirror schema.

The adapter retains TeX and syntax separately: `$x$`, legacy ``$`x`$``, display
`$$x$$` within prose, and fenced `math` blocks. Rendered KaTeX requires exactly
one retained TeX annotation; glyph text alone is not accepted as source. Known
inline render wrappers use that annotation too, including GitLab's generated
`math-content-inline` wrapper. When a bare rendered KaTeX span no longer carries
its original delimiter kind, edited output uses the legacy form. Fenced
code controls are removed only from the recognized renderer-owned wrapper.
Unrelated edits preserve the tested TeX form; unchanged documents still return
their exact source through the import-local snapshot. Native math source edits
participate in normal undo/redo. Before a following digit, inline dollar math
uses the same legacy-delimiter fallback as GitLab's pinned serializer.

For a visual renderer, supply the existing caller-owned KaTeX adapter. Inline
display syntax needs document context so its TeX display style is retained:

```ts
import { CoreExtension, composeExtensions, createMathExtension, createKaTeXRenderer } from 'fountainjs-editor';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { createGitLabSchemaSpec } from './services/markdown_codec';

const renderMath = createKaTeXRenderer(katex);
const math = createMathExtension({
  documentRenderer: (latex, context) => renderMath(latex, {
    ...context,
    displayMode: context.displayMode || context.node.attrs.gitlabMathSyntax === 'display',
  }),
});
const kit = composeExtensions([CoreExtension, math]);
const schema = createGitLabSchemaSpec(kit.schema);
// Create the host editor with schema and kit.plugins, plus reference navigation.
```

This uses `createKaTeXRenderer`'s denied-trust boundary. KaTeX remains a host
dependency; no renderer is fetched or installed by a document. Without a supplied
renderer, the native view shows literal TeX with source editing. A complete
`.tex` project/importer is a separate feature.

Malformed/oversized/ambiguous math reports `math-source`. Edited syntax collisions,
extra accessible/semantic/layout metadata and math that could break a Markdown
table produce explicit export issues. The original document/source is retained;
these refusals remain missing conversion capabilities, not parity completions.

`scripts/update-gitlab-math-fixtures.mjs` extracts ten actual upstream
Markdown/rendered-HTML rows and one KaTeX annotation fixture from the pinned
tests, with five source-file hashes (including the actual browser renderer) and
the retained GitLab license. It parses
whitelisted expression-free AST literals without executing upstream code.

Final verification passes 5,437 unit tests/335 files, including 37 math cases;
the focused GitLab set passes 91 cases and root TypeScript passes. Fifteen
compiled Windows journeys pass before the final annotation/description guards,
and a fresh three-engine math journey passes after those guards. All six current
Linux WebKit/Xvfb component journeys pass, including native external copy. The
Windows external-copy failure remains open and is outside the fifteen-case
profile. The targeted math cases overlap the broader profile. Final Firefox
inline/display/block states and Linux block rendering receive visual review;
recordings are retained. This is still private component/service-boundary
evidence, not a running GitLab application or a new combined release gate.

[Math verification and limits](../../artifacts/gitlab-math-integration-20261112.json).

## Full application completion requirements

### Prepared host Markdown handoff patch

`patches/0001-guard-markdown-handoff.patch` changes the actual pinned GitLab host
and rich-editor component, with upstream Jest regressions. The host's change
observer is debounced: reading only its cached Markdown when unmounting the
rich editor can drop the latest edit. The patched parent first calls the child
component's `getSerializedContentForHandoff()`, then publishes that current
string before changing mode. Empty content is valid. Conversion/readiness
failure leaves the rich document mounted and the previous draft untouched.
Restored editing-mode preferences use the same guard.

The original GitLab child checks loading, composition and unapplied source
replacement before calling its existing serializer. Collaborative state is
read from the current model rather than a lagging Markdown prop. The Fountain
surface supplies the same handoff method using an optional trusted-host
`readSerializedContent` callback and native composition tracking. Its callback
must also enforce host loading/replacement state. No ProseMirror compatibility
layer is added to Fountain.

The parent-gate and autosave paths remain the real GitLab paths. The cumulative
patch also includes the submission changes described below. It does not replace
storage, authentication or permission checks. Full source-mode recovery is not
certified by these isolated checks.

Check and apply the reviewed patch to a clean checkout at the exact pin:

```sh
git -C /path/to/pinned/gitlab apply --check /absolute/path/to/0001-guard-markdown-handoff.patch
git -C /path/to/pinned/gitlab apply /absolute/path/to/0001-guard-markdown-handoff.patch
```

After editing the patched checkout, refresh its reviewable patch and method
fixtures with `node scripts/capture-gitlab-handoff-contract.mjs /path/to/pinned/gitlab`.
Capture refuses an unpatched checkout or empty diff before replacing outputs.

The capture requires the pinned HEAD, records original/patched source hashes,
compiles the two SFC templates with the isolated Vue 2.7 compiler, and parses the
upstream Jest additions. The patch is checked against a separate baseline index
at the pin and against the edited working tree in reverse. The selected-method fixtures are
test-only code used by the isolated regression/native page; they are not the
full GitLab component or runtime-evaluated code for a production application.
The development-pin upstream suites remain parsed-only. The packaged release's
actual source suites now run as described below; parsing alone is not an
executed upstream-test result.

The complete local unit suite passes 5,452 cases/336 files; fifteen handoff
cases plus controller regressions pass all thirty focused cases. Root types pass.
The broader Windows component profile passes 24 selected journeys, excluding the
retained native external-copy failure; nine final handoff journeys pass in the
three desktop engines after the final fixture/composition-control changes.
All nine current Linux WebKit/Xvfb component journeys pass. These profiles
overlap. Source/reopen/refusal/undo frames receive visual review and recordings
are retained. Composition-event cases cover the root and native math source
control synthetically; they do not certify physical IME/mobile input. A separate
baseline worktree proves that capture refuses an unpatched source tree without
overwriting the prepared patch or fixtures.

[Handoff evidence and remaining host work](../../artifacts/gitlab-handoff-integration-20261112.json).

### Prepared current-document submission patch

The cumulative patch now changes the actual `MarkdownEditor.getValue()` facade,
native form binding, legacy `IssuableForm.handleSubmit()` and draft-clear click
binding. It includes a private first-party `submission.js` helper, vendored
unchanged into the pinned application. Native submits synchronously read all
editors and publish their current values into the actual form fields before
collection. Facade reads return current content without publishing fields or
writing drafts. Conversion, readiness or composition refusal prevents transport.

The legacy handler reads hidden rich-editor inputs as well as textareas, checks
the fresh content for sensitive tokens, then revalidates after that asynchronous
check. It refuses changed content and duplicate pending attempts. Cancellation
or failure retains the current safe draft; a conversion failure never restores
an older cached value over a newer draft. Submit clicks no longer clear drafts
before validation. Explicit discard actions retain their previous behavior.

For native navigation, cleanup means submission has started, not that the server
accepted it. Custom AJAX transports must use the fresh facade/prepare interface
and acknowledge acceptance explicitly before draft cleanup. Arbitrary custom
handlers bypassing both that interface and the native submit event still need
adoption and verification. Actual HTTP rejection, authentication, permissions,
storage and full-application lifecycle remain unverified by this patch.

The final full unit suite passes **5,472 cases in 338 files**; 35 focused cases
and root TypeScript pass. The current Windows component profile passes 33
journeys across three desktop engines, excluding the retained Windows WebKit
external-copy failure. All 12 current Linux WebKit/Xvfb journeys pass, including
external copy. These profiles overlap and remain private integration tests:
the browser page collects real `FormData` into an in-memory transport observer,
not GitLab's server. Composition events are synthetic. Refusal/recovery screens
receive visual review and recordings are retained. Three development-pin Jest
files parse and both SFC templates compile; the release-pin results below are separate.
The paused full-unit attempt was interrupted intentionally; the resumed run is
the authoritative complete result.

[Submission evidence and limits](../../artifacts/gitlab-submission-integration-20261112.json).

### Real GitLab original-product baseline

The [pinned GitLab environment](runtime/README.md) now runs the actual original
application at `19.5.3`, matched to official source commit
`0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf`. The recorded native Linux Chromium
journey signs in normally, creates a private project and issue, uploads a PNG,
edits through the original rich editor, saves through the UI and reopens. The
same server source, authenticated session and image survive a real container
restart. An unauthenticated browser receives 404 for the private issue. The
image URL and KaTeX rendering are checked before screenshots, and the final
reopened screen receives visual review. The original editor canonicalizes its
table separator. This is an original-product baseline, not a Fountain result.

The release source's unmodified suites pass 160 cases; the prepared release-pin
patch passes all 168 cases in those same three upstream Jest suites. Running them
exposed optional alert handlers causing Vue warnings and incomplete unit setup
(failed Markdown-render requests and a default-mode setting applied after mount).
The source now guards optional alert actions and supplies valid unit inputs.
No test timeout, assertion or console-error policy is relaxed. The earlier
development pin remains a separate capture; both source patches are retained.

At this baseline checkpoint the complete Fountain suite passed 5,472 cases/338
files and the image used its packaged frontend. The later deployment and native
service results below supersede that integration state. Full toolbars/dialect coverage, real
MR/wiki/discussion flows, concurrent users and broader browser/product acceptance
remain open. The baseline is stopped after testing, with records retained in its
own volumes. Credentials and session state are not committed.

The release-pin source also passes GitLab's actual Prettier/Tailwind and ESLint
checks on the eight edited files. Technical submission errors carry codes while
the host supplies translated UI messages. The loading regression now changes the
public Markdown prop and waits on a pending renderer instead of assigning Vue
state directly. The public handoff method's lint annotation documents its
cross-component caller; unused-disable directives remain checked.

[Original-product report](../../artifacts/gitlab-product-baseline-20261112/report.json)
and [source/runtime verification scope](../../artifacts/gitlab-product-integration-20261112.json).

### Rebuilt host deployment and native document service

The matching source now builds its complete production frontend with Rspack,
without omitting page entries. The local profile binds that build read-only and
uses GitLab's official Rspack selection in the Rails environment. The recorded
prepared-host journey verifies the loaded guard-containing JavaScript by digest,
then performs rich/source/rich handoff, UI save/reopen, private-access denial and
a container restart over real records. Its final run passes and the restored
image/equation receive visual review. Earlier post-restart image-decode checks
failed; their cause is not established and the successful rerun does not close
that intermittent finding. Failure logs/screens remain evidence, not hidden skips.
The browser still uses GitLab's Tiptap editor with the prepared host changes.

`services/content_editor.ts` now provides the native Fountain model/service path:
starter extensions, math, source-aware GitLab codec, assets/references, history,
load supersession, explicit failed-source recovery and current-value reads.
Unloaded/pending/failed replacements cannot submit cached content. Host callback
failures are isolated from later editor subscribers and remain observable.
Unsupported options and legacy extensions/providers fail explicitly.

The self-contained real-service audit discovers the preview endpoint through
GitLab GraphQL, uploads its own PNG, imports real renderer HTML into Fountain
without a fake DOM, verifies exact untouched source, applies native transactions,
saves through authenticated GitLab HTTP, and reimports/reviews the resulting
table, checklist, mention, math, image and paragraph in GitLab's reader. It passes.
The runtime build retains byte/source hashes. This is a headless service audit;
it does not deploy or certify Fountain's browser component/toolbar.

The complete local unit suite passes **5,483 tests/339 files**, including eleven
native-service cases; 26 focused lifecycle/service cases and root types pass.
No shipped engine/API or capacity-limit change. Full native component, toolbars,
suggestions, upload controls, collaboration and complete dialect/application
coverage remain required. No capability row or product readiness claim is promoted.

[Native service contract](services/README.md),
[real-service report](../../artifacts/gitlab-native-service-20261112/report.json),
[prepared-host report](../../artifacts/gitlab-prepared-host-20261112/report.json)
and [checkpoint scope](../../artifacts/gitlab-native-service-integration-20261112.json).

### Native browser deployment — partial

The matching application now mounts the native Fountain service/view and a native
formatting toolbar in its actual issue-description and discussion composers. It
uses GitLab's real accounts, project, upload, render, issue and comment services;
there is no Tiptap-shaped editor facade. The installer retains the pinned public
props, slots, focus/change events, current-value handoff and interaction modes.

The final Linux Chromium journey passes eight checks: real sign-in/resources,
native typing/formatting/undo/redo, working checkbox controls, rich/source/rich,
UI save/reopen, a real discussion comment, anonymous denial and restart
persistence. Loaded script digests identify the native frontend. The native form
and post-restart reader receive visual review after the real image decodes.

Actual use found and repaired rejection of GitLab's inactive suggestion defaults,
empty/equal-document load failures, a missing Undo icon and generated heading
anchors leaking into Markdown. Equal loads adopt decoded node identities and
history-reset metadata; plugin vetoes still apply. The host requests undecorated
input HTML and forwards cancellation. Its arrow-only Babel override now correctly
treats the generated library as third-party code rather than application source.

All **183 integration unit cases in eleven files**, root types, one targeted
Chromium surface regression, and five-file upstream ESLint/Prettier checks pass.
The complete source frontend builds. Installer rollback/reinstall and refusal of
changed owned files pass, with all seven installed file digests restored.

The earlier upstream host run retained **61 passed / 14 failed**. The subsequent
insertion checkpoint below migrates those host fixtures and reruns the broader
three-suite acceptance set; neither result certifies the complete product.

[Install and rollback](runtime/README.md#native-browser-installation-in-progress),
[native browser report](../../artifacts/gitlab-native-browser-20261112/report.json)
and [checkpoint scope and retained failures](../../artifacts/gitlab-native-browser-integration-20261112.json).

### Native Markdown insertion and current acceptance

The real GitLab component now connects host paste events and an explicit browser
**Paste Markdown** action to native Fountain transactions. Pending renderer work
keeps its insertion target through unrelated typing; conflicting edits refuse
the operation with the source retained. Ordered requests, one-step undo,
serialization preflight/rollback, document replacement and disposal are covered.
An actual unsupported footnote is visibly retained for inspection/retry rather
than silently omitted. Saved-reply picker and general clipboard parity remain open.

The final recorded Linux Chromium journey passes **ten checks** against the real
application: clipboard/render/insert/history, rejected-source recovery, native
formatting/task controls, source handoff, UI save/reopen, an actual comment,
anonymous denial and service restart. Editor, retained-source controls and
post-restart reader receive visual review. There are no browser page errors.

The migrated upstream host suite passes **75/75** using the actual Fountain
surface and transactions. A reproducible patch applies after the prepared host
patch; forward/reverse checks and exact live-spec comparison pass. The broader
three-suite run is **126 passed / 42 failed**: host and issuable-form suites pass,
while the legacy component suite remains failing. Its Tiptap-only fixtures need
careful migration, and real attachment/menu/immersive/recovery requirements must
be verified or implemented rather than deleted from acceptance.

The full root unit suite passes **5,507 tests/341 files**, focused tests **82/3**,
all framework types and the public API snapshot pass. Package and complete GitLab
frontend builds, upstream three-file ESLint, performance/retention checks and
size checks pass. A public `insertDocument` repair preserves authored paragraph
attributes. Its measured CommonJS growth is 193 bytes; aggregate capacity rises
by 256 bytes, with entry, ESM, CSS and performance limits unchanged. This is not
a refreshed full release gate or hosted CI, and nothing has been published.

Full native toolbars/menus, uploads, autocomplete, saved replies/templates,
specialized dialects, source fidelity, providers, MR/wiki/multi-user flows,
localization, accessibility and cross-browser/product/release acceptance remain
open. The other two professional products remain unimplemented candidates.
No capability row or superiority claim is promoted.

[Insertion contract](services/README.md#asynchronous-markdown-insertion),
[recorded real journey](../../artifacts/gitlab-native-insertion-20261112/report.json)
and [current evidence and remaining failures](../../artifacts/gitlab-native-insertion-integration-20261112.json).

### Native component foundations and remaining controls

The native component migration preserves the original 53 component cases with
Fountain setup/assertions, plus two new recovery cases. The current three-suite
result is **163 passed / 7 failed / 170 total**: all 75 host and 40 form cases
pass; 48 of 55 component cases pass. No cases are skipped. The seven open cases
cover attachments and alert/link/media/code/reference contextual menus. Those
native controls still require implementation and user-facing acceptance, not a
Tiptap-shaped facade. The change from 42 to seven failures includes fixture
migration; it is not a claim of 35 product bugs repaired.

Actual fixes preserve replacement history options during Retry, keep failed
loads read-only until explicit recovery, restore immersive layout/sticky-header
classes and remove the default accessible label when `aria-labelledby` owns the
name. Host read-only policy remains authoritative after retry. Rejected document
Markdown is inspectable/copyable before and after recovery while the editor is
open. This panel does not persist a second source attachment in GitLab.

The shared browser view now identifies an empty document semantically, including
an empty paragraph containing an empty text node. Its placeholder paints without
becoming document text; real focus, typing, deletion, undo and non-text content
are verified in Chromium, Firefox and WebKit, with screenshots visually reviewed.
Firefox's computed CSS retains `attr()`; its visible screenshot confirms paint.

The expanded real-service journey also covers the actual empty comment hint and
failed-load Retry/explicit recovery/cancel against an unsupported saved record.
Server source stays unchanged; normal native paste, saves, comments, permissions
and restart remain covered. See the final report for the exact installed build,
recording, screenshots and test scope. Five core/component defects are addressed;
this is not complete toolbar, dialect, accessibility or product certification.

All 5,507 root unit tests/341 files, current types/API, builds, performance/retention
and measured size checks pass. The stylesheet needs 64 bytes of extra capacity
(90,906 measured bytes against 90,880 previously); JavaScript and performance
limits remain unchanged. Broader release/hosted gates and publication are pending.

[Component evidence and remaining failures](../../artifacts/gitlab-native-component-integration-20261112.json).

### Native attachments in the real application

The native paperclip button, file picker and image clipboard now upload through
GitLab's authenticated, CSRF-aware HTTP client. The host's actual returned
Markdown passes through its renderer and the native Fountain insertion queue.
File objects remain outside document/history. Native selection and typing marks
are captured before upload; unrelated edits map the target, and conflicts retain
the failed file for an explicit decision. Progress, cancellation, retry and
completed-upload reuse are connected to visible controls. Save refuses pending
or failed files; removing a failed file republishes the intact draft immediately.

The final real-service journey passes **17 checks**: image/file picker uploads,
decoded native images, one-step image undo/redo, actual Chromium image clipboard,
over-limit rejection and save recovery, exact uploaded Markdown in saved records,
downloaded text bytes, reader/reopen, private-project access refusal, discussions,
source recovery and an actual application restart. The original attachment limit
is restored after the bounded rejection test. Native editor and reader screenshots
are visually reviewed. GitLab's reader still applies its own Read more folding.

This testing found an engine bug: image-only rich insertion could leave the caret
in the preceding paragraph; non-first text fragments also used the wrong sibling
index. The command now lands after the last inserted item and preserves undo/redo.
Generated empty caret anchors do not export spurious formatting. Local history
captures optional typing marks, including through independently rebased snapshots.
Async host insertion preserves the captured typing format as well as selection.

The three actual upstream suites are **174 passed / 5 failed / 179 total**, with
all 75 host and 40 form cases passing. Two attachment requirements now use native
control assertions, and nine new upload/focus cases pass against the actual native
service/view. The five remaining alert/link/media/code/reference menu cases still
fail. They are not skipped or replaced by a Tiptap-shaped facade. Four ordered
patches reconstruct the tested specs exactly from pinned GitLab source.

All **5,530 root tests/342 files**, current types/API, built package-export smoke,
headless/server runtimes, builds, performance/retention and size checks pass.
Nine event-authored file-input contract cases pass in Chromium, Firefox and
WebKit. They do not certify native OS file drops or Firefox/WebKit image clipboard
in the full GitLab application. The public additions are optional `handleFiles`,
explicit `scrollSelectionIntoView()` and optional local-history `storedMarks`.
The aggregate CJS allowance grows by 512 bytes over the preceding component
checkpoint; measured growth is 308 bytes. Other acceptance limits stay fixed.

Earlier failures and audit corrections are retained: image visibility exposed the
caret defect; Firefox discarded constructor clipboard data in an event-authored
contract fixture; the isolated upload limit needed a bounded test setting;
server creation trims the seed's final newline; and direct-save assertions must
wait for the actual form-to-reader transition. An initial clean-caret regression
also exposed lost typing marks on redo and async insertion. A later initial-reader
lazy-image decode timed out despite valid HTTP bytes and painted failure pixels;
this intermittent reader finding remains unresolved. The final tests verify
these behaviors without relaxing timeouts or semantic/visual expectations.

Code review also found a whole-batch admission gap; the following checkpoint
repairs it. The earlier evidence retains the finding as it stood at that revision.

Full menus, reader image intermittency, dialect/source fidelity, templates/autocomplete, all media,
persistent recovery/orphan cleanup, collaboration/MR/wiki/multi-user workflows,
localization, assistive technology, mobile/cross-engine product and hosted release
acceptance remain open. The other two products are still unimplemented candidates.
Nothing is published and no parity or superiority row is promoted.

[Attachment contracts](services/README.md#native-attachment-insertion),
[real journey](../../artifacts/gitlab-native-attachments-20261112/report.json)
and [checkpoint evidence](../../artifacts/gitlab-native-attachments-integration-20261112.json).

### Whole-batch upload admission

Before any file in a selection is queued, the native component checks the actual
remaining capacity. If the selection will not fit, it refuses the whole batch
with a visible message. Existing pending/failed jobs count toward capacity;
cancellation/completion releases it, and a disposed service has no available
slots. No partial batch is uploaded silently. Choosing a smaller selection clears
the refusal and uses the normal real upload path.

Two new actual component cases pass: an empty queue rejects 101 files and accepts
a smaller retry; an existing pending upload survives a second refused selection.
The upstream total is **176 passed / 5 failed / 181 cases**. The same five native
contextual-menu cases still fail. A fifth ordered patch reconstructs the new specs.
The service set passes 38 focused cases and root TypeScript/ESLint pass.

The final real-service profile passes **18 checks**. Its actual file chooser sends
101 File objects to the native handler; the visible refusal occurs with zero
upload HTTP requests and unchanged content. A smaller file then uploads/inserts
successfully, saves and reopens with the other assets, and survives actual restart.
The refusal and native/reader screenshots are visually reviewed.

Public package code/API/capacities are unchanged from `16721038`; its 5,530-unit,
package/runtime/type/performance evidence remains historical and applicable to
that unchanged public build. Current integration acceptance is scoped above,
not a fresh full release gate. Reader image intermittency and all broader product
gaps remain open; nothing is published or promoted as full product/parity readiness.

[Current capacity evidence](../../artifacts/gitlab-native-upload-capacity-integration-20261112.json).

### Native text-link controls

The actual GitLab editor now creates, previews, copies, edits and removes text
links through native GitLab controls and the authenticated renderer. The form
prefills the entire label across mixed formatting and the canonical source URL.
Network failure retains both draft fields and leaves the document intact; retry
uses the real renderer after reconnect. Cancel/Escape returns focus through the
editor selection API. Selection bookmarks map unrelated edits; target conflicts,
replacement and disposal refuse stale changes. A new session supersedes old work.

Real use exposed additional failures: prevented modal submission also emitted
hide; popovers retained replaced DOM targets; DOM-only view repairs needed scoped
anchor observation; direct root focus reset the caret; preview actions could be
ellipsized. These are repaired and covered by native component/browser checks.
Mark-attribute updates now preserve mark order, and Markdown export keeps one
outer link across adjacent mixed-format text instead of splitting the reader link.

The final recorded actual-service journey passes **17 checks**, with real clipboard,
offline failure/retry, keyboard focus, undo/redo, exact server source, native reader,
private access refusal and application restart. Its video/screenshots are retained
and the settled popup and reopened reader were visually inspected. This is Linux
Chromium evidence; the earlier upload profile separately passes 18 checks.

The actual upstream suites are **250 passed / 4 failed / 254 total**: component,
Markdown host, issuable form, eight new native link cases and 64 work-item
description cases. The comparable earlier three suites plus link cases are
186 passed / 4 failed / 190 total. Alert, media, code-block and reference menu
requirements still fail; no cases are skipped. Six ordered patches reconstruct
the tested specs from pinned GitLab 19.5.3. The versioned nine-file installer also
passes source rollback/reinstall with identical file digests.

Seven isolated Storybook states plus a 360-pixel preview pass full-body/portal
accessibility scans and real control interactions (nine checks). Their fixed
renderer fixtures exercise component states; they are not product acceptance.
All **5,560 root tests/344 files**, 27 focused link-service cases, current types,
450 API contracts, packed export smoke, headless/server runtimes, builds,
performance/retention and size checks pass. Aggregate CommonJS grows 365 bytes;
its allowance increases 256 bytes using existing headroom. All other capacities
and semantic/performance expectations remain unchanged.

Scope is same-inline-parent text links. Inline atoms, hard breaks and cross-block
link editing remain unsupported; multiline table labels refuse conversion.
GitLab dialect/source fidelity, other menus, reader image intermittency, complete
role/surface coverage, mobile/cross-engine/assistive-technology acceptance and
hosted release remain open. No full-product or superiority claim is made.

[Checkpoint evidence](../../artifacts/gitlab-native-link-integration-20261112.json),
[real journey](../../artifacts/gitlab-native-links-20261112/report.json),
[link contracts](services/README.md).

### Native ordinary-code controls

The actual component provides a contextual code-language input with GitLab's
suggestions and custom labels, Apply/Cancel, complete source Copy and Delete.
Language edits preserve code text and surrounding content, and have one-step
undo/redo. Invalid/conflicting drafts remain visible; Escape restores the field
and editor focus. Composition Escape is left alone. Applying a language contains
the submit event so it cannot submit the enclosing GitLab issue form. Read-only
users retain Copy while mutation controls are disabled.

The converter now recognizes canonical GitLab code HTML, retains all source
characters and removes known syntax-coloring/presentation carriers. It handles
both pinned frontend fixtures and an actual authenticated renderer response with
`data-lang` and an empty Insert snippet control. Unknown markup, nonempty
controls and fence parameters refuse conversion. Recognized math is dispatched
to the existing math adapter first. Diagrams, frontmatter, suggestions, GLQL and
full snippet workflows remain dedicated adapter work.

Native code testing also found public engine failures: deletion could leave a
required list/quote/cell empty, nested selection mapping could fabricate an
invalid gap, and caret landing could skip an immediate replacement/successor.
These are repaired with source tests and undo/redo coverage. The service releases
closed sessions and subscriptions, maps unrelated edits and refuses changed or
replaced targets. Draft-target feedback across manual block switches still needs
broader native UX acceptance.

All **5,614 tests/347 files** pass. The recorded prerequisite run passes package,
450 API contracts, server/headless, scoped Markdown/math/DOCX checks, build
budgets, performance/retention and framework types, then exposes the math-routing
regression above. The repaired full unit rerun and current root types pass.
Aggregate CJS grows 248 bytes, with 256 bytes of measured allowance; other limits
remain unchanged. The source-pinned upstream set is **260 passed / 4 failed /
264 total**, including ten new code-control cases. Alert, media, code-block and
reference legacy-menu requirements remain failing; ordinary-code controls do
not close diagram/frontmatter coverage. Seven ordered patches reconstruct the
tested specs exactly. No cases are skipped.

Four isolated component states and a 360-pixel keyboard workflow pass eight
checks, including read-only browser clipboard copy, with no accessibility
violations or page overflow. A real theme collision was found and repaired by
pairing the native dark token colors with their background under GitLab CSS.
These component fixtures are separate from actual-service product acceptance.

The final actual-service journey passes **17 checks**: real renderer import,
language changes, clipboard, invalid/cancel recovery, root and nested deletion/
undo/redo, direct typing, exact server source, reader save/reopen, private access
refusal and actual application restart. The nested replacement paragraph must
remain in the viewport. Visual review of the first functional pass found that a
correct caret could remain offscreen after toolbar use; the final surface now
reveals it through the existing view API. Final editor, nested caret, reader and
restart screenshots are inspected, and browser recordings are retained. This is
Linux Chromium evidence, not cross-engine or complete product acceptance.
The eleven-file, version-3 source installer also passes restore/reinstall with
every file digest unchanged. This is source rollback evidence; it does not claim
a compiled deployment rollback exercise.

Full product, reader image
intermittency, complete dialect/source fidelity, all roles/surfaces, cross-engine,
mobile/assistive technology and hosted release remain open. Other products are
still unimplemented and nothing from this checkpoint is published.

[Checkpoint evidence](../../artifacts/gitlab-native-code-integration-20261112.json),
[actual journey](../../artifacts/gitlab-native-code-20261112/report.json),
[code contracts](services/README.md#native-ordinary-code-controls).

### Native GitLab alerts

The real GitLab component now exposes Insert alert, all five kinds, Convert to
text and Delete alert. Titles and bodies edit directly in the native view.
Generated titles follow their kind, while explicitly authored words such as
`Tip` remain unchanged when the kind changes. The converter uses fourteen
responses captured from the authenticated pinned GitLab renderer. Unknown or
ambiguous alert markup is refused with source retained.

Titles are plain, single-line text (up to 1,000 characters), matching the host
format. Rich formatting and link controls/shortcuts are unavailable there;
body formatting remains normal. Enter, Delete, Backspace, literal title paste,
mobile input events, empty-body exit and undo/redo have native boundary tests.
Active composition stays on the existing input path. These checks do not close
physical-device IME or arbitrary cross-block selection acceptance.

Structural Markdown projection keeps every quote/list prefix on nested code
and fenced math. Testing also exposed an editor-generated trailing caret
paragraph leaking into saved Markdown. The additive public
`MarkdownExportOptions.omitTrailingCaret` option removes only that known empty
repair node; authored, copied and JSON-reopened blanks are preserved. The
GitLab projection retains unchanged node identity so that ownership evidence
survives export. Default public export behavior stays unchanged.

All **5,685 tests/350 files** and the existing package/API, server/Worker,
headless, format, build-size, performance/retention and framework gates pass.
The public CommonJS total grows 107 bytes to 1,457,139 bytes, below its unchanged
1,457,152-byte limit. The seven upstream suites have **272 passed / 3 failed /
275 total**, including eleven native alert cases. Media, specialized code and
reference-menu requirements remain failing. Eight ordered patches reconstruct
the tested specs exactly; source lint passes without disabling rules.

The final real-service journey passes **17 checks**: normal sign-in, actual
renderer responses, native insertion/editing/kind changes, conversion/deletion/
undo, nested math/code, exact saved server source, the expanded reader, real
discussion creation, unsupported-source recovery, private access refusal and
application restart. Editor, reader and restart screenshots are visually
inspected, and browser recordings are retained. This is Linux Chromium evidence.
The version-4, thirteen-file source installer passes guarded rollback/reinstall;
all thirteen digests remain identical. Compiled deployment rollback is separate
acceptance work.

An earlier run failed on reader image decoding after restart; the failure is
retained and image intermittency remains open. Another run checked for a
conversion warning while the actual renderer was still loading. The audit now
waits for that real response before applying the same warning assertion and
timeout. No render/save responses, warnings or success outcomes are fabricated.
Neither later passing evidence nor isolated component checks establish full
GitLab product readiness, cross-engine acceptance or readiness of the other two
products. Nothing in this checkpoint is published.

[Checkpoint evidence](../../artifacts/gitlab-native-alert-integration-20261112.json),
[real journey](../../artifacts/gitlab-native-alerts-20261112/report.json),
[alert contracts](services/README.md#native-gitlab-alerts).

### Native media properties

The image/audio/video adapter retains canonical and resolved URLs separately,
recovers the description/title pair from GitLab's folded label, and projects image sizes and surrounding links
back into GitLab Markdown after other edits. The native properties form captures
one mapped atom, supports undo/redo, validates dimensions and preserves drafts
through invalid input, conflicting edits, cancellation and real renderer failure.
The contextual controls open/copy/remove media and use the existing real upload
picker for file replacement. Native audio/video playback has a separate document
selection button so editing does not intercept the player's controls.

Actual application testing exposed two public engine defects: deletion of a lone
inline atom could leave the next typed text in an extra paragraph, and a cold
replacement image could remain unloaded outside the viewport. The repairs retain
a text caret in the original paragraph, reserve temporary image geometry and
reveal selected nodes. Default and custom image renderers pass the same six
offscreen/delayed-response checks in Chromium, Firefox and WebKit without changing
saved document attributes. The public CommonJS graph grows 979 bytes from the
alert checkpoint to 1,458,118 bytes; its aggregate capacity increases by 1 KiB.
Individual entry, ESM, CSS, semantic and performance limits remain unchanged.

The real upload journey also exposed collapsed audio controls from explicit
automatic CSS dimensions. Native automatic dimensions now remain unset. Component
keyboard testing caught a form whose modal footer could not trigger native Enter
submission; the form now has its own submit control. Failed runs remain evidence,
not passing product acceptance.

This work does not close the original media-menu requirement. Diagrams, iframe
editing, drag resizing, all codecs, captions/tracks and all GitLab editor surfaces
remain unfinished or unverified. The other two complete reference products are
also unfinished. The showcase is to be built from the working integration and its
verified capabilities.

All **5,747 root tests/353 files** pass, as do the package/API, Node/Worker/headless,
format, framework, size and performance/retention gates. A retained table timeout
under overlapping frontend compilation passes serially and in the four-worker
full suite without changing its timeout or assertions. The eight upstream suites
remain **283 passed / 3 failed / 286 total**, with eleven passing media-component
cases. The original media, specialized-code and reference-menu requirements still
fail. Nine ordered patches reconstruct the specs; source lint and the guarded
fifteen-file source rollback/reinstall pass.

The actual Linux Chromium journey passes **21 checks**, including real image/WAV/
VP8 upload and playback, file replacement, canonical clipboard copy, offline draft
recovery, blocked-save recovery, source-mode handoff, exact saved Markdown, reader
reopen, private issue/upload refusal and application restart. Eighteen actual
renderer fixtures now include titled and mixed media. Nine component states at
desktop/360px widths pass with zero accessibility violations, separately from the
application evidence. Existing reader image intermittency and broad cross-engine,
physical-device and full-workflow acceptance remain open.

To repeat media acceptance after building/installing the matching native runtime
and rebuilding the pinned application, run in its Linux browser environment:

```sh
node scripts/create-gitlab-media-test-assets.mjs
node scripts/run-gitlab-native-browser-audit.mjs --media
```

The generator makes real PNG, PCM WAV and VP8 WebM files for the actual upload
picker. `--media-fixtures` separately captures renderer structures with illustrative
asset URLs; those fixtures are not playback/upload evidence. Browser recordings
and failures are retained. The immediate playback screenshot caught the modal's
closing fade; clean editor frames at 146/150 seconds are extracted from the same
retained recording. The restarted reader screenshot shows the decoded video,
audio controls and figure. No backend response or success outcome is fabricated.

[Checkpoint evidence](../../artifacts/gitlab-native-media-integration-20261112.json),
[real journey](../../artifacts/gitlab-native-media-20261112/report.json),
[media contracts](services/README.md#native-image-audio-and-video-properties).

### Native media file replacement

Replacement now owns the originally selected media from the moment the native
picker opens. Moving the cursor or editing elsewhere cannot redirect the upload.
The new file changes only the canonical/display URL; link marks, title,
description, dimensions and custom attributes remain on the original node.
Network/render failures retain the target and uploaded-file recovery for retry.
Conflicting edits or a different media kind refuse replacement without silently
inserting at the new cursor. Cancellation, permission/capacity refusal and
disposal release their owned sessions.

Actual source-mode reimport and image deletion exposed a shared pipe-table
alignment defect that blocked otherwise valid media edits. The public exporter
now distinguishes implicit `---` from physical-left `:---`, suppresses only
alignment represented by that column, and reports incompatible body-cell or
logical alignment. Both direct and protected HTML-container imports retain the
physical-left marker. An optional HTML-flow cell descriptor carries that marker;
existing adapter callers remain compatible. Rendered RTL reopening passes in
Chromium, Firefox and WebKit.

Visual review also exposed a weakness in the earlier video audit: its click hit
Chromium's seek bar, and a nonzero initial WebM timestamp could satisfy the old
positive-time assertion. The corrected audit clicks Play, requires time to advance
from its initial value and lets reader playback finish before capture. Earlier
runs remain evidence of their narrower checks, not proof of video playback.

The actual pinned GitLab renderer also omits audio dimensions. Source dimensions
are retained in the editor where unambiguous, and the properties form discloses
that GitLab's reader uses its standard player size. This boundary remains open.

All **5,786 root unit tests/355 files** and the package/API, Node/Worker/headless,
format, framework, size and quiet performance/retention checks pass. Eight upstream
suites remain **290 passed / 3 failed / 293 total**, including eighteen passing
media-component cases. The original complete media, code-block and reference-menu
requirements remain failing and unskipped. Aggregate CJS grows **556 bytes** from
the preceding checkpoint to **1,458,674 bytes**, with 512 bytes of additional
capacity over its previous ceiling; all other limits remain unchanged.

The final actual-service journey passes **24 checks** on issue 73, including
native file pickers, offline upload retry after typing elsewhere, wrong-kind
refusal, exact source saving, reopen, private-access refusal and an actual
application restart. Reader video advances and reaches its end after save,
reopen and restart; all three phases decode eighteen frames. Twelve isolated
component states pass **21 checks** with zero accessibility violations, including
the open audio properties form after nested modal animations complete. The
fifteen-file source rollback/reinstall and nine ordered patches also pass.

[Checkpoint evidence](../../artifacts/gitlab-native-media-files-integration-20261112.json),
[real recorded journey](../../artifacts/gitlab-native-media-files-20261112/report.json),
[component evidence](../../artifacts/gitlab-native-media-files-storybook-20261112/report.json).

Repeat the real-service upload/save/reopen/restart journey with `--media-files`
after installing the matching runtime and building the pinned GitLab frontend.
`scripts/audit-gitlab-media-storybook.mjs --media-files` separately exercises fixed
component states, including native picker ownership after cursor movement at
desktop/360px widths. Those fixtures do not substitute for real service evidence.
No full-product/parity completion or publication is claimed.

### Native reference controls

Native reference selection now exposes ID/title/summary choices, URL copy/open
and removal. Real GitLab issue and merge-request records supply the rendered
labels; the saved source retains `+`/`+s` and explicit project qualification.
User and label references offer navigation/copy/removal without unsupported
format choices. Formatting preserves surrounding marks and the user's current
cursor. Pending requests block saving; offline failure retains the draft, and
retry updates its captured target after unrelated editing. Cancellation,
supersession, target conflict and late read-only changes cannot apply stale data.

The recorded actual-service journey passes **18 checks** on issue 77, including
real renderer calls, actual clipboard copy/new-tab navigation, remove/type/undo,
offline recovery, persistence of the final serialized bytes, reader reopen, anonymous refusal and
application restart. The issue/MR/user/label fixtures come from actual seeded
records in the pinned private task project. Twelve isolated desktop/360px states
pass **18 checks** with zero accessibility violations and page errors; those fixed
component fixtures are separate from service acceptance.

The bridge retains exact Markdown for unchanged documents; edits can use its
canonical projection. This checkpoint preserves reference tokens/qualification
and final saved bytes, and does not establish exact spelling retention for every
untouched section after editing. That remains additional bridge work.

The native host-render assertion now targets `FountainReferenceMenu`, following
the existing link/alert adapters. It still requires the component to exist, and
thirteen additional component cases verify behavior. The nine-suite upstream set
is **304 passed / 2 failed / 306 total**; the original incomplete specialized-code
and media-menu requirements remain unchanged and unskipped. The reference test
patch also retains actual renderer fixtures and reconstructs its native boundary
after the preceding nine ordered patches.

Source installation now guards seventeen owned files (format 6), including the
new component/stories. No public library code, API surface or size ceiling changes
are required. All **5,826 root tests/356 files**, current types, 450-file public
API verification and unchanged size checks pass. The inherited package/runtime/
format/performance results belong to the preceding public-library checkpoint;
this private integration does not rebuild or change those library sources.
Reference autocomplete/hover cards, EE-only epic acceptance, all
editor surfaces, real role/concurrency coverage and full-product release checks
remain open. This does not complete GitLab or either other reference product.

[Reference contracts](services/README.md#native-reference-controls),
[checkpoint evidence](../../artifacts/gitlab-native-reference-integration-20261112.json),
[actual journey](../../artifacts/gitlab-native-references-20261112/report.json),
[component evidence](../../artifacts/gitlab-native-reference-storybook-20261112/report.json).

### Reference text boundaries

Typing directly beside a native reference previously joined its source to the
neighboring text during canonical export. The actual GitLab renderer stops
recognizing some of those strings; user mentions can also resolve to a different
account. The codec now retains the atom's text-node boundary with a plain inline
span, escaping its HTML text and adding no visible characters. Different marks
and existing whitespace retain their own boundaries. Code/link marks that would
suppress reference recognition are reported as export errors; correction leaves
the same document editable and restores serialization.

Thirty authenticated pinned-renderer fixtures capture the differing lexical
contexts rather than assuming all reference types share one rule. Twenty-nine
new pure-Node regressions cover loss prevention, literal HTML, neighboring atoms,
marked text and error recovery. The actual UI journey types `prefix`/`suffix`
beside issue, MR, user and colored-label references, saves through GitLab, then
checks the real reader after reopening and restarting the application. It passes
**19 checks** with zero browser errors. Native and final reader screenshots and
the recorded journey are visually reviewed; the final settled reader retains
the baseline typeset math, table and image as well as the four references.

All **5,855 root tests/357 files**, current TypeScript, API and unchanged size
checks pass. The seventeen-file guarded source rollback/reinstall passes. The
fresh upstream nine-suite set remains **304 passed / 2 failed / 306 total**;
the original media/code-menu requirements remain failed and unskipped. No
public library, API or size-ceiling changes are required. The first live run's
old literal-source assertion rejected the new span spelling after a successful
save; its evidence is retained, and the updated assertion additionally verifies
the actual rendered user-reference identity. The final run includes restart.

This is reference-boundary hardening, not exact untouched-section source
preservation or full-product completion. Broader dialect, surfaces, roles,
concurrency, deployment/rollback and the other two complete products remain open.
The professional-product requirements explicitly retain clean-environment
deployment and real connected workflows as release requirements.

[Checkpoint evidence](../../artifacts/gitlab-native-reference-context-integration-20261112.json),
[actual recorded journey](../../artifacts/gitlab-native-reference-contexts-20261112/report.json),
[boundary contract](services/README.md#reference-text-boundaries).

### Native Mermaid and PlantUML

The block-type selector creates both diagram kinds directly. Authors type source
in native code blocks and can copy it, change language, delete, undo and preview
it. Mermaid uses GitLab's script-only sandbox with correlated rendering and
recoverable native errors. PlantUML uses the actual configured provider, including
strict UTF-8 recovery of GitLab's image/source carrier. Unknown metadata and
unsupported fence parameters retain source through an explicit conversion error.

Real creation after bold prose exposed a bug that the earlier import journey
missed: inherited marks made the code unrepresentable and blocked deletion.
`setCodeBlock()` now atomically converts to plain fenced source, clears stored
typing marks, preserves the text characters and semantic selection positions,
and restores rich text on undo. Code formatting UI/shortcuts cannot recreate the
same problem. Fountain's general HTML preformatted-mark support remains intact.

The final recorded actual-service run passes **21 checks** on issue 85: toolbar
creation and native multiline typing of both kinds, real previews, invalid-source
recovery, offline retry, copy, conversion, deletion/undo/redo, saved reader,
reopen and actual application restart. Prior PlantUML settings are restored and
both task containers stop afterward. The 360px preview has no horizontal page
overflow; the scoped axe check has zero violations. Native/provider/restarted
reader screenshots are visually inspected and the recording is retained.

All **5,887 root tests/359 files**, current types/API and unchanged size checks
pass. The ten-suite upstream set is **318 passed / 2 failed / 320 total**. The
original media/code-menu requirements remain failed and unskipped. Nineteen-file
guarded source rollback/reinstall and eleven ordered test patches verify.
No public library/API/size-ceiling changes or publication are made.

This is Linux Chromium acceptance for the scoped Mermaid/PlantUML workflows.
The paired-dialog and saved-reader follow-ups are described below. Broader
browsers/roles, frontmatter, suggestions, GLQL,
remaining surfaces and complete product acceptance remain open.

[Evidence and retained failures](../../artifacts/gitlab-native-diagram-integration-20261112.json),
[recorded real journey](../../artifacts/gitlab-native-diagrams-20261112/report.json),
[source/preview contract](services/README.md#native-diagram-source-and-preview),
[reproduction](runtime/README.md#native-browser-installation-in-progress).

### Paired diagram authoring

`Edit diagram source` keeps a local source draft beside its live preview in a
GitLab modal; narrow screens stack the two. Apply replaces the captured block in
one undoable transaction. Cancel leaves the document unchanged. Target changes
retain the draft for copying and refuse Apply; cursor movement cannot redirect
it to a different block. The read-only component mode supports source inspection,
copy and preview without an Apply action. The owning host blocks saving and rich-to-Markdown handoff while
source changes remain unapplied.

Pure-Node tests cover empty source, Unicode/whitespace, target mapping, conflict,
late read-only state, transaction refusal and serialization rollback. Component
tests use the actual GitLab modal portal, and separate native-host tests verify
both guarded content-reading paths. These tests exercise local drafts separately
from the committed document; they do not establish persistent unsaved-draft storage.

The recorded actual-service journey passes **24 checks** on issue 87, including
invalid draft/copy/cancel, real Mermaid/PlantUML previews, one-step Apply/undo/redo,
360px layout and saved reader/reopen/restart. Desktop/narrow/error/restarted-reader
screenshots and representative recording frames are visually reviewed. The dialog
has zero scoped axe violations. Settings are restored and both task containers stop.
All **5,898 unit tests/359 files**, current types/API and existing size limits pass.
The eleven-suite upstream set is **329 passed / 2 failed / 331 total**; the original
unfinished code/media requirements stay failed and unskipped. Nineteen-file guarded
source rollback/reinstall and eleven ordered patches verify.

This establishes Linux Chromium acceptance for the documented authoring flow.
Persistent draft storage and full product/browser/role acceptance remain open;
the saved-reader follow-up is below. No public API, size limit, npm package or
website release is changed.
The recorded real-service evidence and current acceptance limits are in
[the authoring checkpoint](../../artifacts/gitlab-diagram-authoring-integration-20261113.json).

### Saved diagram reader recovery and cold images

The recorded invalid-source audit exposed an unhandled Mermaid rejection and a
visually hidden source carrier. The sandbox now catches the rejection and reports
a fixed failure flag; the reader accepts it only from its own opaque-origin frame,
shows a localized warning/Retry and reveals the original inert code. Successful
retry restores the diagram view. Existing legacy consumers retain Mermaid's own
error graphic. PlantUML already returns a readable provider syntax-error image;
its source carrier is preserved and is not replaced with a fabricated diagram.

The same real run reproduced the earlier intermittent 1×1 lazy-image failure.
GitLab swaps a decoded placeholder for the actual source after Markdown rendering,
so an initialization hook at that later source switch reserves temporary space.
Load/error removes only the owned marker and sizing classes; authored width/height
and existing classes survive. The normal GFM entry is restored byte for byte to
its pinned source. The discarded GFM-hook experiment and its failed positive probe
are retained as evidence, rather than counted as an image repair.

The final actual-service journey passes **23 checks** on issue 92: invalid source
survives UI save/reopen/restart, reader retry and mobile feedback remain usable,
and both sources reopen verbatim for native repair, UI saving and another reader
reload. The image probe observes **32×32 pending → 400×60 decoded** and removal of
temporary sizing. The scoped error region has zero axe violations and the run has
zero browser errors. Reader/error/mobile/source-repair screenshots and representative
recording frames are visually reviewed. Provider settings are restored and both
task containers stop afterward.

All **5,900 unit tests/359 files**, current types/API and existing size limits pass.
The seventeen-suite GitLab set is **415 passed / 2 failed / 1 original skipped /
418 total**. The original code/media requirements remain failed and unskipped;
the existing expensive Mermaid-count case remains skipped as in the pinned source.
No new skip or timeout increase waives a failure. Format 10 guards twenty-two
files, and twelve ordered patches reconstruct the tested specs. Source rollback/
reinstall succeeds; compiled deployment rollback remains separate work.

This is Linux Chromium evidence for the documented grammar-error/image flows.
Iframe bootstrap failures, broader browser/role/concurrency coverage and the full
product remain unverified. These are private host-view repairs, with no public
engine/API, size-limit, npm or website release changes.
[Evidence and retained failures](../../artifacts/gitlab-diagram-reader-integration-20261113.json),
[actual recorded journey](../../artifacts/gitlab-native-diagram-reader-20261113/report.json).

### Native document frontmatter

`services/frontmatter.ts` adds a GitLab-owned attribute to the existing Fountain
`code_block` schema. It uses the engine's actual code input, selections,
transactions and history; it does not introduce a second editor or change the
public Fountain schema. It imports the document/schema types from
`fountainjs-editor`, the parse5 tree types and the bounded literal-code helpers
in `services/code_rendering.ts`. It has no browser-global dependency.

The source contract comes from pinned GitLab's `lib/gitlab/front_matter.rb`,
`lib/banzai/filter/front_matter_filter.rb`,
`content_editor/extensions/frontmatter.js` and
`content_editor/services/serializer/frontmatter.js`. Twenty-seven captured
authenticated renderer responses cover YAML/TOML/JSON, empty headers, comments,
encoding/blank prefixes, BOM, CRLF, explicit language labels, alternate closing
markers, malformed literal metadata and labelled code fences.

The distinction between a document header and a fence matters: GitLab emits the
same `pre[data-lang-params="frontmatter"]` for both. The adapter checks original
source and renderer positions instead of inferring header semantics from HTML.
An actual header must remain the first root block. Labelled fences retain their
fence parameter, including inside a blockquote. Unknown/ambiguous renderer
carriers remain errors with the original Markdown retained. A CR-only source
that the actual GitLab renderer flattens is refused rather than advertised as a
successful metadata import.

**Insert frontmatter** explicitly prepends a new YAML header without replacing
the selected body content. The selected style reads **Document frontmatter**.
Context controls offer format selection, literal source editing, copy, delete
and explicit conversion to ordinary code. Quote/list/inline formatting actions
are disabled when their selection includes document frontmatter, including
Select all, so those actions cannot accidentally wrap or style the header.
The same platform-neutral selection helper protects formatting shortcuts and
`beforeinput`, including directed ranges, without swallowing body typing or IME.
YAML/TOML/JSON format changes preserve
the source text; they do not translate or validate its syntax. The source dialog
has no diagram preview or code execution, and read-only mode permits inspection.
Apply makes one captured, validated undoable edit. A changed target refuses
overwrite and retains the draft; unapplied source blocks host save/mode handoff.

Header spelling, comments, prefixes, delimiters and original header characters
survive an unrelated body edit. A source edit introducing a premature closing
delimiter is rejected atomically. Moving/duplicating a document header into body
content refuses serialization; it is not silently changed to an ordinary fence.
The complete untouched Markdown still uses the existing exact snapshot, while
other edited document sections continue to use canonical serialization. This
does not close the broader partial-edit source-fidelity requirement.

Reproduce the dedicated profiles from the repository root in the pinned Linux
environment:

```sh
node scripts/run-gitlab-native-browser-audit.mjs --frontmatter-fixtures
node scripts/prepare-gitlab-frontmatter-tests.mjs /absolute/pinned/gitlab-source
node scripts/check-gitlab-native-patches.mjs /absolute/pinned/gitlab-source --frontmatter
node scripts/check-gitlab-native-install.mjs /absolute/pinned/gitlab-source --frontmatter
node scripts/run-gitlab-native-browser-audit.mjs --frontmatter
```

Build/install the current native runtime and matching GitLab frontend before the
browser profile. Run source rollback with the application stopped and no test or
build reading the installed source. The dedicated browser profile uses normal
sign-in and actual issue persistence, checks reopened native source as well as
the reader, and verifies an application-container restart. It does not enable
the optional diagram provider.

The final profile passes **18 recorded Linux Chromium checks** on issue 97,
including exact header source through UI save, reader/native reopen and a real
application restart. Source/error/mobile dialogs and the settled reader are
visually reviewed, as are representative frames from the **215-second recording**.
The source dialog has zero scoped axe violations, the run has zero browser
errors, and both task containers are stopped afterward. Reader snapshots can
precede GitLab's asynchronous math/image hydration; the later settled-reader
checks and `original-after-restart.png` verify the existing equation and image.

All **5,946 root tests/361 files**, root TypeScript, 450 public declaration checks,
unchanged package size limits, upstream lint and the actual production frontend
build pass. The eighteen-suite GitLab set is **428 passed / 2 failed / 1 inherited
skip / 431 total**. The two original code/media menu requirements remain failed;
the expensive Mermaid-count skip is unchanged from pinned upstream. Format 10
still owns twenty-two files, source rollback/reinstall verifies their current
digests, and thirteen ordered patches reconstruct the tested specs/fixtures.
An invalid overlapping rollback/Jest run and a browser audit dependency-path
failure are retained, corrected and rerun; neither is treated as acceptance.
No public engine/API, size allowance, npm or website publication changes.
[Checkpoint evidence and limits](../../artifacts/gitlab-frontmatter-integration-20261113.json),
[actual browser report](../../artifacts/gitlab-native-frontmatter-20261113/report.json).

### Native contextual code and media surfaces

The original GitLab code/media bubble-menu entry points now mount the real
native Fountain controls. They retain the native session owner and use the
existing `FountainMenuController` plus `getEditorMenuAnchorRect`; no Tiptap
editor object or hidden substitute is supplied to satisfy the host assertions.
The Vue adapters delegate to the compiled native component render function
through GitLab's Vue compatibility helper.

`components/fountain_context_surface.vue` owns browser-only placement and focus.
It uses GitLab's existing headless Tippy dependency, anchors to the captured
block, stays inside the viewport and containing work-item or modal content,
and docks the controls below the toolbar at narrow widths. **Alt+F10** moves focus from the
editor into its contextual controls. Escape cancels a code-field draft or
dismisses the surface and restores editor focus. Editor-owned Escape is
intercepted before the owning GitLab edit form can interpret it as closing the
whole edit form. Focus outside the editor/menu hides the floating surface;
its trigger restores the retained draft. Nested source/properties dialogs hide
the floating controls while keeping their drafts and their own focus/cancel
behavior. The trigger's ARIA reference uses the final namespaced popup ID,
assigned after Tippy initializes its portal. Teardown removes the portal,
observers, animation frame and document/window listeners.

Language/source drafts continue to belong to their captured code block even if
the caret later moves into another diagram. The displayed actions, source copy,
preview and eventual Apply use that owner. A clean language-edit session can
transfer directly into source editing without recapturing the later caret.
Mapped paths follow unrelated edits; a replaced/conflicted target retains its
draft and refuses overwrite. Code and media sessions now also recognize a
new document identity when its JSON content happens to be equal, rather than
relying only on the transaction's semantic `docChanged` flag. Those session
rules run in pure Node.js; DOM geometry stays in the view component.

Generation 11 owns twenty-five files, including two verified original entry
points and the shared surface. The fourteenth ordered patch adds native
contextual integration cases without weakening the original host assertions.
Run the source rollback check only with the application stopped and all source
test/build processes finished:

```sh
node scripts/prepare-gitlab-context-menu-tests.mjs /absolute/pinned/gitlab-source
node scripts/check-gitlab-native-patches.mjs /absolute/pinned/gitlab-source --context-menus
node scripts/check-gitlab-native-install.mjs /absolute/pinned/gitlab-source --context-menus
node scripts/run-gitlab-native-browser-audit.mjs --context-menus
```

The real-service profile includes the ordinary/nested code workflow, captured
owner changes, browser clipboard, keyboard dismissal/reopening, narrow source
and media dialogs, image properties/delete/undo, source-mode handoff, actual
save/reopen and application restart. It keeps renderer/engine behavior distinct:
syntax highlighting can display canonical `javascript` while the authored
language remains `js`. Component stories separately cover contextual code,
read-only controls, image/audio/video and narrow docking using fixed renderer
fixtures and actual local media files. They do not prove real-service upload or
permission acceptance.

The final selected upstream set is **439 passed / zero failed / one inherited
skip / 440 total across nineteen suites**, including nine new contextual cases.
All **5,949 root tests/361 files**, current TypeScript/API, existing size limits,
upstream lint and the actual frontend production build pass. Eight isolated
component states pass full-body axe checks, browser clipboard and audio/video
preview playback. The recorded actual GitLab journey passes **21 checks** with
save/reopen/restart and zero browser/scoped accessibility errors. These are
Linux Chromium results, not cross-browser or whole-product certification.
[Checkpoint evidence, retained failures and scope](../../artifacts/gitlab-context-integration-20261113.json),
[actual browser report](../../artifacts/gitlab-native-context-menus-20261113/report.json),
[component-state report](../../artifacts/gitlab-native-context-storybook-20261113/report.json).

For the isolated component audit, prepare a filtered configuration with
`node scripts/prepare-gitlab-link-storybook.mjs /absolute/pinned/gitlab-source --context-menus`.
From that source's `storybook` directory, build it with
`corepack yarn build -c .fountain-context-audit -o /absolute/pinned/context-storybook`,
where the output directory is the sibling of `gitlab-source` named
`context-storybook`. Then run `node scripts/audit-gitlab-context-storybook.mjs`
from the Fountain checkout. This uses GitLab's existing Storybook configuration
and accessibility dependency; no public-service or provider substitution is
claimed as real GitLab acceptance.
The exact local PNG/WAV/VP8 fixtures are retained in
`artifacts/gitlab-media-test-assets`; the checkpoint records their hashes.
`node scripts/create-gitlab-media-test-assets.mjs` can generate fresh sample
assets in the pinned browser environment for further testing.

### Reviewed toolbar and media presentation

The desktop floating-menu trigger now retains its natural inline width, instead
of forcing a full-width toolbar row. Attachment and Markdown paste stay in one
named group. Markdown paste uses the existing Markdown icon with its full title
and accessible name. The selected media panel identifies the item, emphasizes
Properties, uses secondary open/copy actions, and separates destructive deletion
in a footer. Narrow docked controls retain their full row.
The portal intersects its host boundary with actual clipping ancestors, so a
taller panel can move below its selection without covering application chrome
outside the visible scroll area.

Reproduce the dedicated real-service UI journey with
`node scripts/run-gitlab-native-browser-audit.mjs --context-ui`. It includes the
existing contextual controls and save/reopen/restart checks, then measures a
single desktop toolbar row, adjacent clipboard/file controls and clear vertical
separation for deletion. The exact cropped toolbar and popup screenshots are
retained alongside the full-page views and recording. Run the isolated component
audit with `node scripts/audit-gitlab-context-storybook.mjs --refined-ui` after
building the current filtered Storybook. These presentation changes do not
alter the engine or document format. The existing root-unit baseline is reused;
current GitLab component, browser and accessibility checks cover the changed UI.
[Presentation evidence and scope](../../artifacts/gitlab-context-ui-integration-20261113.json).

### Native quick-action controls

The optional `quickActionProvider({ query, signal })` boundary supplies validated
records from GitLab's actual available-command endpoint. The model layer owns
matching, async cancellation, root-level insertion and literal/active transactions;
Vue owns the view, focus, ARIA and authenticated transport. No Tiptap editor facade
is constructed. The toolbar inserts a command after the owning root block, rather
than inside a table or quote. Suggestions replace the command name while retaining
existing arguments. Preview text comes from the current server renderer; it does
not execute actions. That checkpoint did not include label/user argument
completion; the follow-up near the top of this document adds that boundary.

The menu uses ordinary design-system rows and a bounded scrolling list. Button
text explicitly wraps despite GitLab's default ellipsis rule, and its height uses
a supported spacing token. The mobile panel follows the toolbar controls. Escape
dismisses the menu without cancelling the application edit form, Alt+F10 reaches
the list, and owned textbox ARIA is restored on close/unmount. Stale provider items
cannot be applied after their selection/document changes.

The recorded real-service profile passes 17 checks with zero browser errors and
zero violations in the scoped description/menu accessibility scans. It creates
the label command through the UI, checks its effect preview, switches literal
interpretation with undo, submits through Save, and verifies reopen/restart.
The selected upstream set passes 462 cases in 21 suites with one original skip.
The full Node set passes 6,059 cases in 364 files. The shared surface also fixes
Alt+F10 focus in docked mode, with a regression that failed before the repair.
Popup overflow is constrained on both axes, including failed-command loading in
a short host. Six command-state views and eight code/media regression views use
actual native components and strict accessibility/layout checks, with explicit
fixed transport fixtures distinct from the real service journey.
This remains private partial integration, not full quick-action/product parity.
[Controls evidence](../../artifacts/gitlab-quick-action-controls-integration-20261114.json).

### Remaining full application acceptance

1. Run a version-pinned GitLab instance and original editor; retain baseline
   data, browser recordings and upstream test results.
2. Implement the complete component and host contract with explicit lifecycle,
   selection/history, loading/failure recovery and read-only behavior.
3. Preserve GitLab Markdown and rendering semantics. Exercise existing content
   as well as newly authored documents. Unknown syntax must not disappear or
   be silently reinterpreted. Cover mentions/references, quick actions, math,
   diagrams, code suggestions, frontmatter, tables, tasks and media.
4. Use real authenticated GitLab APIs for creating, saving, reopening and
   updating issues, MR descriptions, discussions and wiki pages. Exercise the
   existing product's boards and project navigation over those real records.
5. Verify real uploads, links/references, templates, drafts, permissions,
   concurrent users, reconnect/conflicts, keyboard input, mobile and accessibility.
6. Run applicable upstream tests on the replacement. Add native browser journeys
   and visually review the original/replacement outcomes. Persistence must
   survive browser reload and service restart.
7. Demonstrate proposed Fountain improvements with working product features and
   measured evidence. Source fidelity, large documents, structured references,
   review and conversion are candidates, not superiority claims yet.
8. Deliver reproducible installation, configuration, migration/rollback,
   extension/provider contracts and developer documentation. Build the public
   showcase from this working integration and its verified capabilities.

Do not mark this integration complete from a familiar-looking page, an interface
inventory, passing isolated Fountain tests, or a service double. Do not expose
unimplemented actions as working product features. Keep real backend credentials
in host configuration, outside shipped browser assets and source control.
