# Whole-document Markdown HTML conversion

## Current remaining CommonMark work (2026-10-08, Unreleased)

The version-12 neutral comparator distinguishes `<a>` (a non-hyperlink
placeholder) from `<a href="">` (a hyperlink). Three negative guards reject
conflating these, including empty anchors and an `id` attribute. This follows
[the HTML anchor contract](https://html.spec.whatwg.org/dev/text-level-semantics.html#the-a-element),
not a requirement to adopt another parser's AST. All six profile fixtures use
the same comparator version; their required example ranges are unchanged.

Current semantic results remain **563/652 default**, **579** opt-in HTML,
**580** source recovery, **601** containers, and **613** comments/anonymous
flow. Of the strongest profile's 39 differences, 17 have existing explicit
security, GFM-autolink or editable-caret-host contracts. The other 22 are:

| Examples | Evidence and remaining boundary |
| --- | --- |
| 163, 170–173, 176, 178, 201, 491, 524, 536, 617 | Existing explicit inert adapters preserve original element names, attributes and parsed body content as data. New official-corpus tests cover LF/CRLF, exact untouched Markdown, complete JSON reopening and canonical HTML/Markdown reopening. Original scripts/styles/controls and unknown-tag behavior are **not** rendered; these remain semantic mismatches. |
| 156–158 | Unfinished tags deliberately remain literal editable source with a fallback report rather than letting HTML recovery discard them. This retains source, not the reference renderer's empty fragment. |
| 181 | A doctype-only source retains its Markdown snapshot, but produces an editable empty paragraph. Doctype metadata/canonical export remain unresolved; this example has not been reclassified as an intentional caret-host divergence. |
| 150, 613–616 | Mixed unknown wrappers and non-hyperlink anchors/attributes remain unrepresented in the existing profiles. Link marks cannot represent every transparent HTML anchor. Source snapshots are not a substitute for these model/rendering semantics. |
| 631 | The current conservative URL policy rejects a leading backslash destination. Ordinary safe empty hyperlinks are represented; this case is not proof that all empty links disappear. It remains pending a reviewed policy contract rather than being automatically promoted or weakening the URL gate. |

`tests/commonmark-inert-preservation.test.ts` adds **24 Node-only contracts**
for the first group. The development-only reference parser must reproduce the
official HTML before the test compares shared opaque element meaning; neither
AST is equated with the other. Exported carriers must not install the original
tags or event-handler attributes on live HTML. The focused regression passes
**111 tests / five files**; the complete single-worker suite passes **2,855
tests / 214 files**, and framework type checks pass. No new parser,
runtime dependency, public API or automatic HTML opt-in is introduced.
Frozen local evidence: `artifacts/commonmark-inert-verification-20261008.json`.

Reproduce the strict corpus gate with `pnpm test:markdown-conformance`; inspect
the unresolved representations with `node scripts/check-markdown-conformance.mjs
--report --document-flow-report --example=150 --example=156 --example=157
--example=158 --example=181 --example=613 --example=614 --example=615
--example=616 --example=631`. These are diagnostics, not permission to promote
scores. Existing inert editing demos and recordings remain separate evidence;
this follow-up does not claim a new visual or physical-device audit.

## Explicit saved empty paragraphs (2026-10-06, Unreleased)

Canonical `<p data-fountain-empty="text|block"></p>` markers are now captured
as `kind: 'empty', explicit: true` in `MarkdownHTMLFlowBlockSource`. The supplied
server document adapter protects their exact source nodes through the existing
offset-bound block-slot mechanism, including when raw HTML scopes surround them.
Previously, an editor's trailing empty paragraph was classified as unsupported
and forced the whole HTML document back to literal source. Implicit list/quote
caret fillers remain non-explicit and keep their previous behavior.

This does not make all HTML native-shape-lossless: adjacent unmarked text leaves
may merge. The empty-paragraph follow-up preserves childless paragraphs through
canonical HTML using the existing `data-fountain-empty="block"` marker, but only
on elements with no child nodes. Ordinary empty paragraphs retain their caret
leaf; forged markers never hide source descendants. Native JSON remains the
exact backup for arbitrary text segmentation. Recorded block
editing checks the precise allowed difference and the demo reports it, rather
than weakening whole-document assertions or calling it exact preservation.
The optional unknown block adapter uses the same document boundary; see
[the contract and public workshop](HTML_INERT_SOURCE.md#registered-block-wrappers).
Final evidence: `artifacts/html-inert-block-visual-verification-20261006.json`.
The childless-paragraph follow-up adds exact nested empty-shape and tampering
tests, removes the DOCX-to-HTML empty-leaf exception, and records actual pointer
typing/Enter/Backspace/undo/reopening in all three desktop engines. Final evidence:
`artifacts/html-empty-paragraph-visual-verification-20261006.json`. Scores remain
unchanged; filled-state screenshots are not blank-line print-layout certification.

## Link destination integrity and oracle correction

Unreleased checkpoint, 2026-10-06. The version-11 comparator does not alias
raw TAB/LF/CR/backslash HTML attribute bytes to percent-encoded URL data.
Browsers can strip controls or treat a path backslash as a separator; preserving
the bytes is not proof of identical navigation. Four corrupt aliases, three
TAB/LF/CR preprocessing equivalents and two Unicode/space equivalents are
independently checked. Raw controls are compared after browser preprocessing,
not as their percent-encoded forms; raw backslashes stay distinct from `%5C`.

The default remains **563/652**. Reviewed opt-in profiles now require **579**
(identity-preserving HTML), **580** (source recovery), **601** (containers), and
**613** (comments/anonymous flow). These supersede the preceding version-10
578/579/598/610 checkpoint and earlier claims below. No parity row or completion
percentage is promoted. There are still 39 differences in the strongest profile;
this is neither complete CommonMark support nor original page-layout fidelity.

Markdown examples **20, 202, 502 and 603** exposed a genuine HTML-rendering bug:
the model retained a backslash, but its DOM href let browsers reinterpret it.
Link rendering now encodes literal backslashes as `%5C`, preserving the exact
native spelling in a bounded `data-fountain-link-href` carrier. Browser/server
import restores that carrier only when it is safe and exactly bound to the
visible href. Invalid/mismatched carriers are ignored and reported by the server.
Markdown destinations containing backslashes also use escaped angle syntax,
preventing Markdown reopening from eating the slash before punctuation.
HTTP authority backslashes are not encoded into hostname/user-info data; that
would risk changing the host. This is not a universal URL canonicalizer.

Example **21** is repaired. Imported HTML links use optional `link.attrs.htmlHref`
only where browser navigation differs from the typed destination. This bounded,
inert source spelling must pass the import URL gate and reproduce the stored
`href`; otherwise it cannot override rendering. HTML navigation strips source
TAB/LF/CR but keeps HTML path backslashes for the browser to interpret. Ordinary
and Markdown-authored links have no added attribute and retain literal `%5C`
rendering. Manual link editing clears the HTML origin; stale metadata cannot
override a newly changed URL. No schema/transaction engine rewrite is needed.

HTML controls in otherwise supported destinations are validated against their
browser-compacted spelling, then retained as percent-encoded typed data plus
bounded source intent when the schema supports `htmlHref`. Unsafe schemes,
network paths, ambiguous authorities, unsupported controls and over-limit
destinations remain unlinked. `normalized-link-url` explains the projection
without echoing private URLs; a custom link schema without `htmlHref` receives
an explicit behavior-loss diagnostic. Examples **642/643** now match in the
whole-document profiles because navigation intent—not only data—is retained.
Original Markdown source snapshots remain a separate exact contract.

Canonical Markdown emits a safe HTML carrier for HTML-origin links and reports
its requirement for matching HTML-enabled import rules. A default inert reader
does not reinterpret it. Browser/server import binds `data-fountain-html-href`
to the visible navigation href; forged, oversized or conflicting literal/HTML
carriers cannot change it. CR/LF/TAB are encoded as numeric entities in the
carrier so HTML reopening cannot normalize the retained source spelling. The
generated ruby/text-style subset applies the same validation.

Rejecting unsupported HTML structure can leave adjacent plain-text runs that
canonical Markdown merges. The public demo retains its native-shape mismatch
warning and tests the exact complete expected difference; it does not claim
lossless native JSON round trips for that boundary. HTML/JSON backup retention
and supported literal-link round trips are checked separately.

See [inert-source workshop](HTML_INERT_SOURCE.md#link-inspection-workshop),
[server import diagnostics](SERVER_HTML.md#link-destination-policy) and
[measured cost](PERFORMANCE.md#link-destination-integrity-cost).

Current frozen-source gate: `artifacts/html-link-origin-complete-gate-final-20261006.log`
passes **2,585 tests / 194 files**, 409 declarations, packed ESM/CJS, actual Node
and workerd (**486 link contracts each**), headless/framework consumers and
existing performance/memory/entry/CSS limits. Frozen manifest:
`artifacts/html-link-origin-production-source-final-20261006.json` (682 files).
No callable public API, runtime dependency or default Markdown HTML opt-in is
added. The optional source attribute is an additive native-model contract.

Final unchanged-source recording:
`artifacts/html-link-origin-recorded-regressions-final-20261006.log` passes
**42 workflows** (14 per desktop engine), serially with no retries and retained
videos/traces. It checks actual anchor URL properties, real pointer/keyboard
selection and typing, full undo/redo, complete native JSON and Markdown/HTML/JSON
reopening. All **36 fresh link captures** are directly visually inspected.
The 18 raw-source captures are checked separately: eight byte-identical to
previously inspected evidence, ten changed images directly inspected. Scope,
hashes, retained incomplete runs and limitations:
`artifacts/html-link-origin-visual-verification-20261006.json`. Neither remote
URL availability nor physical-device/IME/clipboard certification is implied.

Historical version-10 frozen-source complete gate (not proof of newer source):
`artifacts/html-link-literal-complete-gate-final-20261006.log` passes **2,569 tests /
193 files**, 409 public declarations, packed ESM/CJS, compiled Node and real
workerd. Each actual runtime checks **473** link normalization/security/history/
destination contracts, including generated punctuation and full native HTML
carrier reopening. Existing framework, latency, scaling, heap and entry/CSS
limits pass. Source manifest:
`artifacts/html-link-literal-production-source-final-20261006.json` (681 files).
The failed oracle/budget/browser reports remain available; no release is implied.

Historical version-10 frozen-source serial recording:
`artifacts/html-link-literal-recorded-regressions-final-20261006.log` passes
**42 workflows** (14 × Chromium/Firefox/WebKit), with videos/traces and no retries.
It covers the new link samples, raw/incomplete/registered HTML source, mixed-format
links, code input, visible empty lines, backward native/keyboard/pointer selection,
adjacent atom deletion, quote exit and both history shortcuts. It does not replace
physical-device/IME certification or exhaustive editor testing.

The 24 link screenshots were visually verified at desktop/390px: 16 final
captures match already inspected screenshots byte-for-byte, and all eight
changed captures were inspected directly. All 18 raw-source captures were also
checked against prior inspected evidence; 13 are identical, and the five changed
captures were inspected. Full hashes, observations and retained failures:
`artifacts/html-link-literal-visual-verification-20261006.json`.

Experimental, Unreleased source work, 2026-09-08. This is an optional import
policy, not a new document engine, a different AST, or full CommonMark mode.

## Opt-in inert raw-text capture (2026-10-06, Unreleased)

Explicit `createInertHTMLRawTextExtension` registration captures script/style/
textarea bodies as editable literal code, with bounded tag/attribute/token
data and safe span/code export carriers. It does not execute HTML, apply CSS,
create controls or reinterpret body Markdown. Unchanged Markdown source is
retained separately; imported text follows HTML newline/entity rules. Missing
registration and unsupported/protected scopes still refuse projection.
The Node/Markdown workshop exercises empty-source typing, real line breaks,
history, source inspection and all three reopening formats against a safe
reader. See [the complete contract](HTML_INERT_SOURCE.md#explicit-raw-text-source-capture).

This does not change the existing semantic profiles: 563/652 default, 611/652
strongest current opt-in. Those profiles do not install this separate source
adapter, and safe literal preservation is not original raw-HTML behavior.

## Unfinished-tag retention guard (2026-10-06, Unreleased)

CommonMark examples 156–158 expose a retention failure distinct from syntax
conformance: HTML recovery can consume an unfinished opening tag, including
the following source lines, and produce no content. A saved original-source
snapshot alone does not make that empty editable document acceptable.

`ServerHTMLImporter.parseFlow` and the whole-document text-block projection
now refuse conversion when the HTML tokenizer reports `eof-in-tag`. The
Markdown importer retains its existing inert literal-source projection and
emits `onHTMLFlowFallback` with a fixed, source-free message. This protection
does not depend on remaining diagnostic slots. It does **not** reject every
HTML repair: complete opening tags without closing tags remain accepted.

Direct HTML `parseWithReport` intentionally retains HTML parser semantics;
an unfinished tag can still be omitted there, with an `html-parse-error`
diagnostic. This is not a universal original-file retention guarantee.
The public `demos/node-markdown.html#inert-source` workshop now exposes an
unfinished-source sample and the actual parser/schema/fallback diagnostics,
including the different direct-HTML result. Never insert raw input as a live
preview merely to make it appear faithful.

`tests/markdown-html-incomplete-source.test.ts` covers both Markdown flow
profiles, LF/CRLF, complete native JSON, exact untouched source, canonical
reopening, real model editing and undo/redo, exhausted diagnostics, complete
unclosed elements, and the direct-HTML distinction. Packed ESM/CommonJS,
pure Node and workerd consumers exercise the same guard through
`scripts/fixtures/html-inert-source-check.mjs`.

This is a reliability improvement, **not** a semantic conformance promotion:
default CommonMark remains 563/652; the strongest existing opt-in profile
remains 611/652. Malformed HTML reproduction and declaration/raw-text/unknown
tag semantics still require separate, safe representations.

Evidence: `artifacts/markdown-incomplete-source-before-20261006.log` reproduces
13 failures; the final focused checks pass 83 tests across four files in
`artifacts/markdown-incomplete-source-checked-20261006.log`. The first post-fix
log also retains a corrected test-constructor/API mistake, not a production
regression. The full gate passes 2,524 tests / 190 files in
`artifacts/markdown-incomplete-complete-gate-final-20261006.log`.
Six fresh, no-retry recorded workflows pass in
`artifacts/markdown-incomplete-recorded-checked-20261006.log`; all 15 new
unfinished-source captures are inspected. The original three-engine failures
in `artifacts/markdown-incomplete-recorded-20261006.log` are a test click on
the second line followed by line-local Home. The corrected journey clicks
the intended first line; no engine workaround or synthetic caret is used.
Only that browser-test correction follows the full gate. Runtime/fixture
source is unchanged; the fresh type check is
`artifacts/markdown-incomplete-post-pointer-types-20261006.log` and the final
673-file snapshot is
`artifacts/markdown-incomplete-production-source-checked-20261006.json`.

## Why a document boundary is needed

Converting each paragraph separately closes its HTML scope at the paragraph
boundary. For example, a raw opening `<a>` or `<b>` in one paragraph can affect
later paragraphs in the HTML that a CommonMark renderer produces. An inline
adapter alone cannot represent that document-wide behavior.

`parseHTMLDocument` lets one root adapter see the complete supported syntax
stream before any local HTML conversion. It reuses the existing protected-node,
source-projection and safe server-import infrastructure. Fountain's native
schema remains unchanged; no CommonMark AST is used as its storage format.

```ts
import { MarkdownImporter, MarkdownExporter } from 'fountainjs-editor/core';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';

const imported = MarkdownImporter.parseWithSource(markdown, editor.state.schema, {
  parseHTMLDocument(segments, schema, context) {
    const result = new ServerHTMLImporter()
      .parseTextBlockFlowWithReport(segments, schema, context);
    showConversionDetails(result.issues);
    return result.nodes;
  },
  onHTMLFlowFallback: issue => showFallback(issue),
});
const saved = MarkdownExporter.exportWithSource(imported.document, imported.source);
```

For callers not needing conversion details, the callback can be
`parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow`.
`HTMLContainerExtension` is still separately required to retain supported
section wrappers and attributes. It is not automatically installed by this API.

## Contract and precedence

- All HTML options remain off by default.
- `parseHTMLDocument` takes precedence over `parseHTMLFlow`, `parseHTMLBlock`,
  `parseHTMLParagraph` and `parseHTMLInline`. Those callbacks do not run first.
- Nested lists and quotes capture their pristine syntax. Only the root invokes
  the document adapter; no child conversion is committed separately.
- The callback receives frozen flow segments and lazy recursive source context.
  It runs when supported source blocks contain actual HTML tokens. HTML-looking
  code literals and ordinary Markdown do not activate it.
- Source support covers the existing paragraph/heading/code/list/quote/task
  stream, syntax-derived standalone Markdown images/dividers and pristine
  pipe tables (see the protected-block contracts below). It does not guess syntax from finished nodes.
  Unsupported blocks remain explicit. HTML tokens only inside protected pipe-
  table cells stay literal under the existing cell dialect and do not
  independently activate the callback. This is not a universal rendering stream.
- Return same-schema block nodes, an empty array, or `null`. Invalid results,
  exceptions and refusals retain the entire inert document, not a mixture of
  converted children and unconverted parents. `onHTMLFlowFallback` reports the
  refusal. Exceptions from that reporting callback propagate to the host.
- The supplied server adapter checks protected inline nodes, source provenance,
  tasks, metadata and limits. It refuses unsupported structural projections and
  active raw-text contexts such as script/style/iframe instead of executing them.
  Other unsupported HTML may be projected with explicit loss reports. A custom
  adapter still owns its own conversion and sanitization policy.

## Source retention is not layout fidelity

`parseWithSource` still preserves the exact original JavaScript string while the
complete document is unchanged, including LF/CRLF and frontmatter. When the
document adapter actually runs, an edit uses canonical Markdown (with frontmatter
where applicable), not independently reused source blocks: an HTML scope may
originate in a different paragraph, so splicing the old source blocks could
corrupt it. This remains true when that adapter declines or throws.

Simply enabling the option does not disable block retention. Ordinary Markdown,
including HTML-looking code literals, still uses the existing conservative
independent-source checks. Changing one paragraph can retain the original heading
underline, emphasis spelling, code fence and line endings elsewhere. Local HTML
callbacks remain suppressed during this capture, consistent with precedence.
Undo restores exact source reuse when the original document is restored.
Use the editor's schema for parsing; snapshots
are attached to their original model/schema, not arbitrary reconstructed types.

HTML reconstruction can create whitespace-only formatted content between or
after paragraphs. Fountain currently represents such content as a paragraph to
keep the marks and link data. The server reports `formatted-whitespace-block`.
**Without the optional `HTMLFlowExtension` below, that paragraph can add
editable/reader spacing that the reference HTML does not have.** The original audit explicitly compares
two reference paragraphs against three Fountain paragraphs for a cross-paragraph
link. It does not hide the extra node or call the layouts identical.

Other remaining limitations include comments without explicit opt-in (see below), arbitrary/unknown HTML identities
and attributes, active HTML behavior, unsupported specialized/custom blocks in source
projection, and the documented URL, empty-caret and literal-autolink policies.
The existing identity-preserving flow API remains available when changing block
identity/grouping is unacceptable.

## Evidence and public example

In the [conversion demo](https://eddolo.github.io/fountainjs/demos/node-markdown.html),
choose **Convert HTML across the complete document**. The four local HTML options
are disabled while it is selected, and their saved settings return when it is
turned off. JSON/HTML output and actual conversion warnings remain inspectable.

The separate baseline `tests/fixtures/markdown/commonmark-document-flow-v1.json`
requires **599/652** reference-semantic matches with this callback and optional
container schema, for both LF and CRLF. All 652 cases also undergo independent
exact-source checks, totaling 1,304. The unchanged neutral comparator compares
HTML meaning, not native AST equality, and its existing corruption sensitivity
and runtime-dependency checks remain active. Reference HTML is never executed to
improve a score. This combined profile does not replace the default 563/652,
identity-preserving 579/652, or older source-recovery 580/652 baselines.

`tests/markdown-document-flow.test.ts` covers cross-paragraph links, nested
structure, adapter precedence, code literals, edit/undo/source reuse, invalid
results, full fallback, metadata rejection and explicit layout reporting.
The compiled Node/workerd fixture also exercises a link across paragraphs.

`tests/browser/markdown-document-journey.ts` exercises the public option,
disabled local controls and safe fallback, then edits a real editor, saves
canonical Markdown and undoes back to exact source. Static sandboxed reader
frames compare Fountain output to HTML generated by the development-only
CommonMark reference parser. The manual counterpart records the journey.
The journey also edits ordinary Markdown with the document option enabled,
checks the complete saved string and untouched block syntax, then undoes back
to the original source. The reference-semantic scores do not change for this
source-retention correction.

## Optional anonymous inline flow (2026-10-05, unreleased)

Add `HTMLFlowExtension` explicitly alongside any container/comment extensions.
Anonymous inline content outside authored paragraphs is represented by the
`html_flow` block-group node with inline children. It does not invent a `<p>`.
The editable view uses an inline carrier with normal HTML whitespace, overriding
the editor's usual pre-wrap text policy. Authored `<p>` elements, including empty
paragraphs, remain paragraphs. This is not a new default schema/caret policy.

Native HTML exports the children rather than author controls. Pretty-printing
separators are not added beside a flow or to the beginning/end of the standalone
HTML body when that would become new editable content on reopening. Canonical
Markdown uses a `div[data-fountain-html-flow="true"]` carrier; reimport requires
the same optional schema and explicit HTML conversion. A cleared, single,
unmarked text leaf uses the additional inert `data-fountain-empty-text="true"`
attribute. Browser/server import restores that caret leaf only within the
configured flow carrier. A genuinely childless carrier stays childless; existing
pointer/node-selection typing fills it without changing its type. Marked empty
leaves retain their native mark envelopes. Other carrier attributes, invalid
marker values and active markup are rejected by the rule; unsupported wrappers
still report their projection. The marker does not normalize ordinary paragraphs.
Fountain JSON, not ordinary HTML, remains the exact arbitrary-tree format:
adjacent text/flow grouping and empty-node representations are not universal
HTML model-identity guarantees.

Text remains editable rather than being discarded or locked in opaque source.
Enter in a flow creates a real paragraph; Backspace/Delete joins and inline
HTML paste use the existing transaction/history path. The public Node Markdown
page exposes a default-off schema checkbox and a separate actual editor/reader
workshop. "Edit between paragraphs" targets the preserved whitespace for typing.
The sample picker also offers unmarked and childless inline content, with
"Edit inline content" and "Reopen saved Markdown" actions. Clearing text,
reopening, continued typing and undo/redo are distinct acceptance checks. Native
HTML may omit a completely empty flow: that is a zero-content reader projection,
not a save/reopen backup for its model shape. Use canonical same-schema Markdown
for these supported flow cases or Fountain JSON for arbitrary model retention.
Other formats are not silently promoted: Word reports readable block fallback,
and paged/custom layouts remain separate acceptance work.

The original two-paragraph cross-scope link now retains its intermediate linked
newline without adding a third paragraph in either editor or native reader.
The recorded journey compares strict reference paragraph geometry at desktop
and narrow widths, types into the flow, creates/deletes a visible Enter break,
saves canonical output and undoes to exact original source in Chromium, Firefox
and WebKit. Dedicated visible-body captures, not off-screen iframe regions, are
used for visual inspection. This is evidence for this bounded layout case, not
universal CSS, print, browser-input or document fidelity.

The separate `commonmark-anonymous-flow-v1.json` profile still matches 611/652
with comments/containers/flow on both LF/CRLF, plus 1,304 exact-source checks.
The comparator, defaults and safety divergences are unchanged. Node and real
workerd also check the complete supported native/canonical model reopens.

The independent `node scripts/check-browser-clipboard-capability.mjs` diagnostic
separates native textarea clipboard transfer from `copy` handlers using
`clipboardData.setData()`/`preventDefault()`. On this Windows Playwright build,
Chromium and Firefox transfer both, while WebKit transfers native default copies
but returns empty event-authored payloads even for plain text alone. This is
reproduced without Fountain. The real-clipboard flow test excludes that specific
Windows/WebKit combination, not the clear/cut/save/reopen editing journey.
Synthetic payload tests and a green editor journey do not certify real Safari
clipboard integration; that production check remains open.

## Optional inert HTML comments (2026-10-05, unreleased)

Add `HTMLCommentExtension` to the schema **and** explicitly enable an HTML
conversion adapter. Ordinary Markdown stays inert, and StarterKit's schema is
unchanged. The `html_comment` inline atom stores validated `data`; it is not an
application review thread or an executable widget. Browser and server HTML
import preserve supported comments with the same schema. Editor badges expose
their source through the title/accessibility label, while `HTMLExporter` emits
native comments rather than the author controls. Plain-text output omits them.

Canonical Markdown exports paragraphs/headings containing comments as HTML so
a leading comment cannot accidentally swallow neighboring Markdown formatting.
Reopening that canonical form requires the same explicitly enabled HTML adapter
and comment schema. Exact untouched Markdown and edit/undo source reuse remain
separate guarantees. Custom HTML serializers and unsupported projections are not
certified lossless by this envelope. Comment data that cannot be serialized as
one inert HTML comment is rejected; it must remain in the original source rather
than be emitted as potentially active markup. Limits include 65,536 characters,
comment breakout/nesting tokens, NUL and CR. HTML parsing normalizes original
source according to HTML rules; the exact original Markdown is retained separately.

`discarded-html-comment` now reports only comments absent from the final result,
with source location. Provenance distinguishes duplicate data and comments lost
inside specialized projections such as `<pre>`; registering the extension does
not suppress those losses. Comments in omitted document-head content are also
reported. The pre-existing broad projection warnings still apply.

The separate `commonmark-comment-flow-v1.json` profile verifies **611/652** neutral
reference-semantic matches on both LF and CRLF, plus 1,304 independent untouched
source checks. Twelve additions over the unchanged 599 container-only profile
are examples 177, 179, 180, 182, 183, 308, 309 and 625–629. No native AST equality,
comparator normalization, active HTML execution or default-policy change was
introduced. These scores do not certify pixel layout; the separate flow opt-in
addresses the linked-whitespace example, while wider layout, unsafe/unknown HTML
and deliberate URL/caret policies remain open.

The Node Markdown demo exposes **Preserve inert HTML comments**, plus a separate
authoring workshop for editing/removing comment data, undo, canonical Markdown
and sandboxed reader preview. Hidden is **not** private: comments remain available
in exported source. Remove sensitive comment data before sharing a document.

Unit regressions cover duplicate provenance, inherited marks, default omission,
safe output, hostile data, canonical reopen and exact-source undo. A compiled
contract runs in Node and real workerd without a fake DOM. Reference parsers remain
development-only; Fountain continues to own its model and parser.

Verification on 2026-09-08: the complete check passed 1,730 tests across 133
files, plus compiled-runtime, API, package, reference and build-budget checks.
Nine focused browser checks passed across Chromium, Firefox and WebKit. The
recorded Chromium journey and its editor/source/reader screenshots were reviewed
visually. The sample's readers have similar visible spacing with the supplied
plain CSS; its extra whitespace paragraph is more apparent in the editable view.
This is evidence for the stated behavior, not certification of identical layout.

The previous online browser run also exposed an ambiguous glossary-export status
selector after the section workshop added a second status region. That assertion
now targets the export status. The conversation journey waits for the second
reply to finish before clearing history. These six checks passed across the three
desktop engines; the full remote suite remains a separate publication gate.

Source-retention follow-up (same date): the complete check passed 1,735 tests
across 133 files, including new LF/CRLF edit/undo, reference-block movement and
declined/throwing document-adapter tests. The expanded journey passed in all
three desktop engines and as a recorded Chromium run. Its editor, saved-source
and reader screenshots were visually reviewed. No reference baseline changed.

## Protected Markdown block atoms 2026 10 05

Unreleased: the source route now includes syntax-derived thematic breaks and
standalone Markdown images. Previously, one `---` or standalone `![…](…)` caused
an otherwise supported section/list/quote conversion to refuse the whole document.
The parser records `thematicBreak` and `image` source kinds in `readBlockSources`,
including the resolved image source, plain description and title. The text-only
inspection methods retain their existing scope.

The server emits temporary void tags solely to resolve HTML structure. Their
source offsets point to the **original Fountain nodes**; image attributes and
assets do not round-trip through those tags. Recovery verifies complete schema
defaults, pristine source equality, and exactly-once, in-order atom visits.
Speculative schema branches commit visits only when accepted. Authored raw HTML
tags cannot impersonate generated atoms by spelling, attributes or element order.
Nested Markdown lists/quotes retain the same protection. No CommonMark AST,
reference parser, new engine or runtime dependency is introduced.

Refusal remains deliberate when recovery would flatten an atom inside `pre`,
erase/reorder it, accept changed source metadata, or discard a link/formatting
scope that the promoted block-image representation cannot express. Active HTML
contexts remain refused. At this checkpoint pipe-table/specialized block source still
refuses the complete speculative conversion; exact untouched Markdown survives.
The table follow-up below supersedes that pipe-table limitation.
This is not a declaration that arbitrary HTML and all block kinds are supported.

The public Node Markdown demo's **Anonymous flow sample** selector includes
**Images and dividers inside a section**. Edit the paragraphs, use normal
Enter/Backspace and Undo/Redo, save, reopen and continue typing. Reader previews
remain scriptless and sandboxed; only local/demo and data images are allowed.
They show the real reader output, not an invented original-document renderer.
The image remains centered in Fountain's native figure and left-aligned in the
static CommonMark reference; editor controls/spacing also differ. These are
explicit layout differences, not a pixel-fidelity pass.

The first recorded run exposed a separate real UI bug: broad `textarea` and
`role=status` selectors wrote saved Markdown into the image-caption field and
image status instead of the workshop's own controls. Save/Reopen now uses owned
data attributes and reader titles. Workshop textarea styling is also restricted
to the saved-source field. The recording asserts that Save leaves the image
caption empty, and the example no longer offers an inapplicable flow-focus button
for this sample.

Evidence and remaining limits:

- `tests/markdown-html-block-atoms.test.ts`: 15 pure-Node cases; six supported
  workflows failed before implementation. LF/CRLF exact source, complete
  canonical/native HTML reopening, actual editing/history and atom identities,
  list/quote nesting, raw-tag separation, host defaults/parse rules, modified
  source, inert policy, unsupported tables and raw-text/link refusals are covered.
- The unchanged neutral reference comparator verifies six new LF/CRLF full
  semantic/source contracts, increasing that generated structural fixture suite
  from 38 to 44. Official profile counts remain **563 default / 611 opt-in** out
  of 652; no AST equality, baseline reclassification or comparator change.
- `scripts/fixtures/markdown-block-atoms-check.mjs` runs against each actual
  compiled ESM/CommonJS package consumer and real workerd, covering source,
  complete model reopening and refusal guards without a fake DOM.
- The complete local `pnpm check` passes **2,298 tests / 173 files**, 407 public
  declarations and 88 headless modules. Package, Node/workerd, independent DOCX,
  CommonMark, math, framework, type, build and performance gates pass. Measured
  server/local/remote growth is **8.38x / 6.60x / 10.69x** against unchanged 15x
  limits. These local results do not replace the full remote release matrix.
- Initial aggregate size checks failed by 1.4 KiB ESM / 0.9 KiB CommonJS. This
  source/guard feature adds about 2.1 / 1.7 KiB; measured totals are 1553.9 /
  1291.9 KiB. Narrow aggregate ceilings are now 1554.5 / 1292.5 KiB. All entry,
  CSS and performance ceilings remain unchanged; no dependency was added.

The original Save failure recordings remain at
`artifacts/markdown-block-atoms-20261005`. Later capture diagnostics remain in
the `-fixed`, `-final`, `-reviewed` and `-viewport` directories. Chromium's
sandboxed-body screenshot stability wait was a capture failure; iframe-element
and clipped captures also produced inconsistent/cropped regions. Those images
are not substitutes for visible reader evidence. The final audit records the
uncropped actual page viewport after checking both surrounding paragraphs are
visible, at `artifacts/markdown-block-atoms-screen-20261005`.
All three recorded block-atom journeys pass; all 18 final editor/edit/reopen/
narrow-reader/reference images were visually inspected. The earlier paired
anonymous-flow/block-atom regression batch also passed all six journeys across
Chromium, Firefox and WebKit. Real pointer placement, typing, Enter/Backspace,
Undo/Redo, Save/Reopen and continued typing are covered. The 390 px viewport
proves responsive fit only, not physical-phone IME or virtual-keyboard behavior.
Native image centering versus reference left alignment and author-only caption
controls remain explicit presentation differences, not pixel-fidelity passes.
Full CommonMark, general raw-HTML identity/layout and wider source-block support
remain unfinished. No delivered roadmap row, percentage or release is promoted.

## Protected Markdown tables 2026 10 05

The optional document/source-flow adapter now accepts pristine pipe tables in
supported HTML sections, lists, quotes and tasks. This is Fountain's existing
pipe-table dialect, not an addition to CommonMark or a new table engine.

The parser captures actual header/body cell source and alignment. Lazy cell
inspection uses the same document reference definitions and produces fresh
syntax segments without invoking host HTML callbacks. The server checks complete
row/cell/paragraph defaults and content against that pristine projection, then
binds an empty structural `table` tag's source offset to the **original table
subtree**. HTML parsing never round-trips the cell contents, inline objects,
metadata or assets. Offset-bound visits must be exactly once and in order; raw
authored tables cannot impersonate those generated slots. Custom HTML table
readers cannot replace protected tables. Supported outer HTML formatting can
apply to cell text without erasing existing marks. Changed source/geometry,
unvisited slots, raw-text/active contexts and inline flattening still refuse the
whole speculative conversion and retain the inert original source.

The public Node Markdown workshop adds **Editable Markdown tables inside a
section**, with ordinary clickable cells, Tab navigation, Save/Reopen and safe
reader output. Its fixed table reference is labelled separately from CommonMark.
It is not a source-application renderer or a pixel-equivalence claim: native
reader paragraph margins make rows taller than the compact static reference,
and author table/code styling differs. Narrow wrapping is not physical-mobile
input certification.

Evidence: `tests/markdown-protected-table-flow.test.ts` has 17 no-DOM cases. Eight supported
workflows failed before implementation; LF/CRLF exact source, complete native
HTML/canonical reopening, editing/history, table identity, reference links,
alignment, nesting, short/empty cells, escaped pipes, literal inline HTML,
inline images, schema defaults and refusal guards are covered. The old mixed-
table refusal regression now asserts complete table conversion and outer marks;
it is not removed. Compiled ESM/CommonJS consumers, Node and real workerd run the
table contracts through `scripts/fixtures/markdown-block-atoms-check.mjs`.

A final test-file audit caught the new cases replacing the pre-existing
`tests/markdown-html-tables.test.ts`. Its nine historical rich-cell, merged-table,
container, reference, inert-default, metadata-loss and safety cases are restored
unchanged; the 17 new cases live in their own file. All 62 focused cases pass.
The complete gate was rerun after restoring that coverage, not certified from
the earlier incomplete 2,306-test run.

The complete local `pnpm check` passes **2,315 tests / 174 files**, 407 declaration
files and 88 headless modules, with package, no-DOM runtime, CommonMark, math,
independent DOCX, framework, type, size and performance gates. Measured server/
local/remote growth is **8.80x / 9.27x / 10.82x** against unchanged 15x limits.
This feature adds about 1.5 KiB ESM / 1.2 KiB CommonJS. The initial aggregate
budget check failed by 0.9 / 0.6 KiB; narrow aggregate ceilings are now 1556 /
1293.5 KiB against measured 1555.4 / 1293.1. Individual entry, CSS and performance
limits stay unchanged; there is no new dependency.

Recorded real-use evidence: all six paired image/divider and table journeys
pass across Chromium, Firefox and WebKit in
`artifacts/markdown-table-flow-final-20261005` (54.9 seconds). All 21 table
original/editor/edit/reopen/narrow/reader/reference images from that batch were
inspected. Actual pointer placement, cell typing, Enter/Backspace, Tab, Undo/Redo,
reference links, bold/code marks, alignment, Save/Reopen and continued typing
are covered. Reader table rows remain visibly taller than the compact reference.

Capture failures and incomplete frames are not hidden: the first functional
three-engine run passed, but an edited-reader capture omitted the first
paragraph's paint. A subsequent wait inside a scriptless sandbox failed in
Chromium (garbage-collected promise) and WebKit (timeout). Paint waits now run in
the host page; reader scripts stay disabled. An additional three-engine audit
checks completed document loading and captures the first paragraph separately
before the whole viewport. All three pass in
`artifacts/markdown-table-flow-reader-20261005`; the six additional edited-reader
paragraph/viewport images were inspected and show the surrounding text and
edited table. The root cause of every earlier incomplete paint is not proven;
the original and `-reviewed` recordings remain diagnostic evidence, not visual
passes. These local runs do not replace the full remote release matrix.

Official reference profiles remain **563 default / 611 opt-in out of 652**.
The comparator, official fixtures and matching classifications are unchanged.
Full CommonMark, wider HTML identities/layout, physical-device input, format
fidelity and the remote release matrix remain open. No row, percentage or
release promotion is implied.

## Remaining official corpus boundaries 2026 10 06

Read-only inspection of the pinned official `commonmark-spec` examples and
`tests/fixtures/markdown/commonmark-anonymous-flow-v1.json` narrows the remaining
whole-document profile work. The newer URL correction above requires 610 matches
and leaves 42 unresolved cases, including raw HTML example 21.
Seventeen overlap the existing default profile's explicit URI-policy, GFM
autolink and editable-caret-host differences; they are not promoted to matches.
The other 25 examples fall into these concrete groups:

- Malformed or incomplete block opening tags: 156, 157, 158.
- Unknown block/wrapper content: 150, 163.
- Active or special raw-text HTML (`script`, `style`, `textarea`): 170, 171,
  172, 173, 176, 178.
- Declaration retention (`DOCTYPE`): 181.
- HTML tokens inside apparent reference/link syntax: 201, 491, 524, 536.
- Unknown inline tags and attributes, including a custom image element: 613,
  614, 615, 616, 617.
- Backslashes and physical newlines inside HTML link destinations: 21, 631, 642,
  643.

This is a fixture/syntax census, not a new passing run or proof that each group
has one implementation cause. In particular, raw HTML emission by the reference
renderer must not be interpreted as permission to execute scripts, install
custom elements or apply arbitrary document styles in Fountain. The default
72-pending classification and the opt-in unresolved classifications remain
unchanged. Semantic projection, security decisions, exact original source,
canonical reopening and visible fallback/loss reporting need separate evidence;
native AST equality and pixel equality are not the corpus contract.

After the recorded desktop failures are fixed, use these exact fixtures to
distinguish token/container bugs from intentionally unsupported rendering.
Preserve preceding/following supported Markdown even when one HTML segment
cannot be projected; any new opaque-source boundary must prove editing,
selection/history, native/canonical reopening and inert reader output before
it can replace the current fail-closed whole-document fallback. Do not label
all 24 cases solved merely because their original source can be saved, and do
not reclassify them to improve the published score.

### Unknown inline HTML after a visual edit (2026-10-06)

A current-package, pure-Node follow-up edits the first text leaf of official
examples 201, 491, 524 and 536, exports with the captured source, then undoes.
All four untouched sources and undo-restored sources are exact. Import reports
`unmapped-inline-element`, `inline-html-projection` and
`text-block-flow-projection`: the unknown element identities/attributes are
already absent from the native document. After the edit the exporter uses
canonical Markdown and cannot reconstruct those original tags/attributes.
Its export-loss array is empty because it reports the current native model,
not losses from the earlier import. Empty export losses therefore do **not**
mean lossless source-to-edited-file conversion. Keep import reports and source
provenance alongside the export report.

Evidence: `artifacts/markdown-unknown-inline-edit-20261006.mjs` and
`artifacts/markdown-unknown-inline-edit-final-20261006.log`. The initial
diagnostic used a nonexistent history factory and then passed an existing
schema-owned node to `createEditor`, which creates a new schema. Those retained
harness failures are corrected by the shipped `createHistoryPlugin` and
`EditorState.create` / `Editor` APIs; no production behavior changes. These
four fixtures remain unresolved, not newly passing CommonMark examples.

Next boundary work should distinguish an inert source-backed representation
from ordinary supported content, retain its original token/data through edits
and native/canonical reopening, and surface any transition from retained source
to a lossy projection. Do not emit arbitrary unknown tags into the live DOM:
custom-element upgrades, event attributes and styles must not become executable
merely to improve a reference score. Actual selection/editing/history, reader
fallback and source-loss reporting need independent tests before introducing
that boundary. This diagnosis does not prescribe another parser's AST or claim
that exact source retention equals equivalent rendering.

### Schema-owned Markdown HTML boundary (2026-10-06)

The bounded, artifact-only inline schema experiment retains parsed tag names
and attribute dictionaries as data, never creates the original element, and
leaves its children editable. Its initial HTML-carrier run passes 18 recorded
Chromium/Firefox/WebKit cases after correcting a test's caret targeting: `End`
moves to the whole visual line, not the end of a nested inline container.
The preceding 12-pass/six-failure run and initial configuration-cwd startup
failure remain separate evidence, not passes. All 18 corrected editor/reader
captures are inspected, including empty tokens 524/536. WebKit's surrounding
serif font differs from Chromium/Firefox; this private lab is not polished-site
visual certification. Evidence: `artifacts/opaque-inline-prototype-recorded-caret-20261006.log`
and its capture/video/trace directory.

The production change is deliberately smaller than a universal HTML importer:
`NodeSpec.markdown: 'html'` requests canonical export through the existing
sanitized `HTMLExporter`. Matching schema-owned parse rules and an explicit
HTML-enabled Markdown adapter are still required. Paragraphs/headings containing
an opted-in node use HTML as a whole, so neighboring Markdown marks do not become
literal delimiters. Physical CR/LF are encoded, not mistaken for HTML-block
termination. Each opted-in descendant gets a path-specific compatibility report.
No raw-string callback, unknown-tag execution or security-filter exception is
introduced; default custom-node flattening remains unchanged.

`tests/markdown-schema-html.test.ts` checks complete native JSON for empty/nested
inline containers, headings, quotes, lists, tables, inherited marks, literal
CR/LF, source/edit/undo/redo, block carriers and hostile DOM-output attributes.
The actual compiled pure-Node prototype now retains the complete edited model
through canonical Markdown for official examples 201, 491, 524 and 536, not just
through direct HTML. Original/undo-restored source remains exact. Evidence:
`artifacts/opaque-inline-markdown-retention-20261006.log`.

The prototype only recognizes three named tags. It is not installed in
StarterKit or a public demo and does not cover arbitrary unknown HTML, active
raw-text scopes, custom image rendering, lexical quote/case/attribute-order
retention after edits, or reference-rendering equivalence. The 563/652 default
and 611/652 strongest existing opt-in semantic baselines remain unchanged.
Preserved hostile attributes are inert JSON data in this experiment, not a
permission to apply them to live elements in host renderers.

The first integration exceeds aggregate ESM/CommonJS budgets by approximately
0.5/0.3 KiB. Sharing the existing container/table/flow projection paths and
hoisting the custom void-tag Set brings the build to 1,562.9/1,299.7 KiB under
the unchanged 1,563/1,300 limits. The first consolidation regression accidentally
adds duplicate nested-table diagnostics; the existing tests catch it, and the
fix preserves their original one-report-per-projection behavior. The corrected
focused five-file run passes 81 tests. No limit or fixture expectation is relaxed.

The serialized complete gate passes build, 407-file API, packed/runtime,
headless, CommonMark, math, DOCX and size checks, then stops at local median
scaling **16.85x / 15x** (10,000-block p50/p95 9.34/26.43 ms). Server HTML
10,000-block p50/p95 is 456.01/497.22 ms; server scaling/retained heap pass.
Keep `artifacts/markdown-schema-html-complete-gate-20261006.log` as a failed
gate; it never reaches its final unit stage. This is not retroactively cleared
by earlier gates or separate functional checks. Source freeze:
`artifacts/markdown-schema-html-source-20261006.json`, 663 files,
digest `1eeb41d4b6613545219d584a5aa517943c5a1f7c304ae48fd38e82aefa1b91ff`.
No release, roadmap-row or percentage promotion follows.

Separate final-source checks pass root/Svelte/Angular types and all **2,453
tests / 185 files**. The corrected private lab now clicks **Export Markdown
and reopen**, not a substitute direct-HTML export, and passes all **18 recorded
three-engine cases** with one worker and zero retries. All 18 new captures are
inspected: edited nested text, empty source badges, attribute dictionaries,
reader fallback and canonical output remain visible. The hostile sample records
zero custom-element upgrades, event execution and `invalid.test` requests in
each engine. These bounded checks do not certify every host renderer or erase
the failed performance gate. All 663 recorded production/test/config hashes
remain unchanged after the run. Evidence:
`artifacts/markdown-schema-html-typecheck-20261006.log`,
`artifacts/markdown-schema-html-unit-20261006.log`,
`artifacts/opaque-inline-markdown-recorded-20261006.log` and its recordings.

### Adapter diagnosis and literal-flow newline retention 2026 10 06

The read-only 24-case follow-up now records actual adapter warnings, fallback
decisions, native models, canonical exports and reopened models in
`artifacts/remaining-markdown-boundaries-20261006.json`. Exact original source
survives in all 24 cases; that does not prove reference-semantic equivalence.
Repeated imports in this diagnostic can repeat the same warning: warning-array
lengths are not counts of distinct losses.

The concrete boundaries are narrower than the syntax census:

- The six active/special raw-text examples decline whole-document conversion
  and retain inert source, rather than executing or projecting those elements.
- Malformed tags 156–158 report HTML parse recovery. Unknown wrapper/inline
  identities and attributes report unsupported projection; a childless custom
  image tag cannot gain a renderer merely by preserving the original source.
- Declaration 181 remains a projection boundary. Cases 631, 642 and 643 report
  rejected URLs; these are safety-policy decisions, not permission to weaken
  the URL filter for a better reference score.

Strict canonical model comparisons initially differ in four cases. Adjacent
equal-mark text leaves coalesce in 150, 201 and 491, with their complete
character streams and all other model data unchanged. Case 163 additionally
loses one real trailing newline: its `html_flow` carrier puts literal newlines
back into Markdown block syntax. This is a separate retention defect, not a
reason to promote its unsupported `Warning` wrapper to a CommonMark match.

`src/core/exporters/markdown-exporter.ts` now encodes literal CR/LF inside the
canonical flow carrier as character references, using the existing container
boundary policy. Native reader HTML, schemas, default inert conversion,
reference fixtures, URI rules and semantic comparator are unchanged. Five new
no-DOM regressions fail before the change; the focused four-file batch passes
74 tests after it. New browser/parser agreement cases cover unmarked and strong
text, LF, CR, CRLF and whitespace-only flow with complete single-leaf model
comparisons. The runtime fixture adds the same complete-model checks to packed
ESM/CommonJS and Node/workerd consumers.

All nine recorded three-engine browser journeys pass in
`artifacts/flow-canonical-newline-browser-fixed-20261006`: actual canonical
export/source re-import plus existing cut/save/reopen/continued-editing and
typing/Enter/deletion/reader workflows. All six new JSON/Markdown panel captures
have been inspected. They show the retained newlines, but tall Firefox and
WebKit element captures include sticky-header bands (WebKit overlaps the panel
title); these are retained capture-quality findings, not a polished visual
pass or proof of physical-device behavior.

The fixed diagnostic is retained separately as
`artifacts/remaining-markdown-boundaries-newline-fixed-20261006.json`. All 24
original-source checks still pass. Four strict native-model differences remain;
all four are now adjacent text coalescing only. This diagnostic classification
does not normalize any production assertion or change the semantic oracle.
The complete package gate passes 2,383 tests / 181 files plus packaging, no-DOM
runtime, independent reference, framework/type and unchanged resource checks
in `artifacts/scroll-flow-complete-gate-20261006.log`. The fresh broad browser
matrix is running; no completed broad pass is claimed.
Official scores stay **563 default / 611 opt-in out of 652**; none of the 24
unsupported reference-semantic cases is declared solved.

### Supported neighbors around unresolved HTML 2026 10 06

`artifacts/html-boundary-neighbors-20261006.mjs` runs the compiled package against
48 generated LF/CRLF probes: each of the 24 unresolved examples is surrounded
by a heading, marked/link-bearing prefix and a following Markdown section.
The source and complete native/reopened models are retained in
`artifacts/html-boundary-neighbors-20261006.json`. These are diagnostic inputs,
not new official reference matches or production regressions.

All 48 retain exact whole-source export and the complete supported prefix
before the HTML boundary, both at initial import and after canonical reopen.
Twelve strict native-model differences (six inputs with both line endings)
are adjacent equal-mark text coalescing only; their character streams and all
other model data match. This classification is diagnostic, not normalization
of the strict production comparator. The six active/raw-text inputs still
decline complete-document projection with explicit fallback messages.

The following section is deliberately observed without asserting that it
must render as an independent heading: an unclosed HTML scope can legitimately
consume that suffix. A heading that disappears inside malformed/raw HTML is
not automatically a lost Markdown heading. Independent reference semantics
are required before making that judgment. The evidence preserves supported
neighbors; it does not solve unknown tag identity, arbitrary attributes,
malformed-tag recovery, active reader behavior or the remaining CommonMark
programme. No schema, runtime, semantic fixture or advertised score changes.

### Generated delimiter neighbors 2026 10 06

The read-only `artifacts/markdown-inline-neighbors-20261006.mjs` diagnosis adds
3,337 deterministic paragraph probes around emphasis runs, Unicode/punctuation,
links, code spans, escaped markers and seeded combinations. It runs the compiled
package in pure Node, with the development-only CommonMark reference parser as
an independent semantic oracle. Its comparison keeps text, repeated emphasis
depth, code, link destinations/titles and image data; only equivalent inline
mark ordering and Fountain's default link target/security attributes are outside
this small comparison. Neither native AST is made the other's storage format.
These generated inputs do not change any official-corpus score.

The retained report `artifacts/markdown-inline-neighbors-20261006.json` records
**291 reference-semantic mismatches**, **zero exact-source failures** and **zero
canonical-semantic reopen failures**. Preserving source or reopening Fountain's
existing interpretation does not establish that the interpretation is correct.
Delta reduction of 60 selected failures yields 17 distinct small probes. For
example, `***a*` should retain two literal stars followed by italic `a`, but is
currently wholly literal. `____!__` should retain two underscores followed by
bold `!`; it instead produces three underscores, italic `!` and a trailing
underscore. This is a parser gap beyond the unresolved raw-HTML census above.

The owning implementation is
`src/core/importers/markdown-importer.ts`: `matchingEmphasisRun` searches forward
from an opener, and `inline` tries a small set of primary/alternate and surplus
prefix choices. An isolated artifact-only experiment adds both surplus choices
with a strong-before-emphasis preference. Its unmodified control reproduces all
291 mismatches. The candidate fixes 145, leaves 146 and **introduces one new
overlap mismatch** (147 total). It is **not accepted as a production fix**.
The experiment and separate control/candidate reports are retained under
`artifacts/markdown-partial-run-experiment-20261006.mjs` and
`artifacts/markdown-inline-neighbors-{control,candidate}-20261006.json`.
The local diagnostic compiler is esbuild 0.25.4; no dependency is added to the
package, and no source, distribution or frozen browser-test file is changed.

Next work must resolve remaining runs and nearest-opener/closer precedence
together, while keeping opaque tokens, links, caller schemas, source snapshots,
security and extension syntax at their existing boundaries. A patch that merely
raises the number of passing generated cases while moving formatting to the
wrong span is insufficient. Permanent minimal regressions, the independent
official oracle, exact/canonical retention, runtime/resource gates and actual
browser editing/reopen evidence are required before claiming this gap closed.

An optimized native-node stack prototype now lives only under
`artifacts/markdown-delimiter-stack-prototype-20261006.ts`. The existing inline
lexer still owns opaque code, HTML, links and extension tokens; the prototype
records delimiter runs while that lexer works, resolves closers against eligible
earlier openers, and applies the resulting marks to Fountain's immutable nodes.
It preserves repeated emphasis depth and forwards HTML/source metadata when a
node changes. Linked active delimiters, bounded failed-search categories and
start/end mark events avoid repeated whole-stream scans. No reference AST or
reference parser is used in the runtime prototype.

The optimized artifact has **zero reference mismatches, exact-source failures or
canonical-semantic failures in all 3,337 generated probes**. The unchanged
official comparator and adapter/retention/sensitivity harness also pass through
`artifacts/markdown-stack-corpus-experiment-20261006.mjs`; their scores remain
563 default / 611 strongest opt-in. A separate in-memory source transform passes
195 existing tests in `markdown-format`, `markdown-combination-retention`,
`markdown-document-flow` and `html-flow` (four files), recorded in
`artifacts/markdown-stack-focused-experiment-20261006.log`.
These are **prototype results, not a production implementation or release gate**.
Actual source installation, permanent new regressions, broader caller-schema
and extension compatibility, complete runtime/resource verification and real
browser editing remain required. The frozen desktop matrix still tests the
unchanged pre-prototype source, not this candidate.

### Native delimiter source integration 2026 10 06

After the earlier cold desktop matrix completes with 592 passes / 17 explicit
skips and unchanged source hashes, the native stack is installed in
`src/core/importers/markdown-importer.ts`. It replaces the recursive forward
opener search and small fallback-choice set, without new public APIs, schemas,
runtime dependencies or reference-parser code. The same lexer still owns code,
links, equations, HTML and extension tokens. No-delimiter input returns its
existing nodes directly. Active-run links, finite failed-search categories,
token-owned node indices and nested start/end events avoid whole-stream rescans
and redundant bookkeeping.

`tests/markdown-emphasis-runs.test.ts` adds permanent LF/CRLF surplus/overlap,
Unicode, links, opaque equation source, unavailable-mark and unsafe-URL cases.
The five-file focused source batch passes 207 tests. The permanent
`scripts/check-markdown-delimiter-neighbors.mjs` gate checks all 3,337 generated
inputs with both line endings: 6,674 reference-inline-meaning, exact-source and
complete **Fountain-to-Fountain JSON** canonical contracts pass. Native JSON
equality is a retention check, not comparison to a CommonMark AST.

The first additional generated check deliberately tries the unchanged official
tree-shaped projection and fails on `*alpha****beta****gamma*`: the reference
HTML has adjacent equivalent emphasis wrappers where Fountain emits one shared
wrapper. The failure is retained in
`artifacts/markdown-stack-source-conformance-20261006.log`. The separate generated
paragraph-domain comparator therefore compares text and formatting-depth runs,
code, breaks and full link/image meaning, not equivalent wrapper grouping.
Sensitivity assertions reject dropped, shifted, changed or duplicated emphasis
and altered destinations. The official comparator and all its corruption tests
are unchanged; official scores remain 563 default / 611 strongest opt-in.
`artifacts/markdown-stack-source-conformance-semantic-20261006.log` records the
passing additional and unchanged official gates.

Two complete-gate attempts retain small ESM-size failures at the unchanged
1,563 KiB ceiling; they do not reach the complete unit/performance result.
The implementation is subsequently streamlined rather than raising that limit.
`artifacts/markdown-stack-linear-complete-gate-20261006.log` passes the complete
package gate: 2,395 tests / 182 files, 407 declarations, 88 headless modules,
packaging/runtime/type/reference checks and unchanged size/performance/memory
limits. The actual compiled ESM and CommonJS diagnostic also passes 12 cases
per format without `document`, `window` or a fake DOM; see
`artifacts/markdown-stack-headless-packages-20261006.log`.

The first recorded issue-editor batch fails all six cases before editing because
its assertion requires `em > strong`; the trace shows correctly marked
`strong > em` text instead. The screenshot independently shows bold/italic
`gamma`. The corrected assertion requires both nested marks, exact text and
computed italic/700 styling, without imposing equivalent wrapper order. The
failed run and its unchanged 657-file snapshot are retained under
`artifacts/markdown-stack-browser-20261006`. The semantic follow-up passes both
WebKit repeats but stops Chromium/Firefox at native double-click selection:
those Windows engines include the following space, while WebKit excludes it.
The next journey uses a real Shift+Left key when that exact trailing space is
selected, and still requires exact `alpha` selection before typing. It does not
assign a synthetic Range, trim the result or hide unexpected selections.
All six cases pass with matching source hashes in
`artifacts/markdown-stack-browser-native-20261006`. They prove original-source
undo, redo, unchanged neighboring spellings, actual Markdown download/reopen
and read-only reader meaning. All six first-repeat desktop editor/reader images
are inspected; Firefox's scrolled page heading intersects the sticky header.
The initial 390px capture shows only part of the document, so the next capture
must scroll the last paragraph into view and require heading/first/last visibility.
These six passes precede the partial-schema correction below; broader final-source
browser verification remains required.
No row, conformance score or release claim is promoted by the earlier matrix.

### Partial-schema delimiter scope 2026 10 06

A pure-Node caller-schema diagnostic finds a separate real gap: disabling only
one emphasis mark can reuse an unsupported delimiter as the wrong supported
closer. With only italic, `*before **inside** after*` becomes
`*before *<em>inside** after</em>` instead of italic over the original outer scope
with literal inner bold syntax. With only bold, the inverse case loses its valid
outer formatting. Five of six new regression cases fail before the change in
`artifacts/markdown-partial-schema-before-20261006.log`.

The resolver now matches syntax independently of mark availability. Unavailable
pairs are emitted literally at their original nesting depth; supported outer
marks retain their actual scope. The focused five-file batch passes 213 tests.
The portable `scripts/fixtures/markdown-emphasis-check.mjs` adds 140 full/partial
schema checks, including LF/CRLF, both marker styles, repeated nesting, Unicode,
exact source and complete native canonical JSON. Actual packed ESM/CommonJS,
Node and workerd consumers invoke this fixture without a DOM/reference parser.
The 6,674 generated reference probes and unchanged official corpus also pass.

The first partial-schema build exceeds the unchanged ESM budget by about 0.1 KiB;
the failure is retained in `artifacts/markdown-partial-schema-budget-20261006.log`.
A monotonic start-event cursor and stable reversed-consumption sort replace a
redundant event map/order field. The current complete gate fits the unchanged
size limits and passes API, package/runtime, reference, performance and type
checks plus 2,401 tests / 182 files in
`artifacts/markdown-partial-schema-complete-gate-20261006.log`. The subsequent
explicit workerd response counter and final browser-fixture changes also pass
the Worker gate and root type check; the whole package run above predates only
those test-harness additions, not the final parser implementation.
Final-source recorded browser and broader matrix evidence remain required.

The first 18-case final-source browser batch passes all six issue-editor cases
but fails the 12 new restricted-schema fixture cases before mounting: the test
host creates native nodes in one Schema and passes them to `createEditor`, which
constructs another. The existing foreign-node guard correctly refuses that
input. The failure and unchanged 658-file snapshot are retained in
`artifacts/markdown-final-focused-browser-20261006`. The fixture now imports with
`editor.state.schema` after editor creation and dispatches initialization without
recording an undo step. The guard is unchanged; no foreign-node acceptance or
validation bypass is added. The actual integration rule is documented in
`docs/API.md`. The repeated corrected run passes all 18 cases in 1.8 minutes under
`artifacts/markdown-own-schema-focused-browser-20261006`, with every one of its
658 source files unchanged. It exercises both restricted schemas through native
pointer/keyboard typing, complete-model undo, exact-source undo, redo and canonical
reopening, plus the issue-editor file/reader journey. All 15 first-repeat scoped
captures (nine issue editor/reader/narrow views and six restricted-schema editor
views) are inspected. They show the intended text, literal delimiters and mark
scopes; the narrow captures now include all four test paragraphs. Firefox's
scrolled page title/background fields behind the sticky header and WebKit's thin
surrounding UI font remain visible observations, not blanket UI certification.

The final-source complete gate stops at the unchanged 5,000-block server HTML
latency ceiling: p95 **556.19 ms / 500 ms**, median 303.35 ms, while the 10,000-block
median/p95 are 531.22/585.09 ms and retained memory stays within its ceiling.
`artifacts/markdown-final-complete-gate-20261006.log` and its matching 658-file
source check retain this failure. The earlier complete 2,401-test pass remains
separate; no full green result is attributed to this later run, which never reaches
its unit stage.

A standalone unmodified-budget diagnostic with Node `--trace-gc` passes, recording
5,000-block median/p95 291.92/329.27 ms and collection activity in
`artifacts/markdown-final-performance-gc-diagnostic-20261006.log`. It neither
identifies the cause of the earlier outlier nor retroactively clears the failed
gate. Allocation/tail-latency profiling and final normal-gate evidence remain
open; no limit, sample exclusion or production function changes follow merely
from this diagnostic.

The independent full cold desktop matrix finishes under
`artifacts/markdown-final-desktop-matrix-20261006.log` against the same 658-file
snapshot in `artifacts/markdown-final-desktop-matrix-source-20261006.json`.
It records **601 passed / 17 skipped / zero failures** with all 658 recorded
source files unchanged. This is browser evidence, not a replacement for the
failed resource gate. No source/test/config edit occurs during the frozen
matrix; documentation is outside its scope. This run predates the subsequent
native-instance/attribute integrity correction and does not certify that change.

A lowered-priority CPU sampling diagnostic then profiles three 5,000-block
imports on the unchanged compiled server implementation. It checks every
paragraph, strong mark and link destination after sampling; all 5,000 blocks
match. The first diagnostic asserts the wrong internal mark name (`bold`
instead of `strong`); that harness failure is retained separately. The checked
profile and source-map summary are
`artifacts/server-html-cpu-baseline-20261006.cpuprofile` and
`artifacts/server-html-cpu-mapped-fixed-20261006.json`. Of 1,024 samples,
10.55% are garbage collection, 6.84% include selector compilation, and 4.39%
are self-time in the tree adapter's allocating attribute getter. Repeated child
wrapping and mark projection also appear. These overlapping sampled percentages
are workload evidence, not independent elapsed-time fractions or a reproduction
of the failed tail sample. The profiler runs alongside the browser matrix and
does not qualify a latency gate.

Inspecting `css-select` reveals an important optimization constraint: even with
result caching disabled, a compiled relative `:has(...)` selector can hold its
last queried element in a mutable scope closure. A global compiled-selector
cache could therefore retain entire imported trees. Any reuse experiment must
keep selector ownership local to an import/tree, preserve full selector and
diagnostic semantics, and prove that separate documents do not share retained
query state. No production optimization or resource-gate promotion follows
from the profile alone.

The artifact-only `server-html-selector-prototype-20261006.mjs` bundles a baseline
and a proposed bounded (256-entry), tree-local compiled-selector map without
editing production source or `dist`. Sixty paired document/fragment comparisons
pass with complete node JSON and issue equality, including relatives, `:has`,
`:scope` content selection, invalid selectors, repeated separate documents,
eviction, nested lists/tables, figures and unsafe links. This is an optimization
equivalence probe, not a replacement for the permanent format/runtime gates.
The four alternating 5,000-block pairs are highly variable under concurrent
load/lowered priority (baseline 700–2,971 ms; candidate 850–3,966 ms), and do not
establish an improvement. The proposal is therefore not integrated. Preserve
`artifacts/server-html-selector-prototype-20261006.log` and its compiler artifact
outputs; obtain isolated warmed allocation/CPU/latency evidence after the matrix
before choosing an actual optimization. The checked 658-file snapshot still
matches after these diagnostics.

### Lexical-token boundary experiment (2026-10-06)

**Follow-up:** the source inspection and bounded opt-in inline factory are now
implemented in the Unreleased source, with permanent security/retention tests
and a public Node/Markdown workshop. The historical experiment below remains
evidence, not the shipped contract. Production exposes no offsets, distinguishes
HTML input from Markdown projection, and keeps ordinary import source collection
disabled. See [the current API and boundary](HTML_INERT_SOURCE.md). Reference
conformance scores and default schema behavior are unchanged.

The shipped `HTMLParseElement` in `src/core/schema/node-spec.ts` exposes parsed
attributes, not original quote/case/order or source coordinates. `ServerElement`
in `src/html/server.ts` wraps parse5 nodes; `wrapNode`, `wrapChildren`,
`querySelectorAll` and a table-parent wrapper currently do not carry source text.
Inline/block Markdown flow already asks parse5 for source locations, while the
ordinary document/fragment path does not. A browser DOM alone cannot recover
lost lexemes; serializing `outerHTML` is not original-source retention.

`artifacts/html-source-tokens-prototype-20261006.mjs` virtually substitutes the
server wrapper in a private bundle, without editing production source or dist.
It propagates parser input through child/query/table-parent wrappers and probes
an optional `getSourceTokens()` returning a frozen descriptor: opening token,
closing token or null, UTF-16 offsets and `origin: 'parser-input'`. An implied
opening tag has no token; an omitted closing tag stays null rather than being
invented. A three-tag inert schema puts these strings in encoded data on safe
spans, never into live tag names/events/styles. This descriptor is an experiment,
not an exported interface or complete format-retention promise.

The 145 assertions cover uppercase/single-quoted/unquoted/boolean attributes,
entity spelling, CRLF and a quoted `>`, astral-prefix offsets, nested wrappers,
omitted/self-closing end tokens, forty isolated imports, descendant content
queries and complete safe-carrier JSON reopening. Examples 201/491/524/536
retain token data across actual model edits, canonical Markdown reopening,
undo's exact original source and redo's native JSON. This does not make their
inert fallback semantically equal to a CommonMark reader's custom HTML output.

The important finding is provenance: the Markdown flow reconstructs parser
input with protected node slots. Example 201's token starts at offset 71 in that
generated input, not position 71 in the user's Markdown. A public boundary must:

- Make source inspection optional, immutable and bounded, with an absent
  capability on DOM-only/recovered elements rather than fake original lexemes.
- Distinguish raw HTML-file input from reconstructed Markdown flow. Never expose
  synthetic parser offsets as original-file coordinates; original Markdown
  mapping requires the segment/source layer to supply genuine provenance.
- Keep spelling as data separate from edited child structure and live rendering.
  Copying original opening/closing tokens around edited children is not a safe
  HTML export policy, particularly for malformed tags or active attributes.
- Validate carrier data, registration precedence, missing renderers and resource
  budgets before shipping a generic inert extension. The three named prototype
  tags are not a wildcard production importer.
- Cover document mode, implied/adoption-agency/fostered elements, generated
  slots, browser/server differences and heap/bundle impact with permanent tests.

Retain the first measurement failure (`maxNodes: 50,000` exceeded by the
six-parser-nodes-per-paragraph 10k diagnostic). The corrected artifact requests
the same existing supported 100,000-node option in both variants; no production
limit changes. With three warmups/nine samples, unminified 100/1k/10k baseline
medians are 8.35/48.89/304.07 ms; candidate 8.03/47.04/303.22 ms, complete core
JSON equal. This single diagnostic does not establish tail/heap improvement or
certify the normal gate. Evidence remains in
`artifacts/html-source-tokens-prototype-20261006.log`,
`artifacts/html-source-tokens-prototype-measured-20261006.log` and
`artifacts/html-source-tokens-prototype-measured-checked-20261006.log`.

The separate existing inert-inline browser prototype is rerun against the
streaming mapper and corrected header: 18 recorded three-engine cases pass,
all 18 captures inspected. Empty source badges remain visible, nested edits
appear in both editor and reader, hostile attributes remain inspectable data,
with zero custom-element upgrades/event execution/invalid.test requests.
WebKit's surrounding serif fallback remains visibly different; this is not
pixel-equivalence certification. It does not exercise the new lexical descriptor
in a browser. Source hashes match the unchanged 664-file header snapshot before
and after; evidence is `artifacts/opaque-inline-stream-recorded-20261006.log`.

Separately, visual inspection of the 51-case mapper regression batch's 27
captures reveals translucent shared navigation over scrolled document/toolbar
text. `examples/react-app/src/index.css` now uses an opaque sticky header without
depending on backdrop blur. The added reader assertion first fails in Firefox;
six reader/backward-selection cases then pass across three engines, with six
key corrected captures inspected. See `artifacts/header-readability-before-20261006.log`
and `artifacts/header-readability-after-20261006.log`. The complete 2,457-test
gate predates only this CSS/assertion change; runtime mapper/source-export code
is unchanged, not a claim that the whole desktop matrix has been rerun.
