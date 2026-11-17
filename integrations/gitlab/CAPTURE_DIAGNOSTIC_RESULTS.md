# Saved-issue capture diagnostic (2026-11-17)

The earlier blank original-editor reopen assessment was incorrect. The unchanged
saved PNG contains the document. Its heading, paragraph and whole content regions
are byte-identical to the rendered keyboard control. The
[pixel review](../../artifacts/gitlab-compatibility/crossblock-caret-20261117/reopened-pixel-review.json)
records original hashes, region bounds and decoded RGB hashes. No editor change
or image repair was required. The earlier assessment and its correction remain
in Git history and the visual-review receipt.

## Additional read-only browser evidence

The new `paint` diagnostic reopens the exact saved original/native issues from
the cross-paragraph corpus. It verifies the saved-report SHA-256 and persisted
Markdown, then uses the actual Edit/rich-editor controls without typing or saving.
It runs three declared profiles per editor:

1. Existing heading/700 ms readiness; animations-disabled capture first.
2. Same readiness; animations-allowed capture first.
3. Font readiness and two animation frames before capture.

Each profile captures both animation modes. Snapshots record document graphs,
heading glyph/element rectangles, ancestor display/opacity/visibility, font state,
scroll/layout state and post-capture state. They use read-only DOM inspection.
The existing deployment/version/source/mount guards apply unchanged.

**All six profiles and twelve captures complete**, with no browser errors and
persisted source unchanged. Every before/after graph matches the expected saved
document. All captured headings contain painted text. Within each editor, all six
document-interior RGB regions are identical. Original/native typography differs;
this is not cross-editor pixel equality, twelve new parity wins or a performance
benchmark. Representative original/native captures were inspected directly from
original PNG bytes. [Checks and image hashes](../../artifacts/gitlab-compatibility/paint-reopen-20261117/pixel-review.json).

[Original browser report](../../artifacts/gitlab-compatibility/paint-reopen-20261117/original-1/report.json)
and [Fountain control](../../artifacts/gitlab-compatibility/paint-reopen-20261117/fountain-1/report.json)
retain all CSS/content observations. The isolated application is stopped.

## Repeat

The diagnostic needs the pinned prepared runtime and the saved records referenced
by `fixtures/compatibility-paint.json`; it deliberately refuses changed source.
On a fresh backend, collect a fresh cross-paragraph pair first and explicitly pin
its report paths/hashes in a new reviewed paint fixture. This checked fixture
reuses existing task volumes; it does not manufacture missing issue records.

With the application stopped, choose a fresh ID:

```sh
node scripts/run-gitlab-compatibility.mjs --editor original --run-id paint-example --suite paint
node scripts/run-gitlab-compatibility.mjs --editor fountain --run-id paint-example --suite paint
```

This is a capture diagnostic, not input for the compatibility classifier. The
[retained pixel analyzer](../../artifacts/gitlab-compatibility/paint-reopen-20261117/verify_pixels.py)
uses Python/Pillow to read existing PNGs and refuses an existing analysis output.
For the retained run, select a fresh output path:

```sh
python artifacts/gitlab-compatibility/paint-reopen-20261117/verify_pixels.py artifacts/gitlab-compatibility/paint-reopen-20261117/pixel-review-repeat.json
```

Dark-pixel counts corroborate these controlled, inspected headings. They are not
a universal visual threshold. No images, acceptance budgets, package dependencies,
editor runtime or published claims change. Wider browser/mobile, rapid input,
source-range, table-grid and full product acceptance remain open.
