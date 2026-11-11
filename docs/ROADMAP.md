# FountainJS roadmap

Updated 2026-11-11.

FountainJS is an MIT-licensed structured-document engine with a web editor,
framework bindings, and optional document modules. The immediate goal is a
reliable beta that developers can install, integrate, and evaluate through
complete editing, review, and conversion workflows.

## Next beta

The target version is **0.5.0-beta.1**. The next minor version accounts for the
change to the default Yjs storage adapter. Existing XML rooms require the legacy
entry or an explicit migration. The [adoption guide](YJS_DEFAULT_ADOPTION.md)
explains both routes.

The candidate includes the existing local engine, format, framework, and UI work.
Its scope is fixed around the following outcomes.

| Outcome | Acceptance evidence |
| --- | --- |
| Ordinary editing preserves content and selection | Native typing, Enter, deletion, forward/backward selection, tables, quotes, math, clipboard, and undo/redo work through public editor controls. |
| Collaboration preserves both authors' work | Offline and concurrent edits converge, author undo is isolated, room replacement preserves drafts, and recovery survives retries and reload. |
| Document conversion reports its actual fidelity | Supported Markdown, HTML, DOCX, JSON, and PDF workflows preserve their documented subset and report conversion losses. Actual exports receive visual review. |
| Applications can adopt the editor | Plain DOM, React, Web Component, Vue, Svelte, and Angular integrations have runnable examples and guides. Existing framework forms retain their values and reset behavior. |
| The tested package is the shipped package | One candidate revision passes package, browser, runtime, type, size, and performance gates. Published docs and demos identify its version and limits. |

Capability fixes that meet these outcomes take priority. The broader ideas below
remain available for later releases.

## Release gates

The beta remains pending until the candidate has the following evidence.

1. A complete `pnpm check` run for the exact runtime revision, including all
   source tests and existing latency, memory, and code-size limits.
2. Hosted CI covering Chromium, Firefox, WebKit, Android/Chromium emulation,
   and iPhone/WebKit emulation, including default Yjs and migration recovery.
3. Packed ESM/CommonJS imports and types, both Angular ESM entries, and clean
   consumer installation. Node, Bun, Deno, and workerd cover the server entry.
4. Real Lean integration against the pinned toolchain and recorded visual
   review of the release's editor, reader, and export workflows.
5. Matching version, tag, changelog, website, and package metadata. The approved
   npm stage and a registry installation establish publication.

The commands and publication procedure are in [RELEASES.md](RELEASES.md).
The latest full local integration checkpoint is `7961b966`, which passed all
5,271 source tests and the package, Node/workerd, type, performance, retention,
format, and size gates on November 11. A duplicate-widget renderer repair also
passes 12 recorded desktop checks. Earlier default Yjs, startup, migration and
native-presence batches passed at `597f5415`; the combined latest candidate
still needs fresh release validation. The full editor/mobile matrix, serialized
native clipboard batch and hosted CI remain pending. See the
[checkpoint record](RELEASES.md#empty-run-widget-repair-at-7961b966).

## Remaining parity work

The [capability ledger](TIPTAP_PARITY.md) records 61 Delivered, eight Partial,
and two Host boundary rows. These are capability counts. Release readiness
also depends on the evidence above.

| Area | Work still required |
| --- | --- |
| Collaboration | Current release validation, sustained storage/history growth, realistic input responsiveness, and production adoption. |
| Formats and layout | Deeper DOCX/Word fidelity, the remaining ordinary CommonMark cases, and gradual ODT/EPUB support with independent fixtures. |
| Browser behavior | Complete cross-browser coverage for the current candidate and diagnosis of intermittent failures. |
| Mobile and IME | Physical iOS/Android keyboards, composition, autocorrect, selection, and clipboard evidence. |
| Accessibility | Additional menu and custom-renderer states plus assistive-technology testing. |
| RTL and localization | Remaining shared automatic-direction cases, inline isolation, broader host CSS and bidi behavior, and locale packages. |
| Frameworks | Broader framework-version coverage and equivalent optional UI/form integrations. |
| Onboarding | Stronger end-to-end examples, practical customization recipes, and independent developer integration evidence. |
| Host infrastructure | Tested self-host references and example storage, authorization, REST, webhook, and notification contracts. |

After the beta, measure browser input-to-paint latency and long-running
collaboration under representative workloads. Compare the same document and
operations with ProseMirror plus Tiptap. Current retained-Yjs measurements are
transaction bursts and in-memory exchanges. The
[diagnostic](YJS_ENDURANCE_DIAGNOSTIC.md) documents their workload and limits.

## Future work retained

The earlier proposals remain in [ROADMAP_HISTORY.md](ROADMAP_HISTORY.md),
including their scope, sources, and required proof.

- A self-contained `.fjs` package with assets and a portable local reader.
- Broader document ingestion, reproducibility tools, and migration adapters.
- Scientific workflows combining technical source, citations, references,
  proof checking, review, and verified publication output.
- Native renderer prototypes and a language-neutral document/operation protocol.
- Monaco/CodeMirror, Jupyter-kernel, and terminal adapters for structured workspaces.
- Authorable forms with separate definitions, respondent views, and submissions.
- Provider-based audio/video transcription and further language-service modules.
- Further block, table, media, and editorial features justified by complete use cases.

These proposals enter an active release after their editing, persistence,
security, interoperability, accessibility, and performance contracts are defined.

## Project name

Keep **FountainJS**. The November 8 naming review found existing uses of
Inkognito in document processing and other products. A later naming decision
requires another candidate and a compatibility plan.
[Recorded naming review](ROADMAP_HISTORY.md#inkognito-naming-check-2026-11-08).

## Engineering record

[ROADMAP_HISTORY.md](ROADMAP_HISTORY.md) preserves the previous roadmap in full.
Its dated entries describe the evidence available at each checkpoint. Current
release decisions use this page, [the capability ledger](TIPTAP_PARITY.md), and
[the release evidence](RELEASES.md).
