# FountainJS opportunity roadmap

This roadmap preserves product opportunities that arise from user feedback,
upstream issue boards, editor-community discussions, and FountainJS's own parity
audit. It is not a shipped-feature list and it is not permission to replace
current release gates with a larger pile of unfinished modules.

Demand claims submitted on **2026-09-04** are recorded here as research leads.
Before priority is justified publicly, the original Tiptap/ProseMirror issue or
discussion must be linked, dated, checked for current status, and translated
into an independently tested user outcome. FountainJS will not copy upstream
code or APIs.

## Do not rebuild what is already here

Several requested outcomes already ship and should be hardened rather than put
back into a “future” list:

- provider-neutral threaded comments, mapped annotations, tracked changes, and
  named version history;
- cancellable asynchronous suggestions shared by mentions, slash commands,
  emoji, and other triggers;
- audio, video, files, provider-gated embeds, images, and upload boundaries;
- rowspan/colspan-aware table transforms, selection, resizing, repair, and
  rectangular clipboard interchange;
- Markdown/HTML/JSON/text interchange with explicit loss reporting;
- large-document latency, DOM churn, NodeView churn, and memory budgets.

Their current limitations remain in [TIPTAP_PARITY.md](TIPTAP_PARITY.md); “has
an implementation” never means “has a decade of production evidence.”

## Active now: extension trust and authoring

PROD-06 owns manifests, exact extension API compatibility, deterministic
requirements, hard duplicate/contribution conflicts, framework-neutral
conformance tests, a safe package generator, and installation-wide diagnostics.
The `fountainjs-editor doctor` command is included here because it is the direct
completion of that contract, not a separate speculative feature.

## Prioritized after PROD-06

| Priority | Outcome | Current baseline | Required proof before “Delivered” |
| --- | --- | --- | --- |
| 1 | Print-aware pages and pagination | `DOC-14` is missing | A4/Letter and custom sizes; margins; manual/automatic breaks; editable headers/footers/page numbers; footnotes; non-destructive table/list/media splitting; widow/orphan policy; print/PDF fidelity; measurable reflow cost; accessible continuous fallback. CSS boxes alone do not qualify. |
| 2 | Stable node identities and lookup | `DOC-17` is missing | Configurable IDs; indexed lookup/update/select APIs; deterministic paste and collaboration collision repair; undo/mapping; schema filtering; JSON migrations; comments/suggestions compatibility. |
| 3 | First-class interactive widgets | NodeViews are delivered, but product authors assemble form behavior themselves | A framework-neutral widget state contract for controls, focus/cursor handoff, Tab/Enter/Escape policy, validation, undo, remote changes, read-only rendering, teardown, React and plain-DOM examples. |
| 4 | Granular collaborative structured attributes | Yjs maps node attributes independently, but a nested object remains one attribute value | Typed path updates into nested maps/arrays; schema validation at the changed path and whole-node boundary; concurrent non-overlapping edits; undo; JSON portability; malicious-depth/size limits. |
| 5 | Truly server-native document conversion | Headless model and Markdown exist; safe HTML still uses DOM facilities | DOM-free HTML parse/serialize for Node.js, Bun, Deno, and worker runtimes with CPU/memory budgets, safe parser substitution, identical validation, and packed-runtime tests. |
| 6 | Virtualized or paged rendering for huge documents | 10,000-block engine budgets exist; the view still renders the complete document | Retained selection and IME correctness across mounted windows, search/decorations/NodeViews, scroll anchoring, accessibility, printing, collaboration, and real 100k-block performance evidence. |
| 7 | Native renderer feasibility | Core/view separation exists; DOM/Web Component/React are web surfaces | A written coordinate/input/IME/accessibility bridge design and a prototype for either React Native or Flutter before promising native packages. A web view does not count as native. |
| 8 | Higher-fidelity Markdown source preservation | Semantic round-trips and loss reports exist | CommonMark/GFM corpus, frontmatter, footnotes, raw/parsed switching, source-span preservation where safe, unknown-syntax policy, and format-stability fixtures. Exact source preservation and semantic preservation must be named separately. |

Pagination and footnotes should be designed together because page geometry,
continuation, numbering, print output, and table splitting interact. Stable node
IDs should precede widgets and deeper review/database integrations because it
provides a durable external-reference primitive.

## Secondary research queue

These are useful, narrower ideas. They should become ledger rows only after an
owner defines persistence, selection, accessibility, collaboration, format,
performance, and browser behavior:

- explicit Word, Google Docs, and Excel paste normalization (`DOC-19`);
- table captions and advanced image/text wrapping;
- cross-editor schema-aware drag and drop plus a general inline/block drop cursor;
- footnote/endnote interchange independent of paged rendering;
- configurable soft limits in addition to enforced hard character limits;
- iframe/isolated-surface editing and host focus coordination;
- vertical Japanese writing with logical selection/navigation evidence;
- spell-check, dictionaries, thesaurus, and replaceable language-service hooks;
- visible tabs, non-breaking spaces, and other invisible characters (`DOC-16`);
- YAML frontmatter and raw/visual Markdown switching.

## Sequencing rule

Finish and certify one ledger outcome before beginning another. Each outcome
must remain framework-neutral at its model/command boundary, ship through the
public MIT package, include a working packed-package example, pass applicable
unit/browser/accessibility/performance gates, document honest limitations, and
be compared against ProseMirror + Tiptap as a combined stack. Community size and
years of deployment are evidence gaps that features alone cannot erase.
