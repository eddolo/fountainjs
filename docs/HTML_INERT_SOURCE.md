# Opt-in inert HTML source preservation (Unreleased)

## Unfinished HTML at EOF (2026-11-03, Unreleased)

`createHTMLSourceEOFExtension()` from `fountainjs-editor/html/inert` registers
`html_source_eof`, a literal `text*` code block with safe `pre/code` reader
carriers. With this schema opt-in, `createHTMLSourceMarkdownAdapter` can retain
an unfinished tag in the final root HTML segment and preserve an independently
converted prefix. `importHTMLSourceDocument` also retains a discarded EOF tail,
including input that already carries safe-reader envelope metadata.

The tail is visible and editable as literal source. Enter inserts a source
newline; it does not complete or activate a tag. Native JSON, canonical Markdown
with the matching adapter, and safe HTML retain its data. Exact untouched
Markdown remains the source snapshot's responsibility; normalized parser input
is not an original-file slice. Direct HTML tail CR/CRLF and Unicode survive safe
carrier reopening.
NUL and isolated UTF-16 surrogates remain outside portable HTML text: source
export refuses them, and native JSON is required to retain such data exactly.

`exportHTMLSource` requires one EOF block at the final root position, with no
attributes/marks or completed syntax mixed into it. It validates the current
text as an unfinished tag, reconstructs it literally, and emits no generated
closing body/html tags after it. Independent validation checks its canonical
carrier text, actual file ending and complete-document body tree. Changing the
syntax into a complete tag, moving it before other content, duplicating it or
adding following content refuses raw-source output without returning partial
source or modifying the editor. Reimport completed syntax through the host's
explicit conversion path. Native JSON/safe HTML can still save the document.

The initial location experiment found that parse5 text spans can extend through
discarded EOF markup. Structural token locations now provide only a lower bound;
up to sixteen tag-like candidates are checked by parsing both prefix and tail.
Quoted `<` characters cannot bypass the prefix check. Both document and fragment
locations cover doctype/shell tokens and otherwise omitted whitespace. No parser
private fields are used. The input inspection bound is 1,048,576 UTF-16 units,
the literal tail is at most 65,536 units, and configured importer byte budgets
are retained when the prefix/tail are split. Unsupported/oversized/nested
Markdown cases keep the reported literal fallback. Direct HTML source import
with EOF capture enabled refuses an unfinished token it cannot retain, even
when the parser diagnostic budget is exhausted; it returns no partially preserved source
document. This is not arbitrary HTML recovery.

The public workshop's retention option includes a Retained EOF source sample,
native source editing and an explicit Add paragraph after EOF source action to
demonstrate refusal without content loss. Its reader uses a safe export snapshot;
refresh by exporting/reopening HTML. Reader HTML never activates the retained tag.

The three former root EOF patterns are covered by independent body-tree/source
checks, but the existing fragment-oriented conformance profile remains 631/652.
A separately certified complete-document profile is still required before
promoting those cases or the doctype-only case. No full CommonMark claim follows.

The final native EOF journey passes Chromium, Firefox and WebKit: literal Enter
and typing, bounded undo/redo to the original model, JSON/safe-HTML reopening,
refusal after adding a following paragraph, then safe HTML saving/reopening of
that entire refused-source document. Nine final editor, refreshed reader and
refusal-panel screenshots were inspected visually. Videos were recorded but not
reviewed. The earlier six-case browser run also covers source-empty editing;
the final EOF workflow additionally verifies the following paragraph in the reader.

Final frozen-source gates pass 3,161 unit tests / 233 files, the 109-module
headless boundary, consumer/framework types, packed ESM/CommonJS imports with
25 source contracts each, unchanged conformance profiles, 415 reviewed API
declarations, performance/retention gates, bundle budgets and the production
website build. Only optional inert/source entries and aggregate capacity caps
increase for measured code growth; no dependency, CSS-cap or numerical
performance-limit change is included. The initial parser-location and invalid
diagnostic-option test failures, and both budget-cap reviews, remain recorded.
See [the source-bound record](../artifacts/eof-source-verification-20261103.json).
The npm version remains `0.4.0-beta.2`; this checkpoint is unreleased there.

## Explicit source-empty body (2026-11-03, Unreleased)

`createHTMLSourceEmptyBodyExtension()` from `fountainjs-editor/html/inert` adds
`html_source_empty_body`, a normal inline-content editing block representing an
imported empty HTML body. Complete source import and the leading-Markdown-
declaration adapter create it only when their parsed body/block result is empty
and the host registered the extension. Existing schemas keep their paragraph
policy. Authored `<p></p>` and whitespace-bearing body content are not inferred
to be source-empty from their visual appearance.

Native JSON and safe HTML preserve this block's identity. A strict carrier
check restores its empty text leaf; altered attributes fall back to readable
content. Source output omits it only when it is the sole root block, has no
attributes/marks, and contains no data beyond unmarked empty text. Independent
validation requires its canonical carrier to contain no hidden source/content.
Typing emits a real paragraph; two empty blocks and following content also emit
paragraphs. Unsupported block metadata refuses source export with an explicit
conversion instruction rather than disappearing. Use the ordinary paragraph
type for authored formatting/metadata.

The existing text-block command contract now includes this type. Enter creates
an ordinary authored paragraph; Backspace and forward Delete can join it again,
and undo restores exact native data. The initial browser run exposed a missing
join registration, which was corrected without weakening the join assertions.
The public workshop provides an Empty source document sample under the explicit
retention option. This does not implement unfinished EOF tokens or promote the
existing fragment-based CommonMark source profile; its score remains 631/652.

The narrowed-root schema check also requires complete source import to validate
the finished document after replacement. A host whose root only accepts
paragraphs receives a refusal; the Markdown adapter keeps its literal fallback.
Six final headless browser journeys pass across Chromium, Firefox and WebKit.
They exercise actual typing, native Enter/Backspace joining, exact undo, JSON
and HTML reopening, exported paragraph structure and distinct vertical line
positions. Six final editor/reader captures were visually inspected. Recorded
videos were not reviewed.

The frozen-source verification passes 3,142 unit tests / 232 files, 108-module
headless boundary, consumer/framework types, packed ESM/CommonJS consumers
(20 source contracts each), unchanged conformance gates, 415 reviewed API
declarations, bundle budgets and production website build. Entry/aggregate
capacity increases cover measured code growth; CSS and performance caps stay
fixed. Initial join/schema/budget/API failures remain in the evidence.

Performance initially failed the 100-block server HTML p95 check at 36.01 ms
against 35 ms. An isolated `2015cbc` build and current build then pass the same
unchanged benchmark at 23.81 / 28.24 ms respectively. Current local/remote/server
median growth is 5.91x / 5.58x / 7.48x under 15x; both retention checks pass.
These measurements do not explain the earlier tail event or establish a
universal latency guarantee. See [the source-bound record](../artifacts/empty-source-verification-20261103.json).
No npm release is included; its version remains `0.4.0-beta.2`.

## Leading declarations in Markdown (2026-11-03, Unreleased)

Use `createHTMLSourceMarkdownAdapter` for explicit whole-document HTML projection
with a leading declaration retained as root-envelope data:

```ts
import { MarkdownImporter } from 'fountainjs-editor/core';
import { createHTMLSourceMarkdownAdapter } from 'fountainjs-editor/html/source';
const imported = MarkdownImporter.parseWithSource(markdown, schema, {
  parseHTMLDocument: createHTMLSourceMarkdownAdapter({ sourceTokens: true }, report => {
    // Display report.issues in your host's import diagnostics.
  }),
});
```

The adapter retains a declaration only in the first root HTML segment, with no
preceding non-whitespace content in that segment. Ordinary Markdown, inline HTML
and later declarations do not acquire an invented envelope. The existing HTML
projection/refusal rules and protected-node checks still apply. Declaration-only
input keeps its explicit caret paragraph, so example 181 remains unresolved.

The core document callback now accepts legacy block arrays or
`{ nodes, attributes }`. Both are validated before either is committed. A failed
root attribute or block validation retains the original inert document and
reports fallback. Existing array-returning adapters remain valid; callers that
invoke the callback themselves must handle the expanded result union. This
contract does not add a parser dependency to the core.

Exact untouched LF/CRLF source is owned by `parseWithSource`. After edits, native
JSON and complete HTML/source carry the envelope; canonical Markdown is not a
root-metadata container. The workshop's retention option also applies to leading
Markdown declarations and prevents lossy Markdown reopening. The existing
complete-document source validation and fragment refusal remain in force.
Declaration spelling follows normalized Markdown parser input: a multiline
CRLF declaration is stored with LF. Its original bytes remain in the untouched
source snapshot; edited complete source output does not promise those bytes.

This does not implement EOF lexical tokens or remove author-created empty
paragraphs. Current conformance profiles remain 563/613/631.

Six targeted headless journeys pass across Chromium, Firefox and WebKit, covering
the Markdown declaration workflow and the existing complete-HTML envelope flow.
Six new Markdown editor/reader captures were inspected visually; exact model
comparisons and browser compatibility-mode assertions cover data that a
screenshot cannot establish. Videos were recorded but not reviewed.

Verification passes 3,132 unit tests / 231 files, 108-module headless boundary,
consumer/framework types, packed ESM/CommonJS consumers (16 source contracts
each), all conformance gates, 415 reviewed public declarations, performance and
retention gates, bundle budgets and the production site build. The callback
type and optional factory account for the reviewed four declaration changes.
Only optional source-entry and aggregate capacity caps increased for measured
code growth; numerical performance and CSS limits remain fixed. See the
[source-bound record](../artifacts/markdown-envelope-verification-20261103.json).
The published npm version remains `0.4.0-beta.2`.

## Doctype and compatibility-mode data (2026-11-03, Unreleased)

`importHTMLSourceDocument(html, schema, options?)` from
`fountainjs-editor/html/source` performs the normal server HTML import with its
existing limits/reports, then captures bounded doctype spelling and the parser's
`no-quirks`, `quirks` or `limited-quirks` mode. A missing doctype is explicit
`null`. Root `htmlSourceEnvelope` data survives native JSON, replacement, history
and complete safe HTML reopening in both browser/server importers.

```ts
import { importHTMLSourceDocument, exportHTMLSource } from 'fountainjs-editor/html/source';
const imported = importHTMLSourceDocument(html, schema);
const source = exportHTMLSource(imported.document); // Complete source document
```

Ordinary reader HTML still uses its own HTML5 envelope. The original declaration
is carried in an escaped body data attribute and never activates compatibility
mode there. Complete source export reparses the declaration, verifies it is one
complete token with the stored mode, and restores it as the actual declaration.
Invalid/mismatched/oversized data is refused without partial source output.
`{ document: false }` refuses documents carrying envelope data: a body fragment
cannot represent that declaration. The doctype limit is 2,048 UTF-16 code units;
safe-HTML metadata accepts at most 16,384 JSON code units including escaping.

The public workshop provides a next-import option and a legacy PUBLIC-doctype
sample. It compares exact native data after HTML/JSON reopening. Markdown
reopening is disabled for envelope-bearing documents because it would lose root
source metadata. The follow-up adapter above adds leading Markdown declarations.

Head content, shell attributes, source comments outside the body, external
resources, original CSS/layout and arbitrary file fidelity remain outside this
contract and subject to the ordinary conversion report. Doctype-only documents
retain their editable caret paragraph; no paragraph is removed to increase the
CommonMark score. The four remaining lexical-source cases stay unresolved.

Six targeted headless journeys pass across Chromium, Firefox and WebKit:
doctype-data editing/history/JSON/complete-HTML reopening plus the existing
inert-anchor workflow. Six new editor/reader captures were visually inspected;
the reader uses Fountain's normal styling, not original-document layout.
Independent browser `compatMode` checks distinguish the safe reader's standards
mode from reconstructed source's legacy mode. Recorded videos were not reviewed.

Checkpoint verification: 3,120 unit tests / 230 files; 108-module DOM-free
boundary and consumer types; framework type checks; packed ESM/CommonJS source
import/export contracts; unchanged CommonMark profile gates; 415 reviewed API
declarations; performance/retention gates; bundle budgets; production website
build. The optional source entries and aggregate bundle caps increased for the
measured feature cost, with initial red budget/API results retained. No new
dependency, CSS-cap increase or numerical performance-limit change was needed.
See [source-bound verification](../artifacts/envelope-verification-20261103.json).
The npm version remains `0.4.0-beta.2`; this is unreleased there.

## Remaining lexical-source boundary (2026-11-03, investigation)

The remaining four source-output cases require a document/lexical-source
boundary. They are not fixed by registering another parsed element. Reproduce:

```sh
pnpm build
node scripts/diagnose-html-lexical-boundary.mjs artifacts/html-lexical-boundary-20261103.json
```

The diagnostic uses the installed official CommonMark fixtures, parse5, and the
built Fountain package. It preserves exact untouched Markdown for all eight
LF/CRLF variants of examples 156–158 and 181. It does not change the conformance
comparator, any profile requirement, or production import/export behavior.

All three unfinished-tag examples produce an empty reference body tree at
actual EOF. Appending the source writer's `</body></html>` completes their token
and creates a `div` with newly interpreted attributes. All six LF/CRLF variants
demonstrate this. Copying a raw tail into the current envelope would therefore
change source meaning. Current visible literal fallbacks correctly retain the
words, report refusal and preserve the untouched source snapshot.

For example 181, body-fragment parsing omits the doctype, then
`MarkdownImporter.parse` adds the empty paragraph required for editing. Erasing
that paragraph alone would not retain the declaration. A separate HTML 4.01
PUBLIC declaration probe changes from quirks mode with a public ID to the
writer's HTML5 no-quirks envelope when its declaration is moved into the body.
The current HTML5 export envelope is an output policy, not preservation of every
source document's declaration or compatibility mode.

Evidence: [eight-case report](../artifacts/html-lexical-boundary-20261103.json).
Its body-tree helper ignores whitespace-only formatting text only for this
diagnostic; it is not the conformance comparator or permission to omit authored
whitespace during conversion.

| Owning boundary | Current behavior | Required next change |
| --- | --- | --- |
| `src/html/server.ts`, `parseInlineContent` / `parseFlow` | Explicit `eof-in-tag` refusals protect raw source and protected node slots. | Preserve bounded lexical tokens alongside the parsed tree; keep refusal until those tokens can survive editing and serialization. |
| `src/html/server.ts`, `parseContent` / `parseWithReport` | Fragment conversion returns body blocks and page settings; document declarations are outside the model result. | Represent document-envelope source separately from body nodes and diagnostics. Keep the existing block-only API compatible. |
| `src/core/importers/markdown-importer.ts`, `parse` | The document adapter returns block arrays; an empty result becomes a caret paragraph. | Carry explicit envelope/lexical provenance through document construction; distinguish an editing repair from an authored empty paragraph without guessing from appearance. |
| `src/html/inert.ts` | Carriers represent complete parsed elements and attributes. | Add schema-owned lexical source with bounded data, visible author inspection, safe reader fallback, and exact JSON/carrier reopening. An unfinished token is not an element with synthesized children. |
| `src/html/source.ts`, `exportHTMLSource` | Always writes an HTML5 envelope and closing body/html tokens; independently validates its body tree and reports native model differences. | Serialize envelope and actual EOF context deliberately. Refuse or explicitly reclassify an EOF token moved before following content. Validate envelope semantics as well as body structure; do not conceal a source-bearing carrier from validation to obtain a match. |

Implementation acceptance requires literal-source edits, native selection,
undo/redo, block movement, insertion after an EOF token, exact JSON and safe-HTML
reopening, LF/CRLF and Unicode boundaries, declaration/compatibility-mode loss
reporting, independent semantic corruption guards and public reader/editor
captures. Keep all four cases unresolved until that evidence exists. Prototype
raw-source output is not a shipped capability or a higher conformance score.

## Unsupported anchor retention (2026-11-03, Unreleased)

`createInertHTMLAnchorExtension()` from `fountainjs-editor/html/inert` retains
anchors that the built-in hyperlink mark cannot represent: extra attributes,
unsupported targets, absent destinations or rejected URL data. The optional
native bookmark extension takes priority for supported bookmarks. Supported
hyperlinks keep their existing behavior, including Fountain's own destination
carriers and generated `rel` attribute.

```ts
import { createInertHTMLAnchorExtension } from 'fountainjs-editor/html/inert';
const extensions = [/* your existing extensions */, createInertHTMLAnchorExtension()];
```

The `html_inert_anchor` node stores bounded `attributes`, `tag: 'a'`, lexical
`tokens`, and editable inline children. Its editor/reader output uses a span
carrier and visible badge. Destinations, IDs, styles and event handlers remain
data. The separate source-data exporter reconstructs the current anchor and
attributes, including unsafe destinations; it must never supply reader HTML.
Nested anchors that HTML would repair are refused by the source exporter.
Oversized or damaged carriers are declined with readable descendants retained.

The public inert-HTML workshop has an explicit anchor-retention option. Changing
it starts a new sample and resets that workshop's document/history; the UI states
this before the control is used. The sample includes an unsupported destination,
an empty attributed anchor and an ordinary supported hyperlink.

The unchanged CommonMark comparator now matches **631/652** cases in the optional
source-output profile, including examples 616 and 631. Four format/semantic
gaps remain (156–158 and 181), alongside seventeen intentional policies. Default
and safe-reader scores remain 563/652 and 613/652. Exact untouched-source checks
remain separate from semantic comparison and native document retention.

Six targeted headless browser journeys pass across Chromium, Firefox and
WebKit: native retained-anchor editing/history/JSON/Markdown/HTML reopening,
plus the existing ordinary-link navigation and literal-Markdown workflow.
Six new editor/reader screenshots were visually inspected. Videos were recorded
but not reviewed. A first test-locator error and a stalled inner-frame screenshot
capture are retained in the evidence; the final run captures the iframe element
and keeps every editing/reopening assertion. This is focused regression coverage.

Checkpoint validation passes 3,106 unit tests across 229 files, the 107-module
DOM-free boundary, headless consumer types, framework type checks, packed
ESM/CommonJS imports and anchor reopen contracts, all CommonMark profile gates,
415 reviewed API declarations, bundle budgets and the production website build.
The optional factory adds about 1 KiB of runtime code; only aggregate capacity
was raised after retaining the original red budget result. Individual entry
and CSS limits remain fixed. See the [source-bound evidence](../artifacts/inert-anchor-verification-20261103.json).
This is not an npm release; the published version remains `0.4.0-beta.2`.

## Validated source-data export (2026-11-03, Unreleased)

`fountainjs-editor/html/source` adds `exportHTMLSource(document, options?)`.
It reconstructs registered retained elements around their **current** children
and attributes. It does not reuse stale lexical tokens or change the document.
The existing `HTMLExporter` continues to emit safe retained-source carriers.

```ts
import { exportHTMLSource } from 'fountainjs-editor/html/source';

const result = exportHTMLSource(editor.state.doc);
if (result.ok) {
  // Source data for inspection or an explicit file download, not innerHTML.
  saveSourceFile(result.sourceHTML);
  console.log(result.modelRoundTrip, result.issues);
} else {
  showExportIssues(result.issues); // No partial source is returned.
}
```

The successful result has `sanitized: false`: original event attributes,
script/style source and custom element names may be present. The exporter does
no IO or execution. Opening the downloaded HTML in another application can
activate its contents. Use the ordinary exporter for the safe reader surface.
The public HTML workshop exposes inspection and download separately from its
reader preview, disables stale downloads after edits, and lets authors undo an
unrepresentable edit without losing their document.

Validation compares independently parsed HTML structure, attributes and text
against the intended source projection of the canonical safe output. This is
**not equality between Fountain and CommonMark ASTs**. Separately, the function
reimports the complete HTML file into the document's schema and reports
`modelRoundTrip: 'equal-except-source-tokens'` or `'different'`. The latter includes
a `model-canonicalization` issue; native metadata, grouping and unsupported
schema behavior must not be advertised as lossless HTML. Keep Fountain JSON
for exact native retention. Canonical source spelling can change in either case;
untouched Markdown spelling remains the source-snapshot export's responsibility.

The default result is a complete UTF-8 HTML document with explicit body context
and supported page settings. `{ document: false }` returns its body fragment;
the validation still uses the complete document. A fragment needs **body**
insertion/parsing context: parsing a leading script/style as a standalone
document can move it into the head.

Refusals include closing script/style tokens in edited source, raw script/style
carriage returns, NUL, isolated UTF-16 surrogates, invalid retained attributes,
or a changed structure on HTML reparsing. Textarea source escapes closing tags
and preserves authored CR and initial LF. Limits are 20,000 nodes, depth 64,
1,048,576 UTF-16 code units of text plus JSON-encoded node attributes, and
4,194,304 code units of complete output. Limits return issues, not truncated
documents. This optional entry reuses the existing DOM-free HTML parser.

The permanent `commonmark-source-output-v1.json` profile matches **629/652**
official cases with both LF and CRLF, with 1,304 separate untouched-source
checks. The reference comparator is unchanged. Default and safe-reader profile
scores remain separate; the strongest existing safe profile remains **613/652**.
Twenty-three source-output differences remain: seventeen deliberate policies
and six unresolved format/semantic contracts. This is not full CommonMark
conformance, arbitrary HTML support, or native-file visual fidelity.

Regression coverage includes 51 unit cases and six headless browser journeys
across Chromium, Firefox and WebKit. The source journey uses pointer/keyboard
editing, stale-download detection, refusal, undo, download-byte checks and safe
reader reopening. Its six success/refusal screenshots have been inspected.

Source-export checkpoint (`df093be`): 3,074 unit tests across 226 files; 415 API declaration
files; packed ESM/CommonJS source-export acceptance/refusal checks; DOM-free
consumer types and 106-module import boundary; TypeScript/framework checks;
bundle budgets; production site build; and shared-direction memory retention
pass. All twelve source-export and CR editor/reader screenshots were inspected.

Performance is **not all green**: with one process restricted to two cores,
the unchanged incremental-remote 1,000-to-10,000-block median-ratio check failed
at 16.45x and 23.04x against its 15x ceiling. An isolated build of parent
`2f7534d` also failed at 19.69x (and its local ratio/small HTML p95 checks).
Current absolute latency and heap ceilings passed. This comparison establishes
an existing failing baseline on this machine, not a performance certification
or proof that the new work has no impact. Preserve the red results; investigate
sampling/scaling separately without raising the threshold. No npm release is
declared by this checkpoint. Evidence: `artifacts/html-source-writer-verification-20261103.json`.

Subsequent sampling investigation separates first edits from sustained typing,
retains outliers, and passes on both current and parent engines under the same
numerical limits. It changes the benchmark method, not the editor engine; the
old failures above remain historical evidence. See [the follow-up](PERFORMANCE.md#initial-edits-and-sustained-typing-2026-11-03-unreleased).

## Source reconstruction investigation (2026-11-02, historical prototype)

The investigation below predates the validated API above. Its prototype and
known failures remain evidence for why an unchecked reconstruction is insufficient.

The remaining CommonMark work needs an explicit source-output boundary, not a
relaxed safe-reader serializer. A pure Node prototype reconstructs the original
registered element names/attributes around their current children from safe
carriers. Using the **unchanged neutral comparator**, its experimental source
profile matches **629/652** reference cases with LF and CRLF, compared with the
shipped optional profile's **613/652**. The sixteen additional matches concern
retained wrappers/raw-text elements. They are **not shipped conformance gains**.
The prototype restores event attributes and script/style source as output bytes;
it is never inserted into a browser and is not a safe reader export.

The experiment also establishes why this cannot simply become a public option:
five basic source cases survive, but four edited-model cases fail. Closing
`</script>` / `</style>` text can escape the intended source element; authored
CR/CRLF and NUL can change during the intermediate HTML parse/serialization.
Passing the official corpus alone does not cover those authored states.

The CR case exposed a separate bug in the **existing safe exporter**. Its text
and attribute escaping now writes a character reference for CR, so reopening
does not normalize it to LF. Permanent tests cover retained script/style/textarea
source, canonical Markdown carriers, DOM/server reopening and bookmark attributes.
This preserves already-authored code points; ordinary imported HTML still follows
HTML newline normalization. NUL and raw active-element reconstruction are not
declared solved by this fix.

Verification: 3,023 tests across 225 files pass. A recorded public-workshop
workflow passes Chromium, Firefox and WebKit with native pointer/keyboard
editing, undo/redo, complete HTML/Markdown/JSON reopening and reader text checks.
All six editor/reader screenshots were inspected. They show consistent layouts;
the lone CR is preserved in data but remains invisible in this ordinary view.
This is not an invisibles-visualization or native-file pixel-fidelity claim.
API, packed ESM/CommonJS, headless, TypeScript, existing size budgets and the
production website build pass. The shipped conformance profiles remain unchanged.
Evidence: `artifacts/html-source-carriage-verification-20261102.json`.

The smallest proposed production boundary is:

- Keep `HTMLExporter` and live NodeViews on their existing safe-carrier contract.
- Add a separate optional **source-data exporter**, walking the model with the
  full document context rather than reparsing safe HTML and losing code points.
  Its result must distinguish source bytes from renderable/sanitized HTML.
- Serialize ordinary editable nodes through the existing contextual serializer;
  use an explicit source projection only for recognized retained-source nodes.
  Never copy stale opening/closing tokens around edited children blindly.
- Validate reconstructed structure and report/refuse unrepresentable source
  states (including closing-token escapes and NUL). Distinguish byte retention
  from browser HTML normalization; do not report exact model reopening when the
  target format cannot express it.
- Exercise edits/history, native JSON persistence, independent parsing and a
  source inspection/download workflow before exposing it in the public lab.
  Never promote its reference matches into safe-reader/default parser scores.

Unfinished tags (156–158), declaration metadata (181), unsupported anchor
attributes (616), and the rejected literal URL (631) remain separate contracts.
This experiment neither reclassifies those gaps nor changes URL policy.

Reproduce with `node artifacts/run-html-source-conformance-probe-20261102.mjs`
after building, and `node artifacts/html-source-prototype-boundaries-20261102.mjs`.
The latter deliberately verifies known prototype failures, not production success.
The generated harness changes only imports, the experimental adapter set and its
output source projection; the semantic comparator and baseline fixtures are intact.

## Official CommonMark retention coverage (2026-10-08)

The existing adapters now have 24 Node-only LF/CRLF contracts drawn from twelve
official CommonMark examples. They compare retained tag/attribute/body data,
exact untouched Markdown and complete JSON/HTML/canonical-Markdown reopening,
and reject live original tags or event-handler attributes in exported carriers.
These are **inert retention tests, not native HTML behavior or new semantic
conformance matches**. See [the remaining-work breakdown](MARKDOWN_DOCUMENT_FLOW.md#current-remaining-commonmark-work-2026-10-08-unreleased)
and `tests/commonmark-inert-preservation.test.ts`. Existing browser recordings
test author interaction separately; these new tests do not replace them.

## Visible blank lines in reader and standalone HTML

The next visual audit reproduced a real failure: the editor displayed blank
lines, but a 36px-line paragraph measured 0px in the reader and saved HTML.
The reproduction's video, source file and before images are retained in
`artifacts/html-blank-lines-reproduction-20261006`.

Default standalone HTML and this workshop reader now give every paragraph a
minimum computed line height: `p{min-height:1em;min-height:1lh}`. Applying it only
to `p:empty` would miss an empty marked run such as `<p><strong></strong></p>`.
The `em` declaration is a fallback; the tested engines support the `lh` value.
Nothing is added to text or JSON. Unstyled exports and fragments remain
host-styled. The new **Download standalone HTML** button saves the actual public
exporter's file so authors can open it separately rather than relying only on
this iframe's deliberately different theme.

The full gate passes **2,619 tests / 196 files**. Nine serial recorded desktop
workflows cover complete reopening, pointer typing, Enter/Backspace/undo and
editor/reader/saved-file blank-line geometry. The three explicitly owned lines
measure 36px, 64px and 10pt (within 0.5px); consecutive blanks must not overlap.
Geometry JSON and downloaded files are retained for all engines. See
`artifacts/html-blank-lines-visual-verification-20261006.json` for the source,
logs and screenshot hashes. This is HTML screen-layout evidence, not native
Word/PDF print fidelity, identical themes or physical mobile/IME certification.

## Childless paragraph follow-up

The empty-paragraph follow-up passes **2,618 tests / 196 files** and six recorded
pointer/keyboard workflows across Chromium/Firefox/WebKit, no retries. HTML,
Markdown HTML carriers and JSON are compared against the complete document;
typing into a reopened childless paragraph, Enter, Backspace and undo are tested.
Six new filled editor/reader captures are directly inspected; the final recording
is hash-verified against those captures and 24 inspected block-regression images.
See `artifacts/html-empty-paragraph-visual-verification-20261006.json` for the
final source snapshot, logs and retained failures. Unfilled paragraph print/line
geometry is not certified by these filled-state captures. Ordinary empty
paragraph defaults, CommonMark scores and delivered-roadmap rows do not change.

## Registered block wrappers

Previous block checkpoint: **2,606 tests / 195 files**, packed ESM/CJS and actual
pure Node/workerd checks, plus twelve serial recorded desktop workflows across
Chromium/Firefox/WebKit without retries. All 24 block captures are visually
verified directly or by exact byte matches to captures inspected this turn;
18 raw-source captures are verified against inspected evidence or inspected
when changed. The other 39 regression captures are not claimed freshly
re-inspected. Source remains unchanged across both final gates. See
`artifacts/html-inert-block-visual-verification-20261006.json` for hashes,
retained failures, scope and limitations. This remains Unreleased.

`createInertHTMLBlockExtension({ tags: ['lab-section', 'warning'] })` from
`fountainjs-editor/html/inert` supplies the block equivalent of the inline
adapter. Compose it with your schema; do not register the same tag as both an
inline and block node. Only explicitly registered unknown tags are supported,
not a wildcard importer. Standard HTML sections use `HTMLContainerExtension`.

The `html_inert_block` node has `block*` children and the same bounded `tag`,
`attributes` and `tokens` data as the inline adapter. Headings, lists, tables,
media and nested registered wrappers remain structured children where the
configured schema supports them. Original CSS, event handlers and custom-element
behavior are **not** activated. Exports use an inert `div` shell, an editable
content region and a visible retention badge, not the original element.

Imported empty wrappers stay empty. To author inside one, call
`appendInertHTMLBlockParagraph(editor, path)` then `view.focus()`. The command
adds one paragraph, places the logical caret inside it and is undoable; it
refuses read-only editors or paths that are not inert block wrappers. The factory
also registers this command in its extension command map. It uses the existing
transaction/view boundaries, not a new input engine.

Try **Structured inert block sample** in the Node/Markdown demo's inert-source
workshop. Edit the heading or a table cell, add content to the empty wrapper,
then export Markdown/HTML/JSON and reopen. The original attributes/tokens are
shown separately from the live view. Reader previews permit embedded image data
but no scripts or remote asset requests.

HTML and canonical Markdown reopening require this adapter and matching schema;
Markdown also requires the explicitly enabled HTML importer. Without them,
readable fallbacks are possible but wrapper identity is not retained. This does
not improve the standard CommonMark conformance score or promise arbitrary
website/layout reproduction. Source spelling does not update itself when the
document changes, and retained metadata is neither trusted nor private.

Canonical HTML/Markdown can coalesce adjacent unmarked text leaves (for example,
after Backspace joins two paragraphs). The workshop compares complete JSON and
reports that native-shape mismatch; it does not call it exact retention. Native
JSON preserves those separate leaves. HTML now emits `data-fountain-empty="block"`
on genuinely childless paragraphs, and both importers restore that shape only
when the source element has **no child nodes**. This also preserves childless
paragraphs nested in canonical Markdown HTML carriers. Ordinary `<p></p>` still
gets its normal empty caret leaf. Added text, images, comments, whitespace or
elements cannot be hidden behind a forged marker; they use ordinary parsing.
Explicit saved empty paragraphs are now
carried through document-wide HTML recovery instead of triggering a literal
fallback. Implicit list/quote caret fillers keep their existing behavior.

## Link inspection workshop

The Node/Markdown public workshop now has three link samples: supported HTML
control data plus a disguised unsafe link, four literal Markdown backslash cases,
and five HTML navigation-intent cases (including source TAB/LF/CR).
It shows both stored destinations and rendered hrefs, real editor/reader views,
import warnings and Markdown/HTML/JSON reopening results. Unsafe links stay
readable and unlinked. Source control bytes remain bounded inert metadata where
needed; navigation uses HTML browser preprocessing rather than encoded controls.

Literal URL-data retention alone is not browser navigation fidelity. Optional
`link.htmlHref` now retains source-bound HTML navigation separately from literal
Markdown URLs, repairing raw HTML example 21 and whole-document cases 642/643.
Canonical merging of adjacent unmarked runs after rejecting HTML remains a
visible native-shape mismatch. Current CommonMark profiles are 563 default /
613 strongest opt-in; older claims below are historical. See
[the destination contract](MARKDOWN_DOCUMENT_FLOW.md#link-destination-integrity-and-oracle-correction).

Previous URL unchanged-source verification: 2,585 unit tests / 194 files, package
and DOM-free runtime checks, plus 42 serial recorded desktop workflows.
All 36 fresh link captures are visually inspected; 18 raw-source captures are
byte-checked against inspected evidence or inspected directly when changed.
See `artifacts/html-link-origin-visual-verification-20261006.json` for hashes,
source manifest and precise scope. This remains Unreleased, not physical-device
testing or original HTML layout certification.

Historical version-10 evidence: 42 serial three-engine input workflows
pass with videos/traces; 24 link and 18 raw-source screenshots were checked
directly or byte-matched to inspected evidence. See
`artifacts/html-link-literal-visual-verification-20261006.json` for hashes,
retained failures, the precise native-shape mismatch and physical-device limits.

Use this only when your application explicitly owns unknown inline tags whose
behavior and layout it does **not** intend to reproduce. It is a preservation
adapter, not an arbitrary HTML renderer or a CommonMark conformance claim.

```ts
import { Schema, CoreExtension, composeExtensions, MarkdownImporter } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';
import { createInertHTMLInlineExtension } from 'fountainjs-editor/html/inert';

const schema = new Schema(composeExtensions([
  CoreExtension,
  createInertHTMLInlineExtension({ tags: ['lab.measurement', 'my-inline'] }),
]).schema);
const importer = new ServerHTMLImporter({ sourceTokens: true });
const captured = MarkdownImporter.parseWithSource(source, schema, {
  parseHTMLDocument: importer.parseTextBlockFlow.bind(importer),
});
```

The optional entry has no browser runtime dependency. It is not included in
CoreExtension, StarterKit or the package root. Normal HTML import and the
default unknown-tag fallback do not change. Register 1–64 distinct lowercase
unknown tag names (letters, digits, hyphens and dots; maximum 64 characters).
Standard HTML, active/raw-text tags and namespace syntax cannot be registered.
Dotted names are HTML-input registrations, not CommonMark inline-HTML syntax.
Use a dedicated semantic extension instead when an unknown tag has real meaning
or behavior. Avoid competing node/mark rules for the same registered tag.

## Data, source and view are separate

`html_inert_inline` has editable inline children and three declared attributes:

- `tag`: the registered, normalized tag name.
- `attributes`: decoded original attributes, retained only as inert data.
- `tokens`: an opening tag, explicit closing tag or null, and input provenance.

The server importer's optional `sourceTokens: true` exposes immutable
`HTMLParseElement.getSourceTokens()` results. It is off by default; ordinary
browser DOM inputs do not supply lexical source. Missing/implied opening tags
return null; missing explicit closing tags are never invented. Tag case, quote
spelling, attribute order and entity spelling may be inspected in these tokens.
They describe the imported tag boundary, not a continuously rewritten source
buffer or every byte of the original document. They remain unchanged when a
child's text is edited.

`origin: 'html-input'` denotes direct parser input. `'markdown-projection'`
denotes reconstructed Markdown/HTML adapter input; protected source slots can
change that input. No source offsets are exposed and it must not be presented
as an original Markdown-file coordinate. Stored provenance is data, not a
signature or evidence that a document is trustworthy.

Rendered and exported content is always a safe `span` carrier, editable child
span and visible “retained HTML” fallback badge. Original `onclick`, `style`,
`href`, `src`, tag names and lexical tokens are **never** applied to live DOM.
No custom-element upgrade, resource fetch, extension installation or execution
is requested by this adapter. Both author and reader see the fallback; this
does not reconstruct a website or its layout.

## Bounded retention, not silent cleanup

An attribute record has at most 64 entries, at most 8,192 characters per string
and 16,384 characters of JSON. Tokens allow an 8,192-character start tag and
128-character closing tag. The complete three-field carrier data is limited to
32,768 characters. Existing importer byte/node/depth limits still apply.
Oversized or invalid data declines the node rule rather than creating an
unvalidated node. Read the import loss/issues report; visible descendant text
continues through the ordinary fallback.

Only the writer's structural carrier is recognized: two direct child elements,
the content marker, the matching plain badge and no extra visible siblings. A changed
shell declines preservation instead of swallowing added text. Portable rules
may inspect descendants through optional `HTMLParseElement.querySelectorAll()`;
no layout, selection, events or mutable DOM identity is exposed. A custom
parser that lacks this inspection cannot reopen the carrier as this node.

## Explicit raw-text source capture

The same optional entry exports a separate factory:

```ts
createInertHTMLRawTextExtension({ tags: ['script', 'style', 'textarea'] })
```

Register one or more distinct names from exactly those three lowercase tags.
This does not relax the inline factory's rejection of active/raw-text tags.
`html_inert_raw_text` is an inline, non-atomic, `code: true`, `text*` source
node, not executable HTML. Its three bounded attributes use the same retention
contract above. The safe carrier has a `code` content element and a visible
“inert source” badge; original attributes are never installed on live elements.
There are no live script/style/textarea nodes, CSS effects or form controls.

HTML import into `code: true`, `text*` nodes keeps Unicode text as text rather
than converting emoji to atoms. Raw bodies remain literal: `<strong>`, Markdown
delimiters and CSS URLs are source text. Supported formatting deliberately
applied to that source after import survives canonical carrier reopening.
Typing and Enter/Backspace operate inside the source; an empty source gets a
view-only caret placeholder, and first typing fills the existing node instead
of replacing its identity/attributes. Selecting a nonempty inline node still
uses the ordinary replacement contract.

This is **not byte-exact raw-body import**. HTML parsing normalizes CR/CRLF;
textarea decodes entities and removes its initial newline according to HTML
rules. The exact untouched Markdown snapshot is a separate promise. Direct
document HTML parsing also keeps normal head/body placement: head-only source
can be omitted from body content with diagnostics. Markdown flow capture uses
the fragment route; it does not change direct HTML parsing policy.

Unsupported scopes, missing registration, malformed/oversized carriers and
conversion consuming protected Markdown nodes still decline or fall back.
Escaping data for a carrier can exceed its bounded limits even when the input
was accepted; keep native JSON and inspect conversion reports. Matching reader
registration is required. This is an inert, inspectable preservation route,
not original HTML semantics, CommonMark score promotion or website rendering.

## Reopening and fidelity

Native Fountain JSON is the complete model backup. With the same registration
and a compatible HTML-enabled reader, the safe carrier retains the declared
tag/attribute/token data and supported inline children through HTML and
canonical Markdown export/reopening. `NodeSpec.markdown: 'html'` is the existing
explicit export policy; Markdown reports that matching parse rules are needed.
Other global/custom node attributes are not part of this carrier contract.

Unchanged Markdown can use the existing source snapshot's exact-source route.
Edited Markdown uses canonical carrier HTML; it does not re-emit potentially
hostile original opening/closing tags. Never equate preserved data with original
HTML behavior, semantic equivalence, typography, print fidelity or full-file
source retention. Hidden source attributes may contain secrets: retained does
not mean private. Remove them deliberately before sharing when necessary.

## Interactive verification

The Node/Markdown demo includes an **Inert HTML preservation** workshop at
`demos/node-markdown.html#inert-source`: nested/empty/dotted/hostile samples,
pointer/keyboard editing, undo/redo, token inspection, independent Markdown/
HTML/JSON reopening and a sandboxed reader fallback. It uses the real optional
module, not the earlier private prototype. No live original-source preview is
inserted into the page.

The workshop also exposes real conversion diagnostics and an unfinished-tag
sample. Markdown flow refuses a token ending inside a tag and retains literal
editable source; direct HTML import uses normal HTML recovery, which can omit
that token with an explicit parser diagnostic. See
[the bounded retention guard](MARKDOWN_DOCUMENT_FLOW.md#unfinished-tag-retention-guard-2026-10-06-unreleased).

Permanent tests are `tests/html-source-tokens.test.ts`,
`tests/html-inert-inline.test.ts`, `tests/html-inert-browser.test.ts` and
`tests/browser/html-inert-journey.ts`. The browser journey records real input
and desktop/mobile-width reader captures in each selected engine; it is not
physical mobile/IME or full CommonMark certification.

The serialized gate (`artifacts/html-inert-production-complete-gate-20261006.log`)
passes 2,507 tests / 189 files, 409 declarations, packed ESM/CommonJS consumers,
pure Node and real workerd full-model edit/history/reopen checks, and existing
latency/scaling/heap limits. Nine selected real-input regressions pass in
`artifacts/html-inert-production-recorded-regressions-20261006.log`; all 24 new
inline captures are visually inspected. The frozen 672-file production digest
is in `artifacts/html-inert-production-source-20261006.json`. This does not cover
every malformed HTML tree, extension collision, native mobile composition or
third-party clipboard destination. See [the size cost](PERFORMANCE.md).

The workshop also includes three-tag and empty-script samples using the raw
factory, with `tests/html-inert-raw-text.test.ts` and the recorded
`tests/browser/html-raw-text-journey.ts`. These cover literal Unicode, LF/CRLF,
empty-node pointer/typing, real Enter/Backspace, history, complete native JSON,
Markdown/HTML/JSON reopening, retained lexical data and a scriptless reader.
The badge cannot hide added image descendants. The initial Chromium empty-code
pointer defect and browser test click/history-grouping failures are retained
in `artifacts/html-inert-raw-text-recorded-checked-20261006.log`; the corrected
three-engine run is `artifacts/html-inert-raw-text-recorded-fixed-20261006.log`.
All 18 new raw editor/data/reader/390px-width/empty-source captures are visually
inspected. This is desktop browser emulation, not physical mobile/IME coverage.

The current full gate is
`artifacts/html-inert-raw-text-complete-gate-checked-20261006.log`: 2,551 tests /
191 files, 409 public declarations, packed ESM/CJS, pure Node/workerd,
headless/framework types and existing performance/memory limits. The 675-file
source digest is in
`artifacts/html-inert-raw-text-production-source-checked-20261006.json`.
Size costs are explicit in PERFORMANCE; no published version or conformance
score was promoted by these Unreleased changes.

Final unchanged-source recorded regression:
`artifacts/html-inert-raw-text-recorded-regressions-20261006.log`, 36 selected
desktop workflows / three engines / no retries. All 18 fresh raw captures are
SHA256-identical to the inspected images; three additional code-keyboard focus
captures are inspected. Scope is recorded in
`artifacts/html-inert-raw-text-visual-verification-20261006.json`.
