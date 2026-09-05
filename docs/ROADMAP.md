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

## Delivered foundation: extension trust and authoring

PROD-06 owns manifests, exact extension API compatibility, deterministic
requirements, hard duplicate/contribution conflicts, framework-neutral
conformance tests, a safe package generator, and installation-wide diagnostics.
The `fountainjs-editor doctor` command is included here because it is the direct
completion of that contract, not a separate speculative feature. That outcome
is now certified in [TIPTAP_PARITY.md](TIPTAP_PARITY.md) and documented for
extension authors in [EXTENSIONS.md](EXTENSIONS.md).

## Delivered foundation: stable releases and migrations

PROD-07 owns explicit API-stability levels, deprecation windows, document and
extension migration contracts, release evidence, security-support policy, and
repeatable release gates. That outcome is now implemented and publicly
certified in [TIPTAP_PARITY.md](TIPTAP_PARITY.md); the operational contracts are
in [MIGRATIONS.md](MIGRATIONS.md) and [RELEASES.md](RELEASES.md).

## Delivered: print-aware pages and pagination

DOC-14 is the first delivered post-foundation capability. Its measured
layout/persistence architecture includes fixtures for pages, headers, footers,
footnotes, tables, lists, media, manual breaks, and continuous accessibility.
Its first platform-neutral milestone now ships in source: physical geometry,
legal-fragment flow, non-persisted automatic boundaries, manual breaks,
footnote intent/integrity, transient first-reference numbering, standard
Markdown and semantic HTML interchange, canonical default/first/odd/even header/footer
templates, dynamic page fields, renderer-neutral per-page furniture/footnote
projection, undo, HTML/JSON, and Yjs. The browser side now
also has isolated measurement for text lines, direct blockquote children, list
items, rowspan-safe table groups, long-footnote line continuations, and manual
breaks; every fragment maps back to its model and
structural paths plus clip geometry, and every page placement resolves to an
exact validated source slice. A separate read-only renderer now projects those
slices into fixed sheets with repeated furniture, table headers, footnotes,
physical print rules, and one continuous accessibility copy. Chromium, Firefox,
and WebKit verify physical A4/Letter sheet geometry, stable named pages,
furniture/fields, footnotes, page breaks, and print-only accessibility/editor
state. A Chromium PDF gate additionally verifies page count, MediaBoxes, and
representative page-specific content without a duplicate hidden document. Timed reflow
observation is coalesced, and mutation-only cycles reuse unchanged top-level
geometry under 1,000-block/75 ms and alternating-edge 5,000-block/250 ms p95
browser gates. Leading insertion/removal preserves 5,000 unchanged DOM blocks,
rebases their model/source paths, and holds page measurement to two/one geometry
reads under a 500 ms p95 structural gate. A guarded editable surface now places
whole top-level blocks and continues measured paragraphs, canonical list items,
and rowspan-safe table row groups over fixed page shells while retaining one
unchanged contenteditable, direct model paths, identity, native IME, and
cross-page selection. Continuations use reversible accessibility-hidden
widgets or spacing, never document nodes. A split table remains one editable
table; page shells show read-only repeated column headers rebuilt from its one
canonical header. Two-row headers retain safe row/column spans, transitive body
rowspans stay in one fragment, and a header rowspan entering body rows disables
the incomplete repeated copy. Canonical page templates and footnote definitions remain
uniquely editable in ordered rails around the page stack while sanitized,
field-resolved, accessibility-hidden copies appear on their assigned sheets.
Rows taller than a page body remain one editable row with explicit overflow.
Images, audio, details, code blocks, and custom NodeViews now follow the same
canonical keep-together rule: move intact when possible and show explicit
non-clipping overflow when taller than the page body. Pagination-owned
attributes and style variables preserve custom NodeView identity without
weakening recovery for unrelated DOM mutations. The read-only renderer also
continues multi-block blockquotes at their canonical direct-child boundaries
while repeating their measured container overhead, and accepts strictly
validated host-declared custom continuation bands and a
sanitized host-owned placement projection for custom NodeViews, canvases,
embeds, and atomic media whose live DOM is unsuitable for print. This contract
does not mutate the model or claim that an arbitrary widget is safely editable
across pages; the guarded live surface falls back to continuous mode for a
custom split.
Long footnotes use the same neutral measured-fragment contract and exact source
offsets in editable and print projections, with no duplicate persisted definitions.
Mapped comments and top-level movement are certified across continued lists and
tables. The surface returns to continuous mode when either the
viewport or embedding container is narrow, and restores pages without
remounting when space returns. History, tracked suggestions, and bidirectional
Yjs edits remain live across those automatic boundaries without persisting page
numbers. Styled semantic HTML imported through the public schema contract is
now checked across all three desktop engines for marks/alignment, ruby, math,
nested quote/list structure, merged tables, and manual breaks, with exact
Chromium PDF body-token de-duplication. This bounded contract is delivered;
new document families remain hardening work under the same gates. CSS
page-shaped boxes or destructive document splitting do not qualify.

## Delivered: stable node identities and lookup

`DOC-17` now provides configurable, portable identities without forcing IDs onto
text leaves; indexed lookup, update, and selection APIs; deterministic repair for
paste, duplication, and mixed-client collaboration; position-neutral history
mapping; schema filtering and stored-JSON normalization; and compatibility with
arbitrary extension nodes and portable attributes. Identity generation is
injectable for deterministic tests and non-browser runtimes, and an invalid or
duplicate identifier never silently targets the wrong node. The complete
400-test package suite and 278-pass Chromium/Firefox/WebKit/mobile
[CI run for `8fca57c`](https://github.com/eddolo/fountainjs/actions/runs/33967296032),
plus its successful
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33967296119),
certify the public package and rendered demo.

## Delivered: first-class interactive widget contract

The first-class widget implementation keeps validated values in
portable document attributes; accepted changes are one undoable transaction;
generic Yjs collaboration reproduces them; and explicit focus/cursor handoff,
Tab/Enter/Escape policy, read-only behavior, teardown, and validation are shared
by isolated plain-DOM and React adapters. Public working examples exercise both
renderers. The complete 414-test package suite and 281-pass
Chromium/Firefox/WebKit/mobile
[CI run for `cced9e2`](https://github.com/eddolo/fountainjs/actions/runs/33969832708),
plus its successful
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33969832692),
certify the public package and rendered demos.

## Delivered: granular collaborative structured attributes

The implementation defines bounded DOM-free object/array contracts, typed
nested commands, whole-root and schema validation, stable-ID addressing, and an
opt-in nested `Y.Map`/`Y.Array` representation beside backward-compatible flat
JSON. Package and real-browser tests prove separate nested fields, changes
inside array objects, concurrent array insertions, local-only undo, room
replacement, public controls, canonical repair, malicious-value failure
containment, and preflighted local writes that cannot partially mutate the
shared canonical tree. The complete 425-test package suite and 284-pass
Chromium/Firefox/WebKit/mobile matrix passed in
[CI run `0a33c87`](https://github.com/eddolo/fountainjs/actions/runs/33972148767),
and the corresponding
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33972148765)
succeeded.

## Delivered: truly server-native document conversion

The isolated `fountainjs-editor/html/server` entry now parses HTML into the same
schema-validated model without `window`, `document`, `DOMParser`, jsdom, or
another fake DOM. Platform-neutral `parseHTML` rules give custom nodes and marks
one browser/server contract while existing `parseDOM` rules remain compatible
and browser-only callbacks are reported rather than impersonated. Input, tree,
depth, attribute, parser-error, performance, memory, bundle, packed-package,
browser/server parity, and adversarial URL/recovery gates are enforced. The
emitted import/export path runs in Node ESM/CommonJS, Bun, Deno, and Cloudflare
`workerd`. The complete 439-test package suite and 284-pass
Chromium/Firefox/WebKit/mobile matrix passed in
[CI run `ebc3194`](https://github.com/eddolo/fountainjs/actions/runs/33974721733),
and the corresponding
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33974721742)
succeeded. A clean no-DOM core declaration package is still a separate
portability task and is not implied by this conversion milestone.

## Delivered: virtualized rendering for huge documents

The opt-in top-level window keeps the complete immutable model while mounting
only the viewport, overscan, and semantic selection islands. Its neutral height
index reuses measurements by node identity and preserves absolute model
positions. Stable structural scroll anchoring, distant model-backed search and
editing, Japanese IME, decorations, deterministic NodeView lifecycle, remote
transactions, wide rich copy/cut preparation, explicit accessibility/export
suspension, and automatic full-render printing are covered without weakening
the ordinary non-virtual editor. A real 100,000-block contract keeps fewer than
100 top-level blocks mounted across Chromium, Firefox, WebKit, Pixel/Chromium,
and iPhone/WebKit. The complete 452-test package gate and 289-pass browser/mobile
matrix passed in
[CI run `8a6264e`](https://github.com/eddolo/fountainjs/actions/runs/33977243766),
and the corresponding
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33977243779)
succeeded. Scope, accessibility policy, and the one-enormous-block limitation
are explicit in [VIRTUALIZATION.md](VIRTUALIZATION.md).

## Delivered: enforced platform-neutral core boundary

The portability audit proved that the model, schema, logical selections,
transactions, history, extension composition, collaboration state, Yjs, and
serializers run without a browser, and the isolated server HTML entry is already
runtime-certified. The additive `fountainjs-editor/core` implementation now
compiles and is consumed with no `lib.dom`; a source-graph gate rejects DOM,
React, browser-parser, and aggregate-web imports; Node tests cover generic and
Yjs collaboration without fake browser globals; and the compatible web root and
StarterKit remain unchanged. The complete 455-test package gate and 289-pass
five-surface browser/mobile matrix (with two intentional Chromium-only PDF
skips) passed in
[CI run `2c7ff4c`](https://github.com/eddolo/fountainjs/actions/runs/33979389234),
and the corresponding
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33979389243)
succeeded.
This designs for future native renderers now; it does not start React Native,
Flutter, SwiftUI, or Compose implementations.

## Native-renderer feasibility design: decision complete

The new engine boundary removes unnecessary browser dependencies, but it does
not make native rich-text editing a renderer swap. The next milestone is a
written bridge design grounded in Fountain's actual selection, transaction,
composition, clipboard, accessibility, and layout contracts. It must identify
the smallest host interface, lifecycle and ordering rules, serialization and
threading costs, and failure boundaries for React Native and Flutter/native
bridges. No production native package should be promised or started until that
design is reviewed; Electron and Tauri continue to use the certified web
surface. A deliberately small feasibility spike may follow the design, not four
parallel renderer implementations. The architecture decision, proposed host
boundary, fail-fast criteria, first-spike scope, and platform risk register are
now explicit in [NATIVE_RENDERER_FEASIBILITY.md](NATIVE_RENDERER_FEASIBILITY.md).

## Active now: higher-fidelity Markdown source preservation

Fountain already reconstructs its supported Markdown semantics and reports
projection loss, but semantic equality is different from source equality. The
first additive source capsule now keeps unchanged input exactly, retains
strict leading YAML frontmatter as inert exact text, reports whether output is
`exact`, `blocks`, `mapped-blocks`, `frontmatter`, or `canonical`, and
canonicalizes changed source honestly after a visual edit. It never executes
YAML and preserves unknown body syntax after a model change only in safely
mapped unchanged blocks. The first versioned, Fountain-authored
CommonMark/GFM-oriented fixture subset also covers ATX/Setext headings,
indented and variable fenced code, collision-safe variable-delimiter code
spans, strict semicolon-terminated HTML5 character references, all ASCII
punctuation escapes, URI/email autolinks, star emphasis, and both hard-break
forms without claiming complete standards conformance. GFM one- and two-tilde
strikethrough is exact-run aware, stops at paragraph boundaries, and keeps runs
of three or more literal. The first GFM extended-autolink slice recognizes
boundary-safe `www.`, `http://`, and `https://` links, validates domains, and
trims punctuation, unmatched closing parentheses, entity-looking suffixes,
and `<` exactly before URL safety validation. Entity-obfuscated URLs
are decoded before protocol validation, while canonical export protects
literal entity-shaped text. Safe path/query-relative destinations, balanced
parentheses, strict title closers, bounded reference labels, and code/paragraph-
aware single/multiline reference extraction, escaped definition labels, and
global definitions nested in blockquotes are also covered. Malformed inline
destinations now preserve shortcut-reference precedence, while actual nested
links suppress their outer link without mistaking code spans for link syntax.
Reference identifiers use pinned Unicode 17 full case folding rather than
locale-sensitive or incomplete JavaScript lowercasing.
Definition labels can span nonblank lines and reject unescaped nested brackets.
Explicit empty links remain semantic links across Markdown and browser/server
HTML, without weakening validation for empty image, media, or action URLs.
Inline parsing now validates physical line endings before projecting ordinary
soft breaks to spaces, so forbidden newlines cannot create accidental link
destinations. Title separation uses CommonMark's ASCII whitespace set rather
than treating non-breaking space or other Unicode spacing as syntax.
Code spans, autolinks, and valid inline HTML are opaque to link-label bracket
matching, preventing false outer closures and hidden inner references.
Reference matching normalizes raw source identifiers rather than parsed inline
content, so escape and character-reference spellings do not falsely collide.
It now applies the exact label-whitespace class, counts the 999-character bound
by Unicode code point, and covers the official adjacent-reference precedence
matrix without letting an earlier shortcut capture a following label.
Image descriptions project nested inline formatting, links, and images to
plain alt text rather than preserving Markdown punctuation in accessibility
metadata.
Inline atom marks now close a lower-level model gap: links and emphasis around
images remain attached to the image node through Markdown, browser/server HTML,
DOM rendering, JSON, and Yjs, while block marks remain schema-invalid.
GFM bare email autolinks accept the specified local-part characters, require a
multi-segment domain, remove a final period from the link, and reject invalid
plus, hyphen, or underscore domain tails rather than linking a valid-looking
prefix.
Safe angle-bracket protocol autolinks cover case-preserving `mailto:` and XMPP
destinations in addition to HTTP(S). CommonMark's syntactic acceptance of
arbitrary and invented schemes does not override Fountain's security boundary:
unknown protocols and `javascript:` remain inert literal text.
End-of-fragment star and underscore closers now obey the same Unicode-aware
flanking rules as every other delimiter, so preceding spaces and line endings
stay literal. List-marker separation is restricted to CommonMark's ASCII spaces
and tabs rather than treating non-breaking spaces as structural syntax.
Thematic breaks now accept spaces or tabs between three or more matching
markers, retain the three-space indentation bound, and interrupt surrounding
lists instead of being swallowed as list-item text.
ATX headings now trim standard trailing spaces and recognize an all-hash
optional closing sequence instead of exposing it as heading content.
Lists now accept all three bullet markers and preserve a structural boundary
when the bullet marker or ordered delimiter changes, avoiding accidental merges
of adjacent source lists.
Ordered lists may start at any value at a block boundary, while only a list
starting at `1` interrupts an existing paragraph as CommonMark requires.
Setext underlines now terminate either a single line or a multiline paragraph,
retaining inline marks across the heading's soft line breaks.
The emphasis baseline now prevents intraword-underscore and whitespace-opening
false positives, accepts double-underscore strong and triple combined runs,
and exports canonical emphasis with round-trip-safe stars. This deliberately
does not claim the remaining full delimiter-stack algorithm.
Unambiguous nested strong/emphasis spans now stay inside their enclosing mark;
links, code, autolinks, and inline HTML group more tightly; and a generated
semantic-span fallback preserves otherwise ambiguous adjacent text-node mark
boundaries without giving up reference-style link output.
CommonMark rule-of-three arithmetic now prevents an ambidextrous delimiter run
from closing the wrong span, including compact nested forms with no separating
whitespace. Earlier overlapping spans keep precedence, including when an
otherwise competing same-marker opener sits inside a nested unlike strong span.
The broader delimiter stack is still an explicit compatibility target rather
than a completed claim.
Uneven-run handling now leaves unmatched delimiter characters outside the
formatted span and round-trips the otherwise ambiguous adjacent literal/mark
boundary through escaped canonical Markdown.
Shared opener/closer runs now preserve parse-order nesting, including repeated
emphasis, underscore surplus, and multiple strong levels. Duplicate identical
marks take the lossless semantic-span export path instead of being silently collapsed.
Indefinite mixed nesting now survives soft line breaks and link labels. The
semantic fallback keeps a non-outermost link at its exact mark-stack position
and applies the same URL safety policy on re-import.
The GFM strikethrough baseline accepts matching runs of one or two tildes,
rejects longer runs, never matches across a paragraph boundary, and treats
code, autolinks, inline HTML, and links as tighter-bound tokens. Lossless
semantic fallback preserves the exact mark stack when strike continues across
adjacent nodes with different inner marks.
Fail-closed aligned top-level spans ensure unchanged blocks and separators stay exact while
changed blocks are canonical. Unique semantic matches now retain their source
through insertion, deletion, and movement with canonical separators. Preserved
immutable node identity now distinguishes equal original blocks without fuzzy
matching, while cloned references and reconstructed ambiguous equals remain
deliberately unmapped. The current Markdown baseline passed the
complete 514-test package gate and 295-pass
Chromium/Firefox/WebKit/mobile matrix in
[CI run `36fc481`](https://github.com/eddolo/fountainjs/actions/runs/33991664306),
and the corresponding
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33991664261)
succeeded. Deeper-structure source mapping and a larger standards corpus remain
before a source editor UI. See
[MARKDOWN_SOURCE.md](MARKDOWN_SOURCE.md).

## Prioritized after release foundations

| Priority | Outcome | Current baseline | Required proof before “Delivered” |
| --- | --- | --- | --- |
| 1 | First-class interactive widgets | Delivered and certified in `cced9e2` | Continue browser, accessibility, format, and extension-composition regression coverage as products adopt the contract. |
| 2 | Granular collaborative structured attributes | Delivered and certified in `0a33c87` | Continue adversarial mixed-version, nested-array, collaboration, and storage regression coverage. |
| 3 | Truly server-native document conversion | Delivered and certified in `ebc3194` | Continue malformed-input, custom-rule, runtime, package, CPU, and memory regression coverage; the delivered no-DOM core gate now prevents browser dependencies from returning through the engine entry. |
| 4 | Virtualized or paged rendering for huge documents | Delivered and certified in `8a6264e` | Continue physical-device, assistive-technology, late-loading NodeView, one-enormous-block, and multi-hour soak evidence. |
| 5 | Enforced platform-neutral core boundary | Delivered and certified in `2c7ff4c` | Keep source/declaration/package/runtime gates permanent and continue separating mixed optional modules only when a real headless/native consumer needs them. |
| 6 | Native renderer feasibility | Architecture design complete; the no-DOM engine boundary is delivered; DOM, Web Component, and React remain web surfaces | Review the concrete coordinate/input/IME/accessibility/lifecycle bridge contract, then deliberately schedule a bounded React Native prototype before promising native packages. A WebView does not count as native. |
| 7 | Higher-fidelity Markdown source preservation | Whole-source, inert frontmatter, aligned spans, identity-first plus unique structural mapping, collision-safe code spans, strict HTML5 references/ASCII escapes, safer relative/balanced links, bounded multiline labels/container definitions, nested/malformed-inline precedence, opaque-token scanning, raw-source normalization, full Unicode 17 label case folding, ATX closer/whitespace and multiline Setext handling, plain image-description projection, inline-node marks, nested emphasis with closing-flanking enforcement, rule-of-three arithmetic, complete bullet/ordered marker styles and interruption rules, ASCII-only list separation, spaced thematic breaks, and unmatched delimiters are certified; block source survives insertion/deletion/movement with canonical separators and no duplicate guessing | Expand the CommonMark/GFM corpus and add deeper-structure mapping before considering raw/visual UI. Exact source preservation and semantic preservation must remain separate promises. |

Pagination and footnotes should be designed together because page geometry,
continuation, numbering, print output, and table splitting interact. Stable node
IDs should precede widgets and deeper review/database integrations because it
provides a durable external-reference primitive.

## Secondary research queue

These are useful, narrower ideas. They should become ledger rows only after an
owner defines persistence, selection, accessibility, collaboration, format,
performance, and browser behavior:

- explicit Word, Google Docs, and Excel paste normalization (`DOC-19`), plus
  property-by-property fixtures for MathML/LaTeX, semantic ruby/footnotes,
  tracked changes, comments, and unknown application clipboard formats;
- a visible privacy-aware “Report a bug” route on the website and every demo,
  backed by the existing structured GitHub form; request Fountain version,
  framework/runtime, browser/OS, minimal reproduction, expected/actual behavior,
  and sanitized document JSON without asking users to publish private content;
- an explicitly unofficial GitLab-style issue-editor workflow demo, using no
  copied branding or implication of affiliation. The proof must exercise a
  rich/Markdown switch, exact untouched-source preservation after a visual
  edit, tasks, tables, code, links, host-owned uploads, and Fountain diagnostics
  for virtualization, headless runtimes, collaboration, and pagination. Link
  [GitLab's public architecture evidence](https://docs.gitlab.com/development/fe_guide/content_editor/)
  that its real rich editor uses Tiptap/ProseMirror, and present this as a
  recognizable replacement-workflow test rather than a visual clone;
- table captions and advanced image/text wrapping;
- cross-editor schema-aware drag and drop plus a general inline/block drop cursor;
- footnote/endnote interchange independent of paged rendering;
- configurable soft limits in addition to enforced hard character limits;
- iframe/isolated-surface editing and host focus coordination;
- vertical Japanese writing with logical selection/navigation evidence;
- spell-check, dictionaries, thesaurus, and replaceable language-service hooks;
- invisible-character integrity tools (`DOC-16`): non-mutating visualization of
  spaces/NBSP, tabs, hard breaks, paragraphs, CR/LF differences, zero-width and
  bidi controls, and BOM; raw code-point, UTF-8-byte, and Unicode-normalization
  inspection; an opt-in verbatim mode that disables typography, normalization,
  entity/Markdown interpretation, trimming, whitespace rewriting, and
  autolinking for integrity-sensitive content; plus a separate explicit
  sanitizer with preview/diff and per-category choices, never silent cleanup;
- YAML frontmatter and raw/visual Markdown switching.

## Broader editor landscape audit

After the active ProseMirror + Tiptap parity work, audit other editor families
for ideas FountainJS can improve or make framework-neutral. This is a research
queue, not a claim that the named projects expose identical capabilities:

- Lexical and Slate: state/update architecture, normalization, operation
  mapping, DOM reconciliation, and custom behavior ergonomics;
- Plate and Remirror: extension composition, typed authoring, supplied UI,
  framework integration, and what happens when their abstraction leaks;
- BlockNote and Editor.js: block-first workflows, structured output, slash and
  drag interactions, and the limits of mixing free-form rich text with blocks;
- CKEditor 5 and TinyMCE: mature authoring workflows, accessibility, import and
  export fidelity, plugin operations, long-term compatibility, and deployment;
- Eddyter and other finished-editor products: onboarding speed, default UI,
  customization boundaries, licensing, and which advertised capabilities have
  independently reproducible evidence.

Use the same evidence template for every audit: public API and license, supplied
features versus paid/hosted services, framework and server portability, input
and IME behavior, collaboration, document fidelity, performance, accessibility,
extension conflicts, documentation quality, and runnable tests. Promote an idea
to the capability ledger only when it has a FountainJS contract and proof plan.

## Sequencing rule

Finish and certify one ledger outcome before beginning another. Each outcome
must remain framework-neutral at its model/command boundary, ship through the
public MIT package, include a working packed-package example, pass applicable
unit/browser/accessibility/performance gates, document honest limitations, and
be compared against ProseMirror + Tiptap as a combined stack. Community size and
years of deployment are evidence gaps that features alone cannot erase.
