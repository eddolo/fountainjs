# Native GitLab inline suggestion acceptance

Status: private service foundation verified; active host adapter still guarded.
Pinned target: GitLab CE 19.5.3, source
`0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf`.

## Existing evidence

The suggestion node/source codec retains empty versus blank replacement lines,
offsets, fences and container structure. Captured editing sessions own their
proposal, preserve replacement text on range changes and reject stale edits.
1290 integration unit cases, TypeScript and two recorded local desktop journeys
pass. See `artifacts/suggestion-editing-integration-20261116.json`.
Those local controls use a fixed raw-file fixture and do not prove repository
posting or application. The latest installed GitLab runtime remains the earlier
task-state checkpoint.

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
and a preview line differing from the host anchor are refused. The production
host guard still rejects active suggestions. Three live single-line contexts
(Unicode, empty, trailing spaces) match actual raw repository responses; the
visible native form still shows that guard rather than a functioning suggestion
editor. This is context evidence, not posting/application acceptance.

The capture separately records the MR API's `sha` and preview `head_sha`; they
differ in this receipt. Determine their actual revision relationship before
posting/applying. Do not infer branch-head freshness from either field alone.

`line_utils.js` reads rendered line text, strips CR/LF and maps literal backslash-n
to U+E000. The adapter must distinguish this host transport convention from real
source characters. Preserve original source and verify against raw repository
content; do not globally remove zero-width or private-use characters.

## Required next acceptance

1. Single-line Unicode/blank/trailing-space contexts are captured. Extend actual
   default Rapid Diffs capture to multiline, literal backslash-n and context lines.
   Compare selected lines against the actual same-origin raw-file response.
2. Known legacy/Rapid Diffs fields now validate and revision changes invalidate
   sessions. Verify the remaining real host context variants and revision semantics.
   Verify source preview requests use the host's real context parameters.
3. Implement/verify expanded suggestion-preview HTML separately from the existing
   plain project-preview fenced-code response. Original comment source owns the
   replacement text; rendered diff rows and display fillers do not.
4. Install coherent runtime/frontend source patches. Expose clear insert/source/
   absolute file-range controls and keyboard exit; verify the real host's quick
   submit shortcut cannot accidentally submit a draft while leaving code.
5. Through the real UI, post and edit inline single/multiline proposals. Reopen
   persisted comments and verify exact source, offsets, target file and revision
   through GitLab APIs. Include empty deletion and meaningful blank lines.
6. Apply a proposal and a review batch through GitLab's normal actions; verify
   the resulting repository file/commit. Cover revoked roles, changed branch/
   file revisions, conflicting proposals, cancellation, and restart retention.
7. Run selected upstream suites, full relevant local gates, source reconstruction/
   rollback, native browser/restart acceptance and inspect recorded outcomes.
   Only then replace the active host guard and promote product/parity claims.

The engine owns editing and source preservation. GitLab continues to own
repository writes, authentication, roles, review queues and application policy.
