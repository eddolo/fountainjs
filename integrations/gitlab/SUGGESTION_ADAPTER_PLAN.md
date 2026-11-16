# Native GitLab inline suggestion acceptance

Status: explicit native candidate now verifies live insertion/editing/posting, single
suggestion application and cold restart. Default guard callers still reject
active configuration. Full review/product acceptance remains open.
Pinned target: GitLab CE 19.5.3, source
`0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf`.

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

## Immediate source-integrity follow-up

Before promoting this candidate, resolve the known Rapid Diffs transport collision:
`line_utils.js` replaces literal backslash-n with U+E000. A synchronous prefill
from `context.lines` cannot distinguish that marker from a genuine U+E000 source
character. Capture both real cases, use the immutable raw-file source to recover
exact selected lines, and make insertion cancellation/selection ownership safe
while fetching. Do not globally replace or strip U+E000, and do not present the
current positive Unicode case as proof that this transport edge is supported.
This is the next implementation task before broader review-batch expansion.

## Required next acceptance

1. Single-line Unicode/blank/trailing-space contexts are captured. Extend actual
   default Rapid Diffs capture to multiline, literal backslash-n and context lines.
   Compare selected lines against the actual same-origin raw-file response.
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
5. A newly authored single-anchor proposal expands to three file lines, posts
   exact Markdown and survives reload/restart. Still cover editing already-posted
   and applied/outdated proposals, selected multiline anchors, empty deletions
   and meaningful blank replacements through the real UI and APIs.
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
