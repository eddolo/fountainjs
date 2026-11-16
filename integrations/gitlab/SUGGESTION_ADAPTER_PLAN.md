# Native GitLab inline suggestion acceptance

Status: raw-source/multiline and posted-review source workflows are verified.
The deletion-effect safeguard is verified, but overall review acceptance remains
failed on stock server Applied-metadata retention. Default guard callers still
reject active configuration; full review/product acceptance remains open.
Pinned target: GitLab CE 19.5.3, source
`0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf`.

Matched empty/newline deletion now has [original-editor UI evidence](COMPATIBILITY_DELETION_RESULTS.md):
explicit effect explanation, whitespace consent and source reopening improve;
application semantics match. The host still cannot apply meaningful blank-line
replacement, and the earlier shared Applied-history failure remains open.

## Existing evidence

The suggestion node/source codec retains empty versus blank replacement lines,
offsets, fences and container structure. Captured editing sessions own their
proposal, preserve replacement text on range changes and reject stale edits.
The earlier service foundation passed 1290 integration cases and two recorded
local desktop journeys. The current native candidate passes 1323 integration
cases / 51 files, strict types and 546 selected upstream cases / 23 suites
(one inherited skip). The historical foundation receipt is
`artifacts/suggestion-editing-integration-20261116.json`. Those local controls use a fixed raw-file fixture and do not prove repository
posting or application. A coherent suggestion runtime/frontend is now installed
and verified in the isolated GitLab. Five live checks cover insertion, source/range editing, undo/redo,
Ctrl+Enter without submission, exact Markdown posting and a real source-branch
Apply commit. A separate cold restart verifies the note, file, commit/head and
visible Applied reader state. See `artifacts/suggestion-native-integration-20261116.json`.

## Host contracts to cover

The initial live diff probe opened the default **Rapid Diffs** interface, not the
older Vue diff grid. Its different selectors caused that first capture to fail;
`artifacts/suggestion-context-live-20261116/legacy-selector-failure.png` records
what actually opened. Do not switch to the old interface simply to pass the test.

The older NoteForm contract comes from
`app/assets/javascripts/notes/components/note_form.vue` and
`app/assets/javascripts/diffs/utils/diff_line.js`.
The default Rapid Diffs contract comes from:

- `app/assets/javascripts/rapid_diffs/utils/code_suggestions.js`
- `app/assets/javascripts/rapid_diffs/utils/line_utils.js`
- `app/assets/javascripts/rapid_diffs/app/discussions/note_form.vue`
- `app/assets/javascripts/rapid_diffs/app/discussions/new_line_discussion_form.vue`

Rapid Diffs additionally supplies `previewParams`: `preview_suggestions`, `line`,
`file_path`, `base_sha`, `start_sha` and `head_sha`. Its note form incorporates them
into the Markdown preview URL. These identify a specific file/revision context;
they must be validated and captured, not discarded as unknown UI metadata.
The service now validates and freezes these exact known fields and includes them
in captured session ownership. Unknown keys, malformed file paths/commit hashes
and a preview line differing from the host anchor are refused. Default guard
callers still reject active suggestions. The native component explicitly opts into its known source/range adapter. Three live single-line contexts
(Unicode, empty, trailing spaces) match actual raw repository responses; the
earlier captured form showed the guard at that checkpoint. The newer native
candidate has real authoring/application evidence; the original context receipt
remains a historical observation.

The differing MR API `sha` and preview `head_sha` are explained for the captured
case: read-only actual Git objects show that the preview head is a merge commit
whose parents include the source commit and target base; the selected file is
identical at both heads. Preserve the real host preview refs rather than replacing
them with the MR API head. See `artifacts/suggestion-revision-relation-20261116.json`.
Changed branch/file contexts and concurrency still need their own acceptance.

`line_utils.js` reads rendered line text, strips CR/LF and maps literal backslash-n
to U+E000. The adapter must distinguish this host transport convention from real
source characters. Preserve original source and verify against raw repository
content; do not globally remove zero-width or private-use characters.

## Verified raw-source transport follow-up

Source-integrity follow-up (2026-11-16): native suggestion insertion now fetches
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

[Source-integrity receipt](../../artifacts/suggestion-transport-integration-20261116.json).
The native UI calls `suggestions.insertVerified()` using the same-origin,
authenticated, abortable `loadSuggestionSource` boundary. `prepareRange()` verifies
the same encoded host context against raw source and keeps the exact file snapshot
for its final recheck. LF line boundaries are required by suggestion Markdown;
CRLF is split for line comparison without normalizing the stored snapshot.
The private synchronous `insert()` helper refuses ambiguous U+E000 prefills; it is
not the native product insertion path.

## Real posted-review effects and remaining host requirement

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

Pinned server evidence:

- `lib/gitlab/diff/suggestion.rb#to_content` returns empty replacement for
  ActiveSupport `blank?`, including meaningful blank-line source. The original
  negative case retains exact Markdown but applies a deletion to the real file.
- `app/services/notes/update_service.rb#update_suggestions` deletes all suggestion
  records and invokes `Suggestions::CreateService` on note updates. The new records
  lose the original Applied flag even when replacement source is unchanged.
- `app/models/suggestion.rb#appliable?` derives eligibility from current/cached
  conditions. Do not confuse that computed field with persisted application
  history or assert that its value is stable through restart.

The host owns application history. Do not invent Applied metadata from Fountain
undo state or mark a proposal applied merely because source text matches. A future
host adapter/repair needs explicit identity/history rules and real controls for
changed, duplicated, reordered and outdated proposals. This remains open.

[Current scoped receipt](../../artifacts/suggestion-effects-integration-20261116.json).
[First matched results](COMPATIBILITY_RESULTS.md) now classify actual original/
Fountain handoff, source, application and applied-prose outcomes. The server
Applied-history requirement is a verified shared limitation in the tested UI
pair. The broader [comparison plan](COMPATIBILITY_SUITE_PLAN.md) remains open;
no classification is inferred for workflows not yet run on both editors.

## Required next acceptance

1. Six actual Rapid Diffs contexts now cover selected multiline, literal
   backslash-n/private-use collisions, blank lines and trailing spaces against raw
   source. Actual unchanged/context-line and broader legacy transports remain.
2. Known legacy/Rapid Diffs fields now validate and revision changes invalidate
   sessions. Verify the remaining real host context variants and revision semantics.
   Ten actual contextual preview responses retain their original replacement
   source, including empty/blank lines, containers and Unicode.
3. The actual contextual endpoint still returns source-bearing code carriers,
   already handled by the codec. Browser-expanded reader widgets are a separate
   layer: posting and Applied display are verified, but importing arbitrary
   rendered diff widgets is not. Never reconstruct replacements from diff rows.
4. Coherent runtime/frontend, native controls, keyboard exit, source reconstruction
   and rollback now pass. Physical review caught and repaired host inline-code
   contrast and an unwanted empty paragraph on insertion. Keep broad mobile/
   browser, focus and accessibility coverage open beyond the tested profile.
5. Posted replacement, empty deletion, confirmed whitespace-deletion and
   applied-note prose editing now retain exact source through actual UI/APIs.
   Overall applied-history acceptance remains failed as above. Meaningful blank
   replacement is a retained host limitation, not a claimed supported file effect.
   Outdated proposals and additional multiline/context variants remain.
6. Single application now verifies the exact file, new commit and branch head,
   plus cold-restart retention. Still cover review batches, revoked roles, changed
   branches/files, overlapping proposals and cancellation. Rapid Diffs collapsed
   the applied thread and the gutter probe did not reopen it; preserve that
   retained UI issue. MR overview Applied display works before and after restart.
7. Current scoped local/native/upstream/source/restart checks pass. Broader
   review acceptance above, cross-browser/mobile native journeys and hosted CI
   remain required before promoting the overall product/parity claim. No package
   version, public API/size/performance limit or publication changed.

The engine owns editing and source preservation. GitLab continues to own
repository writes, authentication, roles, review queues and application policy.
