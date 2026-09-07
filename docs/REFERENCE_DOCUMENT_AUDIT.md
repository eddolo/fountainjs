# Real-document reproduction benchmark

Status: **open; reference inspection and first structural preflight only**.
Added from the user's 2026-09-07 requirement. This strengthens DOC-09, DOC-10,
FORMAT-03, and FORMAT-05 acceptance; it is not another delivered capability.

The benchmark is an editable reconstruction of real documents made with established
domain software, not a screenshot/PDF embedded in Fountain. A successful equation
render, preserved source string, or green unit suite is not whole-document parity.

## First academic reference

[Tiago Sequeira (2022), NeuralFieldEq.jl, JOSS 7(75), 3974](https://doi.org/10.21105/joss.03974)
is released under [CC BY 4.0 on the publisher's page](https://joss.theoj.org/papers/10.21105/joss.03974).
Retain author, title, DOI, license, and modification notices in any derived fixture
or public demo; an unofficial reproduction must not imply publisher endorsement.

- [Published PDF](https://www.theoj.org/joss-papers/joss.03974/10.21105.joss.03974.pdf):
  SHA-256 `af6c56ccda78793424114cf1b2d8af75cb85a22815c9c40c25f2a0cc3988cc5c`.
- [Pinned paper source](https://github.com/tiagoseq/NeuralFieldEq.jl/blob/e68d061e4d91e336b326076cb9ffd61bcbeb41b9/JOSS/paper.md):
  SHA-256 `ea86c661c312b286331afb8eb8d6bac23c741a6d0df37e6c0045a9672e0c584c`.
- The source combines Markdown, TeX environments, and bibliography metadata;
  it is not a plain CommonMark document. Publication-source/template consistency
  still needs checking before treating a rebuilt PDF as the original oracle.
- The downloaded PDF identifies LaTeX/LuaHBTeX (TeX Live 2021), four A4 pages.
  All four pages were rendered with Poppler and visually inspected on 2026-09-07.
  The reference includes numbered display equations, inline mathematics, a title
  and metadata sidebar, footnote, nested instructions, code, a captioned plot,
  numerical table, linked bibliography, and repeated citation/page-number footer.

Run after `pnpm build`:

```sh
node scripts/audit-academic-reference.mjs
```

This opt-in networked diagnostic verifies the pinned source checksum. It is
deliberately **not** part of the passing package gate while reproduction is
incomplete; it exits nonzero for missing required structures. It never executes
the paper's Julia examples or accepts a changed reference automatically.

Observed first preflight, 2026-09-07:

| Requirement | Observed result |
| --- | --- |
| Preserve untouched input string | Pass |
| Recognize inline math | 35 inline math nodes; individual formula fidelity not yet audited |
| Two displayed equation environments | **Fail: zero math blocks** |
| LaTeX table | **Fail: zero table nodes** |
| Recognizable code/image content | One code block and one image node; asset/render fidelity untested |
| Full source-to-editor-to-export visual reproduction | **Not run** |

Do not hide the display-equation/table failures by manually replacing the source
with simpler syntax and calling import compatible. Manual authoring and automatic
import are separate workflows; any adapter or translation must be explicit and
preserve/report source semantics, labels, citations, and losses.

### Editing prerequisite discovered during follow-through

The math node view and demo toolbar previously used single-line inputs, which
cannot display multiline TeX faithfully. Merely inspecting source could strip
line endings and clear a stored accessibility description. They now use
textareas, preserve unchanged source/labels, and keep native control focus while
transactions update the selected node. Display Enter adds lines; Ctrl/Command+Enter
finishes. A recorded source-editing journey exercises backward replacement,
undo/redo and Markdown reimport. This is an editing prerequisite only: the two
paper import failures above remain open, as do typeset visual reproduction,
numbering, cross-references, bibliography, and full export fidelity.

Verification on 2026-09-07: `pnpm check` passed 901 tests in 83 files, along
with API, package, pure-runtime, conformance, build-budget and performance gates.
Six native math contracts passed across Chromium, Firefox and WebKit under
`artifacts/browser-multiline-math-20260907c/results/`, and twelve related
focus/custom-node/widget regressions passed under
`artifacts/browser-control-focus-regression-20260907a/results/`.
All four recorded capability journeys passed under
`artifacts/manual-multiline-math-20260907c/results/`; the multiline before/after
screenshots were visually inspected. That review found and fixed collapsed
line breaks in the source-only preview as well. Runtime code measures 1320.8 KiB
ESM / 1102.3 KiB CJS; only the aggregate CJS ceiling increased by 1 KiB to 1103.
No dependency, public API, individual-entry, or performance-ceiling change.
This evidence does not certify physical-device IME or typeset-paper parity.

## Lean reference track

Use a complete, nontrivial proof sequence from the official
[Theorem Proving in Lean 4](https://github.com/leanprover/theorem_proving_in_lean4/tree/4e28129fdd58037f8f5857548d5e99fe4fb0cc57),
initially its `book/TPiL/InductionAndRecursion.lean` chapter. The repository
[license is Apache-2.0](https://github.com/leanprover/theorem_proving_in_lean4/blob/4e28129fdd58037f8f5857548d5e99fe4fb0cc57/LICENSE).
Selection of the exact complete proof sequence, dependency/toolchain pinning,
and the recorded comparison are **pending**. The chapter is a Verso document
with imports; it must not be submitted as an isolated theorem without its context.

Compare the same source, imports, toolchain and project in native Lean and
Fountain's real provider. Record intermediate goals/diagnostic positions,
Unicode editing, deliberate invalidation, correction, undo/redo, and exported
source rechecking. Include warning/axiom inspection: `sorry`, admitted results,
or a source-only/disconnected provider must never count as completed proof.
One-shot compilation does not certify interactive LSP/InfoView parity.

## Acceptance for each reference

1. Pin provenance, permission, source/assets, fonts, toolchain and reference output.
2. Rebuild the document as editable Fountain content through documented public
   controls/APIs. Record authoring/import separately from reading and export.
3. Check all content: formulas, labels/references, citations, figures/captions,
   table values, code/proofs, footnotes, and exact technical source where promised.
4. Edit representative elements as a user, including insertion, replacement,
   backward selection, deletion, copy/paste, undo/redo, save/reopen, and re-export.
5. Inspect **every page** of original, editor/print view, and independently rendered
   PDF/DOCX exports side by side. Record page breaks, alignment, font metrics,
   equation spacing/numbering, and measured differences. Pixel differences may
   identify mismatches; antialiasing alone must not conceal content/layout loss.
6. Keep unsupported features and dependencies visible in an issue ledger. No
   full-paper “1:1” badge until the agreed content, behavior and layout checks pass.
7. Pair the public comparison demo with the developer recipe and reproducible
   evidence. Extend the corpus to a two-column paper, a thesis/report, and other
   document workflows; this first short paper cannot certify those layouts.

Browser math rendering is not a full TeX document compiler. Native Lean remains
the proof checker, not Fountain. These boundaries must stay clear while the
reproduction work identifies and closes genuine editor capabilities gaps.
