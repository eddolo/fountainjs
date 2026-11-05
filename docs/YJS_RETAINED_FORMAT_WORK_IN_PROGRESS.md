# Retained insertion formats — local work in progress

2026-11-05. The extra deletion regression from the
[document bridge checkpoint](YJS_RETAINED_DOCUMENT_WORK_IN_PROGRESS.md) now passes
in the isolated candidate. This does **not** repair the default adapter, certify
production performance, authorize a migration, or change the website. Commits
remain local per the user's publishing preference.

## Repair and evidence

`src/yjs/retained-text.ts` imports Yjs and uses a private `$fountain:format`
attribute for each insertion. Its identity combines the local client ID and
current Yjs clock; its payload records that insertion's complete source format.
Two insertions receive different markers even when their visible styles match.
This avoids depending only on an older surrounding leaf-format marker that an
offline peer can delete. The insertion-owned payload is restored with text by
Yjs undo/redo; projection never guesses a default format or writes a repair.

Formatting keeps the insertion provenance immutable and changes separate wire
fields. Values are encoded strings, including an explicit null value for a
removal. Without that distinction, a competing snapshot could resurrect a
removed mark. Private split boundaries inherit their surrounding wire format
rather than clearing it; concurrent formatting may legitimately cover a boundary
the author has not seen. Projection validates those fields, excludes the boundary
from text/styles, and still rejects unknown embeds or malformed provenance.
Adjacent equal logical runs coalesce after the wire-only metadata is removed.

The source checks pass all **118 cases in four candidate files**. They include
the unchanged full-deletion regression, an added undo/redo regression, actual
mixed-leaf styles and attributes, invisible/astral text, save/reopen, both exchange
and client-ID orders, independent mark removal/addition, three-peer deletion,
split/format concurrency and six reproducible offline edit sequences. Each local
step in those sequences checks its intended text and style result, beyond peer
convergence alone. Invalid and oversized provenance is rejected without replacing
the underlying shared data. The six sequences execute 480 operation attempts;
empty operations and inapplicable joins may do nothing.

**48 compiled ESM/CommonJS Node journeys pass** using actual Fountain commands,
author undo/redo, composed cut ordering, mixed/plain full deletion, source styles,
save/reopen and read-only projection. No fake DOM is installed; browser globals
are absent before and after the probes. Both compiled source maps match the five
current source modules. Source TypeScript passes. Public API and headless source
checks still verify 423 declarations and 132 modules against the existing public
build; the public implementation sources and exports are unchanged.

The separate, unchanged default-adapter file still has **16 passes and six
required failures**. Together the two focused runs cover 140 tests: 134 pass,
six fail, none are skipped. This is **not** a new full-repository unit run.
The earlier 4,226/7 full-suite result belongs to the preceding checkpoint.
The isolated candidate is absent from the public runtime source maps. No new
browser behavior, visual verification, release readiness or parity is claimed.

## Measured adoption blocker: typing cost

The diagnostic sampler compares the preceding candidate with this candidate
using the same compiled Fountain engine and 1,024 single-character transactions
in one paragraph. The intended model stays exact, with one native text leaf.

| Sample | Preceding candidate | Format candidate |
| --- | ---: | ---: |
| Total edit-sequence time | 224.4 ms | 2,518.5 ms |
| Encoded shared-state size | 2,187 bytes | 296,079 bytes |

These are one-process observations, not a production gate, cross-platform
benchmark, comparison with the current default adapter, or measurements of one
keystroke. The older candidate is incorrect under the deletion workload. Its
smaller state does not justify dropping the retention guarantee.

The new per-insertion payloads and full projection have a substantial cost.
Before integration, reduce repeated style payload/storage overhead and establish
incremental projection/lookup; measure long histories, wire growth, initialization,
released memory and history/offline-aware compaction at the existing targets.
Do not hide this cost by raising a performance or size ceiling. The diagnostic
does not establish that any existing production budget passes for this candidate.

The next work remains the entire adapter contract: selections/awareness, review
anchors, structured-state overlays, provider replacement, explicit recoverable
legacy cutover, general moves/joins and custom invariants, the original six tests,
and recorded browser/IME/clipboard journeys after actual integration.

All three internal codec tags now end in `/2`. Earlier provisional document/text
representations are refused rather than silently upgraded. No live provider room
has been converted and no dependency, public package entry or acceptance ceiling
has changed.

[Verification receipt](../artifacts/yjs-format-verification-20261105.json) ·
[Typing-cost sample](../artifacts/yjs-format-cost-20261105.json).
