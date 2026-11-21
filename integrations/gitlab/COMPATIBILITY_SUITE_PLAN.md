# GitLab paired compatibility and regression suite

## Flagship status on the pinned GitLab CE 19.5.3 deployment

| Status | What the evidence covers |
| --- | --- |
| Completed workflows | On [the two-author live wiki](../../artifacts/gitlab-compatibility/wiki-provider-20261121/verified/report.md), both Chromium users edited the same draft and saw named cursors. The second author’s undo and redo kept the first author’s change, and the bold name survived Save and reopen. In the [single-container rollback](../../artifacts/gitlab-compatibility/wiki-room-rollback-20261121/fountain-2/report.json), a fresh stock browser recovered an unsaved Fountain draft after the room’s six Redis updates were checkpointed. The Developer added text, saved and reopened the result. The [stock-to-Fountain rollout](../../artifacts/gitlab-compatibility/wiki-stock-rollout-20261121/original-2/report.json) recovered an unsaved stock draft in a fresh Fountain browser, then passed undo, redo, Save and reopen. A [structured wiki rollout](../../artifacts/gitlab-compatibility/wiki-structured-rollout-20261121/original-5/report.json) also retained the heading, nested list, quote, bold text and original list markers after edits in both builds. [Titled wiki links](../../artifacts/gitlab-compatibility/wiki-link-rollout-20261121/original-3/report.json) retained their destination and title through label editing, undo/redo, Save and reopen. Issue descriptions and discussions retained independent drafts, formatting, undo histories and saved records in both save orders. The two-author wiki restore passed 19 comparisons on Firefox, followed by an eight-revision rollback check. Native Writer paste passed all eight issue-table checks on Chromium. [Table authoring and save/reopen](COMPATIBILITY_GRID_RESULTS.md#author-and-edit-a-table-in-an-issue-description) passed all 16 checks on Chromium (14 parity and two better undo observations). In the [live issue contents workflow](../../artifacts/gitlab-compatibility/contents-20261120/verified/report.md), both editors updated the outline, saved and reopened it. Fountain also preserved the authored marker spelling. Each result below identifies the build and browser. |
| Still open | Byte-exact line endings on collaborative Save remain open on the packaged backend. Physical-device input, multi-instance deployment and rollback, and changing a user's role while a wiki restore is open need direct acceptance evidence. The installation and application checklist also covers the remaining component contracts and GitLab Markdown features. [Full checklist](README.md#remaining-full-application-acceptance) |
| Blocked by Fountain or its GitLab adapter | Collaboration providers beyond the verified wiki channel, unsupported wiki room nodes and state-dependent ProseMirror serialization hooks still require adapters. Native extensions can register writers for their own nodes and marks. The image adapter recovers the authored address from verified Markdown source positions. Edited export still requires an unambiguous address when GitLab omits its canonical metadata. A host supplying only generated contents HTML without the source-positioned editor response still requires a conversion adapter. These limits belong to the replacement. [Host contracts](services/host_configuration.ts) · [GitLab Markdown conversion](services/markdown_codec.ts) |
| Documented safe GitLab-only limitations | The stock wiki conflict notice can display untranslated tokens while protecting the competing revision. The tested WebKit private-review navigation reported host errors on both builds while preserving and posting the draft exactly once. The receipts below identify the affected workflows. |

The live wiki integration uses GitLab’s existing shared document and session lifecycle. In the pinned GitLab source, `wikis/components/wiki_form.vue` constructs an `ActionCableProvider` for `CollaborativeEditing::WikiPageChannel`. The stock editor binds `provider.doc` to the `default` fragment, takes cursor identities from `provider.identityFor`, and waits for `whenSynced` before the elected client calls `seed`. In the pinned `y-prosemirror` package a paragraph with a bold word produces a `paragraph` XML element and a text delta with the `bold` attribute. Fountain’s [legacy XML reader](../../src/yjs/legacy-xml.ts) expects `fountain-node` elements with `fountain:type`. Sharing the fragment name alone would leave the two editors reading different encodings. The browser receipts below cover a late join, named cursors, concurrent edits and a stock client reopening a Fountain-authored room. The [reverse rollout](../../artifacts/gitlab-compatibility/wiki-stock-rollout-20261121/original-2/report.json) also passed. Stock GitLab seeded the room and both stock authors saw the unsaved sentence before leaving. Six Redis updates retained the same digest across the frontend switch. A fresh Developer session in Fountain recovered the sentence before typing, undid and redid its own addition, then saved and reopened the formatted wiki. This covers two paragraphs and bold text on the pinned single-container Chromium deployment.

On a wiki with a heading, nested list and quote, the [earlier Fountain Save](../../artifacts/gitlab-compatibility/wiki-structured-rollout-20261121/original-4/report.json) changed both asterisk bullets to hyphens. On [Fountain build `32af2598`](../../artifacts/gitlab-compatibility/wiki-structured-rollout-20261121/original-5/report.json), a Developer recovered the unsaved stock list edit in a fresh browser, undid and redid a status edit, saved, and reopened the reader. Seven room updates retained their digest across the deployment switch. The GitLab API returned the expected Markdown including both asterisks, nesting indentation and the stock-saved CRLF endings. [Recovered Fountain editor](../../artifacts/gitlab-compatibility/wiki-structured-rollout-20261121/original-5/fountain-recovered-draft.png) · [Reopened GitLab reader](../../artifacts/gitlab-compatibility/wiki-structured-rollout-20261121/original-5/reopened-structured-wiki.png). The [titled-link rollout](../../artifacts/gitlab-compatibility/wiki-link-rollout-20261121/original-3/report.json) extended the same fixture on Fountain `33e95be8`. A Developer edited “release guide” to “release operator guide” in the recovered draft, undid and redid the change, then saved. The GitLab API and [reopened reader](../../artifacts/gitlab-compatibility/wiki-link-rollout-20261121/original-3/reopened-structured-wiki.png) retained the edited label, HTTPS address and “Publishing steps” title. Seven room updates retained their digest. This is a Chromium handover on the packaged single-container backend. Gollum wiki links, reference links, uploads in progress and tables remain outside this result.

In the [two-author Chromium run](../../artifacts/gitlab-compatibility/live-wiki-20261120/comparison/report.md), packaged GitLab delivered the administrator’s unsaved edit to the Developer. The Developer’s undo kept the administrator’s edit, and redo restored the Developer’s edit on both screens. Both authors appeared after they moved their cursors. The saved wiki retained the bold text and both edits. The server returned CRLF for the LF fixture. The [stock observation](../../artifacts/gitlab-compatibility/live-wiki-20261120/original-3/report.json) includes the native Yjs paragraph and bold-text representation. On Fountain `29415c5e`, opening the same kind of wiki with the flag enabled showed an error before the editable surface mounted. All nine subsequent checks on the replacement lack observations. That build was blocked before editing. The [Fountain screenshot](../../artifacts/gitlab-compatibility/live-wiki-20261120/fountain-1/interrupted.png) shows the wiki form and its separate discussion editor. The namespace flag was restored after each run. [Reproduction](runtime/README.md#reproduce-a-live-two-author-wiki-edit).

The native wire binding can now read the stock wiki fixture and apply edits to its existing shared XML. The pinned-package interoperability check exercises a disconnected writer on each side, a delayed join, and author-local undo. Build `5ed861f6` connects the binding to the wiki form. In the [matched Chromium rerun](../../artifacts/gitlab-compatibility/wiki-provider-20261121/comparison/report.md), stock showed both peer cursor labels, synchronized both authors’ edits and preserved the bold text on Save and reopen. The [Fountain run](../../artifacts/gitlab-compatibility/wiki-provider-20261121/fountain-1/report.json) reached the first author’s form, displayed the source-recovery alert and never enabled the editing surface. All ten comparison checks were incomplete on that build. The [diagnostic rerun](../../artifacts/gitlab-compatibility/wiki-provider-20261121/fountain-2/report.json) captured the initialization error: the session was classified as disconnected. In the next browser pair both GitLab clients received the initial room state before confirmation. Build `3a6150c2` waited for confirmation and reached the Markdown seed, then refused the renderer-added paragraph alignment. [Matched rerun](../../artifacts/gitlab-compatibility/wiki-provider-20261121/comparison-confirmation/report.md) · [Fountain diagnostic and socket event order](../../artifacts/gitlab-compatibility/wiki-provider-20261121/fountain-3/report.json). [Run the wire check](runtime/README.md#reproduce-a-live-two-author-wiki-edit).

On Fountain `d78fe0a3`, both authenticated Chromium clients received the existing room state. The second author saw the unsaved text and both named cursors appeared. Peer undo and redo preserved the first author's edit. Both sides saved and reopened the same rich content. Each HTML form converted the original LF paragraph break to CRLF. Nine invariants passed on both sides and exact line endings remained a shared limitation. The comparison recorded zero incomplete observations. [Matched builds and checks](../../artifacts/gitlab-compatibility/wiki-provider-20261121/verified/report.md) · [Fountain editor](../../artifacts/gitlab-compatibility/wiki-provider-20261121/fountain-4/shared-wiki.png) · [Stock editor](../../artifacts/gitlab-compatibility/wiki-provider-20261121/original-2/shared-wiki.png).

The [mixed Chromium session](../../artifacts/gitlab-compatibility/wiki-mixed-20261121/fountain-1/report.json) kept the Developer's Fountain editor mounted through rollback. The administrator reopened the wiki in the stock editor and both edited the same paragraph. Each author undid their own addition, both redid it, and both screens showed the other person's named caret. Stock Save retained the two edits and the bold name in the API and the reopened reader. [Stock screen](../../artifacts/gitlab-compatibility/wiki-mixed-20261121/fountain-1/mixed-stock.png) · [Fountain screen](../../artifacts/gitlab-compatibility/wiki-mixed-20261121/fountain-1/mixed-fountain.png).

In the [overlapping-edit rerun](../../artifacts/gitlab-compatibility/wiki-mixed-20261121/fountain-2/report.json), each browser observed its own new text while the peer's addition was still absent. Then both editors displayed both additions, one in each paragraph. The wiki API and reloaded reader retained the combined text and bold name. This case exercises concurrent typing in different paragraphs. [Stock screen](../../artifacts/gitlab-compatibility/wiki-mixed-20261121/fountain-2/mixed-converged-stock.png) · [Fountain screen](../../artifacts/gitlab-compatibility/wiki-mixed-20261121/fountain-2/mixed-converged-fountain.png).

With the optional wiki source-preservation controller installed on **both** sides, the [two-author Save comparison](../../artifacts/gitlab-compatibility/wiki-live-source-20261121/verified/report.md) passed all ten checks on Fountain `6b4a4b06`. Both builds saved the two authors’ text and reopened the bold name. Stock changed the LF paragraph break to CRLF. Fountain kept the original LF bytes. The feature flag was enabled for the same single namespace while each workflow ran, and each collector restored its initial configuration.

Stock rapid rich-text Save lost the last edit in reproduced cases. Data loss remains a release concern. Use the separately verified prepared Tiptap rollback for immediate rich-text Save on the tested deployment. [Rollback builds and instructions](runtime/README.md#reproduce-the-prepared-tiptap-rich-text-rollback)

## Host-defined issue label and Markdown writer

The custom Fountain deployment passed a native `issue_label` extension and its Markdown writer into GitLab’s normal editor component. The control used packaged GitLab’s built-in label. On GitLab CE 19.5.3 in Chromium, both editors retained the label through a prose edit, undo, redo, Save, reload and a switch to Markdown. The API stored exactly `Confirmed. Responsible team: ~fountain-workflow` and the reader retained the project label link. The collector verified the custom node at first open and after reopening on Fountain. The seven checks compare editing and persistence. The sample supplies its own visual treatment. [Matched builds and results](../../artifacts/gitlab-compatibility/custom-label-20261120/verified/report.md) · [Fountain issue editor](../../artifacts/gitlab-compatibility/custom-label-20261120/fountain-1/edited-label.png) · [Stock issue editor](../../artifacts/gitlab-compatibility/custom-label-20261120/original-1/edited-label.png) · [Reproduction](runtime/README.md#reproduce-a-host-defined-label-serializer).

On Fountain `29415c5e` the same host also supplied a mark for keyboard shortcuts. In Chromium 151 the author clicked between `F` and `5`, typed `1`, undid and redid the edit, then saved. Both builds stored `Shortcut: <kbd>F15</kbd>.` alongside the original label reference and reopened the key as formatted text. The screenshots show the authored key and the different label styling. All eleven checks matched. [Builds and comparison](../../artifacts/gitlab-compatibility/custom-mark-20261120/verified/report.md) · [Stock editor](../../artifacts/gitlab-compatibility/custom-mark-20261120/original-2/edited-label.png) · [Fountain editor](../../artifacts/gitlab-compatibility/custom-mark-20261120/fountain-1/edited-label.png).

## Saving an issue with uncited footnotes

On the pinned Chromium deployment, an author edited the opening paragraph of an issue containing one cited footnote and eleven uncited definitions. Fountain `c568c035` retained the exact edited Markdown in GitLab’s API and when switching a reopened rich editor to plain text. The stock reader also displayed the cited footnote correctly, but rich Save discarded the other eleven definitions. This is a data-loss constraint for rollback. A [same-issue Markdown handover](runtime/README.md#roll-back-an-issue-containing-uncited-footnotes) subsequently verified that all twelve definitions survive on packaged GitLab when the first edit is made in plain text. The [seven matched checks](../../artifacts/gitlab-compatibility/footnote-labels-20261120/verified/report.md) cover four parity results and three consequences of preserving the definitions. [Stock reopened editor](../../artifacts/gitlab-compatibility/footnote-labels-20261120/original-2/reopened-editor.png) · [Fountain reopened editor](../../artifacts/gitlab-compatibility/footnote-labels-20261120/fountain-1/reopened-editor.png).

## Editing a linked image in an issue

On GitLab CE 19.5.3 in Chromium 151, stock and Fountain `be866ad5` passed all eight checks. An author opened the image properties, changed its description, undid and redid the edit, saved the issue, then reopened it. GitLab's saved Markdown kept the image address, its separate link to the project’s issues, and both surrounding paragraphs. Both readers loaded the same image bytes. The pinned GitLab reader supplied a source span and omitted the image’s canonical-address attribute. The rewritten repository-relative case has separate codec coverage. [Matched build identities and eight results](../../artifacts/gitlab-compatibility/linked-image-20261120/verified/report.md) · [Stock reader](../../artifacts/gitlab-compatibility/linked-image-20261120/original-1/saved-figure.png) · [Fountain reader](../../artifacts/gitlab-compatibility/linked-image-20261120/fountain-1/saved-figure.png).

## GitLab issue table of contents

Reproduce with `--suite contents` on the stock and Fountain builds using the same run ID and fixture. The Chromium 151 browser edited the second heading, saved, reloaded GitLab's reader and reopened the rich editor. Five requirements matched. Stock rewrote `[tOc]` to `[[_TOC_]]`, while Fountain retained the exact spelling. Clicking the nested outline entry placed Fountain's caret inside the renamed heading. [Matched builds and results](../../artifacts/gitlab-compatibility/contents-20261120/verified/report.md) · [Fountain outline](../../artifacts/gitlab-compatibility/contents-20261120/fountain-1/live-outline.png) · [Stock outline](../../artifacts/gitlab-compatibility/contents-20261120/original-1/live-outline.png).

The standard GitLab integration requests undecorated Markdown and identifies the directive from the paragraph's source span. The codec has fixtures for both spellings, multiple directives, a document without headings, and literal text or code. This browser pair covers an existing outline on an issue. The [blank-issue authoring comparison](../../artifacts/gitlab-compatibility/contents-authoring-20261120/verified/report.md) verified inserting via the toolbar, undo/redo, saving before any heading exists, reopening, adding prose, then adding a heading and checking the reader and rich editor. Physical devices and other GitLab surfaces remain open.

On the pinned Linux Chromium build, Fountain `66ab960d` saved just `[[_TOC_]]` after toolbar insertion, undo and redo. The earlier [Fountain attempt](../../artifacts/gitlab-compatibility/contents-authoring-20261120/fountain-1/report.json) saved two extra empty HTML paragraphs. On the repaired build all 12 checks passed. Six matched stock; six recorded the consequences of preserving the same outline. Stock reopened with no outline before headings existed. After the rich prose edit appeared in GitLab's own issue draft, Save persisted the sentence and silently dropped the directive. Adding the heading afterward produced no reader links on stock. [Stock issue and saved source](../../artifacts/gitlab-compatibility/contents-authoring-20261120/original-3/report.json) · [Fountain reopened](../../artifacts/gitlab-compatibility/contents-authoring-20261120/fountain-3/reopened-outline.png). This stock data loss is a rollback constraint. On issue #681 the [Fountain save](../../artifacts/gitlab-compatibility/contents-handover-20261120/fountain-2/report.json) and [packaged GitLab handover](../../artifacts/gitlab-compatibility/contents-handover-20261120/original-2/report.json) verified a Markdown recovery path on the same volumes. Stock appended prose while there were no headings, saved the first heading in a second Markdown edit and reopened the outline in its rich editor. Both API reads preserved the exact expected source. [Reproduction](runtime/README.md#roll-back-an-issue-with-a-table-of-contents-and-no-headings).

## Current acceptance boundaries

The GitLab flagship is complete when FountainJS reliably replaces the editor for the defined workflows and the deployment can be rolled back safely.

- GitLab parity is the minimum for this integration. Reproduce editor defects outside GitLab when possible, fix them in FountainJS, and retain a standalone regression test even when the stock GitLab editor has the same defect. Keep host-specific constraints in the adapter and document their impact on this deployment.
- Fix defects in FountainJS or its GitLab adapter. When replacement exposes a GitLab defect, investigate what changed and correct any adapter responsibility.
- For a pre-existing GitLab defect, record the pinned original and replacement builds, reproduction and user-visible impact. It can be accepted as a known host limitation when matched evidence shows the replacement introduces no new failure or worse outcome and the workflow meets its essential safety requirements.
- Shared behavior still blocks sign-off when it compromises document integrity, authorization, safe deployment or rollback. Unexplained differences remain open until their impact is understood. Preserve the raw failing observations and report the scope of each compatibility decision.

For example, the [WebKit private-review comparison](../../artifacts/gitlab-compatibility/mr-navigation-20261120/reviewed/report.md) supports compatibility for recovering and submitting that draft on the tested builds. Both readers retained the edited description and existing discussion. Both published the pending comment exactly once under the correct author. The [stock](../../artifacts/gitlab-compatibility/mr-navigation-20261120/original-2/navigation.json) and [Fountain](../../artifacts/gitlab-compatibility/mr-navigation-20261120/fountain-2/navigation.json) traces place the candidate’s navigation errors at the same host requests and transitions seen on stock. The raw zero-error check stays open. Those documented messages do not block editor compatibility for this workflow.

| Area | Verified on the pinned local deployment | Still open |
| --- | --- | --- |
| Issue description and discussion | Both save orders, isolated formatting and undo histories, independent saved records. 44 matched checks on each browser. [Emoji repair build on Chromium 151](../../artifacts/gitlab-compatibility/emoji-composer-rollback-20261119/comparison-2/report.md) · [Review-feedback build on Chromium 151](../../artifacts/gitlab-compatibility/confirmed-review-rollback-20261119/comparison-1/report.md) · [Firefox 153](../../artifacts/gitlab-compatibility/composer-firefox-20261119/comparison-1/report.md) · [Unicode repair build on WebKit 26.5](../../artifacts/gitlab-compatibility/unicode-composer-rollback-20261119/comparison-2/report.md) The [queued-review feedback build](../../artifacts/gitlab-compatibility/queued-feedback-rollback-20261119/comparison-2/report.md) also passed all 44 checks in Chromium. The [reviewer refresh build](../../artifacts/gitlab-compatibility/reviewer-refresh-rollback-20261119/comparison-2/report.md) passed all 44 in both save orders. | Other host surfaces and devices. |
| Concurrent issue editing | The returning Developer can inspect both drafts and explicitly discard or overwrite. [18 matched checks](../../artifacts/gitlab-compatibility/offline-conflict-20261119/comparison-2/report.md). When another change arrived, the open disclosure updated. Both builds retained the losing draft during overlapping saves. [31 further checks](../../artifacts/gitlab-compatibility/issue-races-20261119/comparison-5/report.md). | GitLab returned HTTP 500 on the competing issue update in both builds. |
| GitLab service restart | On Chromium 151, both save orders retained the issue description and bold comment in the API and a fresh reader after each editor deployment restarted. All 46 checks passed on GitLab CE 19.5.3 and Fountain `7c85ae01`. [Builds, restart times and issues](../../artifacts/gitlab-compatibility/composer-restart-20261119/comparison-3/report.md) | Production topologies, abrupt host failure and recovery of unsaved drafts. |
| Immediate Save and rollback | The [three-browser rollback on issues #643–654](runtime/README.md#reproduce-the-prepared-tiptap-rich-text-rollback) retained rapid insertions, deletions, reviewed Markdown and bold comments on the same synchronous-focus build across Chromium, Firefox and WebKit. Earlier Firefox results include one wrong-character deletion and an unavailable edit form. The active Fountain build retains the last edit. The [opt-in Tiptap rollback](runtime/README.md#reproduce-the-prepared-tiptap-rich-text-rollback) retained the immediate rich-text Save on all 12 issues across Chromium 151, WebKit 26.5 and Firefox 153 on Linux. Stock can reopen the same issues and discussions and save from Markdown. [Immediate Save](../../artifacts/gitlab-compatibility/immediate-save-20261119/comparison-1/report.md) · [Rollback](../../artifacts/gitlab-compatibility/dual-composer-20261119/comparison-8/report.md) | Stock rapid rich-text Save lost the final edit in both Chromium and WebKit. [Timed WebKit rollback on issues #522–525](../../artifacts/gitlab-compatibility/unicode-composer-rollback-20261119/comparison-2/report.md) Removing the Ruby footnote overlay retained the working cached rendering of issue #494. Regenerating its HTML restored the stock repeated-reference defect. [Reproduction and both build receipts](runtime/README.md#reproduce-rollback-with-the-footnote-renderer). Stock reopened issues #566–569 after removing the queued-review build. Immediate rich-text Save at 3.2–8.6 ms lost the last edit on all four. Reviewed Markdown Save retained the descriptions and bold comments. [Four-record rollback](../../artifacts/gitlab-compatibility/queued-feedback-rollback-20261119/comparison-2/report.md). On the reviewer refresh build, stock reopened issues #572–575. Immediate rich-text Save lost the final edit at 3.6–11.6 ms on all four, while Markdown Save retained both records. The [first-edit rollback on build 269741c1](../../artifacts/gitlab-compatibility/rollback-first-edit-20261119/comparison/report.md) confirmed immediate Markdown Save on four issues, with all comments retained. Immediate rich-text Save on stock lost punctuation on two and the full added phrase on two. Deployment at production scale remains open. |
| Wiki editing and version history | On GitLab CE 19.5.3 in Chromium 151, all three pages retained the intended rich-text edits, reopened in the reader and editor, and restored the selected revision. Fountain preserved the exact Markdown on all three Saves and all three Restores. The stock editor rewrote source on three Saves and two Restores. Both builds used the same optional wiki controller. [48 matched checks and revision IDs](../../artifacts/gitlab-compatibility/wiki-rich-save-20261119/comparison-3/report.md) · [Reproduction and rollback](runtime/README.md#reproduce-wiki-save-and-version-restore) | Distinct users, additional browsers and physical devices still need matched coverage. |
| Wiki display titles and YAML | Five rich-text workflows changed or added a display title, including a title and body edited together. Fountain kept unrelated metadata, comments, Markdown, and line endings exact on all five Saves and returned the original bytes on all five Restores. Stock preserved the new display title on Save, rewrote all five documents, and lost four original display titles on Restore. [90 matched checks and source receipts](../../artifacts/gitlab-compatibility/wiki-title-fidelity-20261120/comparison/report.md) · [Deployment and reproduction](runtime/README.md#reproduce-wiki-display-title-edits) | Changes to other YAML fields, ambiguous keys and unsupported layouts use the host serializer. This result covers the tested display-title workflows on Chromium 151. |
| Wiki history after a path change | A bookmark followed the move and an old revision URL retained the original text with either editor. Enabling GitLab’s project-scoped rename-history setting allowed both editors to select the pre-move commit and restore its original bytes as v4. All 15 checks passed with the setting enabled. [Both settings, builds and revision IDs](../../artifacts/gitlab-compatibility/wiki-rename-20261120/verified/report.md) · [Deployment and reproduction](runtime/README.md#reproduce-history-after-moving-a-wiki-page) | With GitLab’s default setting, the renamed page’s history starts at the move. Six checks dependent on selecting earlier revisions remain unmet for both editors. Chained moves and larger histories remain unverified. |
| Wiki restore after a competing edit | In two Chromium tabs signed in to the same account, confirming an open v1 Restore after another tab saved v3 retained the newer edit. Both editors let the author follow the conflict link, review v3, and deliberately restore v1 as v4. The optional wiki controller fixed GitLab’s untranslated link placeholders for both editors. [18 matched checks and eight revision IDs](../../artifacts/gitlab-compatibility/wiki-stale-restore-20261119/comparison-4/report.md). A [two-author comparison](../../artifacts/gitlab-compatibility/wiki-authors-20261120/verified/report.md) passed all 19 checks with the same optional controller on both builds. A signed-in Developer saved v3 while the administrator had Restore open. The stale confirmation preserved v3. The subsequent deliberate restore created v4, credited the correct authors, and left all four revisions retrievable. The [Firefox 153 comparison](../../artifacts/gitlab-compatibility/wiki-authors-firefox-20261120/verified/report.md) matched on all 19 checks with Fountain build `56b722e7`. [Packaged GitLab after rollback](../../artifacts/gitlab-compatibility/wiki-authors-firefox-stock-20261120/original-1/report.json) retained both pages and the source and author credits of all eight revisions. | Role changes between opening and confirming Restore remain unverified. |
| Merged-cell clipboard | Horizontal and vertical two-cell spans survived external rich paste, internal paste, history and save/reopen in both editors. Fountain retained blank TSV slots in plain text. [42 matched checks](COMPATIBILITY_GRID_RESULTS.md#merged-cell-clipboard-and-save) The [merged-header case](../../artifacts/gitlab-compatibility/header-grid-20261120/verified/report.md) also verified a two-column header, linked body cell, adjacent cells and untouched final row through copy, cut, paste, undo, redo and save/reopen. The [native Writer comparison](../../artifacts/gitlab-compatibility/writer-header-grid-20261120/comparison-2/report.md) verified the actual paste, saved ODT and reopened table on Linux LibreOffice 24.2.7.2. The [reverse Writer paste](COMPATIBILITY_GRID_RESULTS.md#paste-from-libreoffice-writer-into-a-gitlab-issue) verified exact cell text, formatting, history and persisted issue content after a standalone Fountain paste repair. | Nested cell content, clipboard ownership across widgets and other desktop applications. |
| Wrapped clipboard selections | Both pointer directions and a GitLab emoji shortcode were exercised through copy, external rich paste, cut, undo/redo, save and reopen. [150 checks](../../artifacts/gitlab-compatibility/wrapped-clipboard-20261119/comparison-4/report.md) | Clipboard ownership across custom nodes, bidirectional text, IME, physical touch and named external applications. |
| Rollback with a pending merge-request review | In Linux Chromium 151, the Developer authored a bold private comment on !240 using Fountain `44219116`. Packaged GitLab reopened the description in rich text, saved a Markdown follow-up and published the same draft as one bold comment under the same account. The prior public note and source head survived, and the draft queue was empty. [Fountain build and draft 100](../../artifacts/gitlab-compatibility/mr-handover-20261120/fountain-2/report.json) · [Stock build and published note 9021](../../artifacts/gitlab-compatibility/mr-handover-20261120/original-2/report.json) · [Reproduction](runtime/README.md#reproduce-a-private-review-across-editor-rollback). | Local single-instance frontend switch with a saved private draft. The open-tab rollback is recorded in the following draft-recovery evidence. Other devices and production topology remain open. |
| Merge-request creation and description | The browser created one open request per source branch with the intended title and formatted description. Both editors showed the second paragraph just before Save. Fountain retained it after immediate Save in GitLab’s API and reader; stock lost it from both. [Administrator on Chromium 151](../../artifacts/gitlab-compatibility/mr-create-20261120/verified/report.md). The [Chromium Developer comparison](../../artifacts/gitlab-compatibility/mr-create-developer-20261120/verified/report.md) verified authorship after both submissions, with nine parity and two improvement checks on one saved edit. The administrator workflow passed all ten checks in [Firefox 153](../../artifacts/gitlab-compatibility/mr-create-firefox-20261120/reviewed/report.md). | Both [WebKit 26.5 runs](../../artifacts/gitlab-compatibility/mr-create-webkit-20261120/reviewed/report.md) preserved the edit and each reported eleven browser errors. The [Developer workflow](../../artifacts/gitlab-compatibility/mr-navigation-20261120/reviewed/report.md) recovered an existing discussion and a private review draft, then published the draft once on each build. WebKit reported errors during navigation. The strict WebKit gate and physical-device coverage remain open. |
| Unposted merge-request comment | After reload, both editors restored the private text and bold range, published the comment once under its author, cleared the composer and retained earlier notes. [Chromium 151](../../artifacts/gitlab-compatibility/mr-draft-reload-20261120/verified/report.md) · [Firefox 153](../../artifacts/gitlab-compatibility/mr-draft-firefox-20261120/verified/report.md) · [WebKit 26.5](../../artifacts/gitlab-compatibility/mr-draft-webkit-20261120/reviewed/report.md). All 16 Developer checks passed on Firefox. WebKit matched on all 15 functional checks. | The WebKit zero-browser-errors check remains inconclusive. The [stock trace](../../artifacts/gitlab-compatibility/mr-draft-webkit-20261120/original-1/navigation.json) recorded 12 errors and the [Fountain trace](../../artifacts/gitlab-compatibility/mr-draft-webkit-20261120/fountain-1/navigation.json) recorded seven. Every candidate endpoint and stage also appeared on stock. Neither trace recorded a page error during the unposted-comment test. |
| Unposted comment across editor rollback | In the [Chromium open-tab rollback on !250](../../artifacts/gitlab-compatibility/mr-live-draft-rollback-20261120/fountain-2/report.json), GitLab required sign-in again. The same Developer recovered the formatted draft in the original tab under stock GitLab, published it once, and retained earlier notes and the merge-request description and head. [Reproduce the switch](runtime/README.md#roll-back-with-an-unposted-comment-in-an-open-tab). | Physical devices and multi-instance rollbacks remain unverified. |
| Merge-request reviews | Three posted suggestions were expanded symmetrically, shrunk to the anchor, or extended on one side. The file and commit were verified after undo, redo, save, reload and application. [63 matched checks](../../artifacts/gitlab-compatibility/review-ranges-20261119/comparison-2/report.md) | Packaged GitLab loses Applied history on prose-only edits. See the optional shared backend profile below. |
| Deletion suggestions | Four cases cover two adjacent middle lines, an empty proposal, a newline, and two Unicode spaces around a tab. Fountain preserved the exact Unicode on rich reopen. Both editors produced the expected surviving file lines and one child commit. [60 matched checks](../../artifacts/gitlab-compatibility/range-whitespace-20261119/comparison-3/report.md) | Applying a whitespace-only proposal still removes the target. Preserving an intentional blank line requires a change to GitLab’s application semantics. |
| Batch review | Both editors queued two independent proposals, removed and restored the first, then applied both in one commit. After a competing edit, GitLab refused the batch. Both reviewers could remove the outdated proposal and apply the surviving one while retaining the competing file change. The fresh reader and API verified both suggestion IDs, badges, exact file and commit ancestry. [41 matched checks on Chromium 151](../../artifacts/gitlab-compatibility/review-batch-20261119/comparison-3/report.md) | The following handoff covers a Developer becoming a Reporter. Other browsers, devices and full membership removal during a batch remain open. |
| Queued review during a role change | Both fresh Reporter views showed both proposals with Apply disabled. The role change preserved the exact file, branch and saved proposals. After restoration the same Developer requeued both and applied them in one direct commit. [22 matched successes and one shared limitation on Chromium 151](../../artifacts/gitlab-compatibility/reviewer-handoff-20261119/comparison-4/report.md) | The [follow-up on build f94f6889](../../artifacts/gitlab-compatibility/reviewer-access-refresh-20261119/comparison-4-5/report.md) closed the open-confirmation gap in Chromium. Fountain disabled Apply and showed the reason at the 3,039 ms sample. After access returned, both original queued proposals and the typed message survived, and one commit saved the exact file. Stock kept Apply enabled at 3,034 ms. [Desktop Firefox 153 on build 5851ca0c](../../artifacts/gitlab-compatibility/reviewer-firefox-20261119/comparison-2/report.md) passed all 25 checks. Fountain disabled confirmation and explained the access change at the 3,086 ms sample. Stock still offered Apply at 3,101 ms. Both retained the queued suggestions and typed message through restoration. On [desktop WebKit 26.5, build 433488dc](../../artifacts/gitlab-compatibility/reviewer-webkit-20261119/comparison-6/report.md), GitLab confirmed current access after restoration and both edits survived reload. The [follow-up on build 269741c1](../../artifacts/gitlab-compatibility/review-navigation-20261119/comparison-2/report.md) fixed an unhandled rejection in the discussion loader. The strict gate remains open. Stock recorded an unhandled rejection and Fountain recorded a queued notes read failing during navigation, also [reproduced on a plain local page](../../artifacts/gitlab-compatibility/review-navigation-20261119/navigation-control.json). Physical devices and production-scale request load also remain open. |
| Overlapping review suggestions | Both editors refused two proposals on line 2 and two proposals sharing line 3. In each refusal the branch, file bytes and proposals survived. The reviewer then applied the first proposal in one case and the second in the other. Proposals on lines 2–3 and 4 applied together in one commit. [65 matched checks on Chromium 151](../../artifacts/gitlab-compatibility/review-overlaps-20261119/comparison-2-1/report.md) | These three cases cover one file on the pinned local deployment. |
| Multi-file review | Both editors applied different suggestions to line one in two identically named files in a single commit. Dismissing the confirmation left the queue intact and sent no apply request. When the backup file changed first, both refused the batch, then applied only the surviving suggestion. The third identical file retained its original bytes and commit throughout. [50 matched Chromium checks and build identities](../../artifacts/gitlab-compatibility/multi-file-20261119/comparison-4/report.md) | The separate live-refresh case below covers a confirmation closed before submission. |
| Open confirmation during a live file change | Both editors kept the two suggestions queued and sent no apply request. The updated Fountain reader displayed GitLab’s reason and the removal instruction on the affected note. After removal the instruction disappeared. Both editors then saved only the surviving change. [28 parity checks and two checks of the new feedback on Chromium 151](../../artifacts/gitlab-compatibility/live-review-20261119/comparison-2-1/report.md) | Other browsers and types of invalidation. |
| Simultaneous review confirmations | On the four-thread profile, two distinct reviewers confirmed one suggestion. Both editors produced one direct commit with the successful reviewer’s message, the exact file and the same Applied note after reload. Fountain also verified the saved suggestion and showed Applied to the second reviewer before reload. [13 matched checks](../../artifacts/gitlab-compatibility/review-feedback-20261119/comparison-3/report.md) | Stock still shows a Git reference error and a stale Apply control until reload. On the earlier [two-thread profile](../../artifacts/gitlab-compatibility/two-reviewers-20261119/comparison-2/report.md), both requests timed out and neither committed. |
| Stale review targets | Both editors protected changed and deleted targets, including a deletion with an identical line elsewhere. The newer file, branch head, note and suggestion ID survived reload. [52 matched checks including visible refusals and the absence of an Applied badge](../../artifacts/gitlab-compatibility/review-feedback-stale-20261119/comparison-3/report.md) | Two live discussions only identified a file change. Both editors applied a suggestion after an insertion shifted its line, but refused a live review when the line itself moved to the end of the file. [16 relocation checks](../../artifacts/gitlab-compatibility/relocated-target-20261119/comparison-1/report.md). |

The [first completed multi-file comparison](../../artifacts/gitlab-compatibility/multi-file-20261119/comparison-3/report.md) recorded an important timing difference. When the backup file changed, stock submitted the queued pair and GitLab returned HTTP 400. On Fountain the open confirmation disappeared and the backup control became disabled before the click. The page showed that the line had changed. Both retained the competing edit, kept the active and standby files intact and allowed the reviewer to apply the active suggestion separately. The live-refresh case above waited for the discussion update on both Chromium runs. It reproduced the closing confirmation on both stock and Fountain and verified the new feedback on Fountain. The stock comparison used attempt 2 after a Gitaly logger restart failed during the [first local cold start](../../artifacts/gitlab-compatibility/live-review-20261119/original-1/report.json). The separate stock badge reading in this attempt sampled the page while the suggestion widget was loading. The collector now waits for either the Apply control or the Applied badge. To replay the earlier observation in a separate checkout, apply the [previous reader check](../../artifacts/gitlab-compatibility/multi-file-20261119/comparison-3/original-reader-check.patch). Its collector hash matches both earlier reports.

On this GitLab revision, `app/services/notes/update_service.rb` calls
`note.suggestions.delete_all` and recreates the records in `update_suggestions`.
A prose-only edit can therefore clear the Applied flag and replace the suggestion
ID on both editors. Preserving that ID across the ordinary Save requires a change
to the GitLab persistence path. [Matched observations](COMPATIBILITY_RESULTS.md).

The opt-in [history deployment](runtime/README.md#reproduce-suggestion-history-across-comment-edits) retains IDs on both editor builds. The [first complete history comparison](../../artifacts/gitlab-compatibility/review-history-20261119/comparison-3/report.md) identified a separate visibility regression in the Fountain integration. Its authenticated API and browser observations cover adding a neighbor, swapping proposals, rejecting an ambiguous duplicate, correcting a refused draft, editing proposal text and range, and changing the target branch.

The [rebuilt native integration and matched control](../../artifacts/gitlab-compatibility/review-history-20261119/comparison-reloaded/report.md) pass all 46 checks on Chromium 151. Both inputs used the same browser, fixture, collector hashes, GitLab revision, backend services, project, actor and data volumes. The [separate stock cold start](../../artifacts/gitlab-compatibility/review-history-20261119/original-4/report.json) exited before sign-in. The completed comparison identifies the successful stock attempt 3 and candidate attempt 4. For a byte-identical rerun from this revision, apply the [archived collector diff](../../artifacts/gitlab-compatibility/review-history-20261119/comparison-3-4/exact-collector.patch) in a separate checkout. It restores the two collection files to the SHA-256 values in both reports. The current driver additionally verifies commit IDs during rollback.

After removing the repaired services and Fountain frontend, packaged GitLab reopened the four original notes on merge requests !148, !149, !152 and !153. The reader badges, note bodies, proposal IDs, application flags, eligibility, file bytes and branch heads matched the repaired records. The database still pointed each surviving Applied suggestion to its original application commit. [Stock rollback observations](../../artifacts/gitlab-compatibility/review-history-stock-20261119/original-1/report.json).

The packaged-service control reproduced the history loss on both editor builds. In one stock observation, the first API read returned the new comment body alongside suggestion 1532 marked Applied. After reload, GitLab returned suggestion 1533 with the flag cleared. The final comparison scores the post-reload rows. It records 29 matching successes and 17 shared unmet checks on packaged services, compared with 46 matching successes on the repair. [Packaged-service comparison](../../artifacts/gitlab-compatibility/review-history-stock-20261119/comparison-reloaded/report.md).

The [immediate batch-authoring attempt](../../artifacts/gitlab-compatibility/review-batch-20261119/comparison-immediate-handoff/report.md) stopped on stock GitLab in both cases. The second proposal appeared in rich text, then the Markdown field was empty when the reviewer switched immediately. Fountain completed that sequence. The comparison remains incomplete. The recorded batch workflow edits the second proposal in rich text and verifies its exact source before posting it.

The local deployment uses GitLab CE 19.5.3. Browser and mobile coverage, additional roles, hosted deployment and the outstanding workflows below remain part of flagship acceptance.

## Earlier matched runs

The first matched original-editor/Fountain source-handoff and application/
prose-edit runs completed 2026-11-16. Four scenarios yield 20 parity, 12 improvement,
zero regression and four shared-limitation outcomes across 36 invariants. Absolute
feature acceptance remains false. [Results and reproduction](COMPATIBILITY_RESULTS.md).
A second matched deletion pair adds 26 parity/four improvement outcomes across
30 checks in two scenarios, with zero regression. [Deletion results](COMPATIBILITY_DELETION_RESULTS.md).
A third matched posted-review pair verifies 21 parity checks for source/range
editing, undo/redo and save/reopen/application. [Review results](COMPATIBILITY_REVIEW_RESULTS.md).
A fourth matched clipboard fixture verifies 84 parity outcomes with explicit
caret/clipboard preconditions and visible captures. Earlier apparent clipboard
wins fail the hardened evidence gate; a timing/selection anomaly remains open.
[Clipboard results](COMPATIBILITY_CLIPBOARD_RESULTS.md).
A fifth corpus verifies 188 parity checks across four paced keyboard/pointer
forward/backward partial selections. Document-loaded receipts and semantic
empty-wrapper handling prevent false claims from earlier observations. Rapid
input remains open. [Directed selection results](COMPATIBILITY_PARTIAL_RESULTS.md).
A sixth corpus verifies 188 parity and 16 improvement checks across four
caret-ready cross-paragraph selections. It repairs a reproduced native link
popup obstructing Save, and demonstrates retained plain-text separation where
the pinned original flattens it. Earlier inadequate profiles remain archived.
[Cross-paragraph results](COMPATIBILITY_CROSSBLOCK_RESULTS.md).
A read-only [capture diagnostic](CAPTURE_DIAGNOSTIC_RESULTS.md) corrects an
earlier mistaken blank-frame assessment using unchanged PNG pixels and twelve
original/native captures. It adds no compatibility score or superiority claim.
Earlier native journeys/API controls remain separate single-sided evidence.

## Comparison contract

Run equivalent user workflows against the original GitLab editor and the native
Fountain replacement. Use the same pinned GitLab CE 19.5.3 image/source revision,
backend implementation, configuration, users/roles and fixture content. Reuse the
actual GitLab application and persistence layer; do not substitute a recreated
website, fake server response or direct document-state injection for UI actions.
API calls may establish fixtures and verify saved results. Record their role.

The existing deployment already provides the required split:

- `runtime/compose.yaml` starts the pinned stock GitLab image with its packaged
  original frontend, persistent task-owned backend volumes and port 5080.
- `runtime/compose.frontend.yaml` adds the verified native frontend asset mount
  and `ENABLE_RSPACK` asset selector. The replacement is built from the matching
  source and mounted read-only; the backend image stays the same.
- `scripts/audit-gitlab-product-baseline.mjs` and the native audit harness provide
  existing authentication, isolation and fixture-verification building blocks.

Inspect actual container image digest, server mounts, application version and
active editable DOM root for each run. The `fountainReplacementInstalled` field
in the upstream pin describes the baseline manifest; it is not live editor proof.
Require the original editable root for the baseline and the native Fountain root
for the candidate within the tested form.

Every matched suite must verify editor build identity before exercising its
fixture. The preflight opens the real issue editor in an isolated browser context.
It checks the GitLab version and pinned image, records the deployed frontend
manifests, and compares the browser's JavaScript response digests against the
deployed asset files. For Fountain, the installed host component and its loaded
runtime each supply their own build fingerprint. The runtime build record names
the package version and source revision. The host fingerprint also covers the
prepared integration files, including the runtime and CSS.

Both input reports carry the expected and observed identity. The comparison
checks those receipts again and prints the identities above its results. A
missing identity, a mismatched digest, or an unexpected editor disqualifies
the entire pair. Older reports remain historical evidence. Rerun their workflows
before making a comparison claim under the current gate.

Switch deployments only after the task application has stopped. Preserve its
backend volumes and never touch unrelated containers. A server repair overlay
must be identical on both sides or the result is not a matched editor comparison.
Declare asset selection as an intentional frontend difference; server features,
permissions and policy must not change between sides. Start with the stock server.

### Reproduce an issue or merge-request comparison

Use the pinned Linux deployment from the [runtime guide](runtime/README.md#reproduce-the-frontend-deployment-and-rollback).
Run from the Fountain checkout with the test container stopped. Choose
`quick-save` for click timing, `reconnect` for a single author retrying, or
`offline-conflict` for two authors editing the same description. Use `composers` for independent descriptions and comments, `stale-reviews` for changed and deleted targets, and `relocated-reviews` for intact lines shifted or moved within a file. Select `concurrent-reviews` to have the fixture owner and a project Developer independently confirm the same posted suggestion. Use `batch-reviews` to author two suggestions on distinct lines, queue and remove them, and apply both with one commit message. A second case changes the target branch after the confirmation has opened. The collector records the actual batch request, both notes, the complete file and the branch commit before and after reload. In the stale case a separate reader checks the refusal while the reviewer keeps the queue open. The reviewer then removes the outdated proposal and explicitly confirms the surviving one. The post-sign-in recording for each local run is `batch-review.webm` beside its raw report. For a byte-identical replay of the single-file batch attempt 3 from commit `2b61739d`, append one LF to `scripts/audit-gitlab-batch-review.mjs` in a disposable checkout. That trailing blank line was removed during the final diff check. The other 27 collector files at that commit match the recorded hashes.

Use `--suite reviewer-handoff` to reproduce a role change during a queued review. The project owner posts two proposals. A dedicated Developer queues both and opens the confirmation. The owner changes that reviewer to Reporter. The collector samples the existing confirmation after three seconds, opens both suggestions in a second tab in the same reviewer session, and verifies the file and notes. The original tab stays open with a typed commit message. After Developer access returns, the reviewer can check access again, inspect the message and confirm both changes. The reviewer recording starts after sign-in. The run restores the fixture account to Guest during cleanup.

Use `--suite overlap-reviews` to compare suggestions on the same line, on lines 2–3 and 3–4, and on lines 2–3 and 4. GitLab’s Changes tab offers **Start another thread** for a line with an existing discussion. In the shared-endpoint case the reviewer starts on line 4 and expands the second proposal to line 3 in Markdown. The collector checks the ranges GitLab actually saved, the batch response, both notes and badges, the entire file and the commit ancestry. For refused batches the reviewer keeps the first proposal in one case and the second in the other.

Use `--suite multi-file-reviews` with the same run ID and attempt number for `--editor original` and `--editor fountain`. The fixture creates `clients/active/config.js`, `clients/backup/config.js` and `clients/standby/config.js` with identical bytes. The reviewer annotates line one of the active file, replaces line one of the backup file and leaves standby untouched. The collector reads all three files at the observed commit SHA, records their last-changing commits and checks the paths in the commit diff. It also dismisses the first confirmation with Escape before submitting. In the competing-edit case, only the backup file changes before the reviewer submits the batch.

```sh
suite=quick-save
run_id="$suite-$(date -u +%Y%m%d-%H%M%S)"
node scripts/run-gitlab-compatibility.mjs --suite "$suite" --run-id "$run_id" --editor fountain
node scripts/run-gitlab-compatibility.mjs --suite "$suite" --run-id "$run_id" --editor original
node scripts/compare-gitlab-compatibility.mjs \
  --original "artifacts/gitlab-compatibility/$run_id/original-1/report.json" \
  --fountain "artifacts/gitlab-compatibility/$run_id/fountain-1/report.json" \
  --output "artifacts/gitlab-compatibility/$run_id/comparison"
```

The quick-save suite records trusted keydown and click events and inspects the
paragraph at click time. The reconnect suite requires the actual description
mutation to fail with the browser offline. Both suites read back the saved
issue from GitLab and reopen it in the browser. The two-author fixture keeps a
Developer’s rich draft open after a failed offline Save. The issue author edits
in Markdown in another session and saves. The API must return that exact text
while the Developer browser is still offline. Each resolution has a fresh issue,
a recording after sign-in and an independent read of the final saved description.

Use `suite=concurrent-issues` for writes after an open conflict and for overlapping issue submissions. In the first two cases, the issue author reopens the saved issue, checks its first edit, and makes a second Markdown save while the Developer is reading the conflict. The collector checks the persisted second edit before recording the disclosure and the explicit discard or overwrite. The third case uses two rich-text drafts and two ordinary Save clicks. Both actual browser request intervals must overlap. The comparator checks each response, the persisted description, the other author's visible draft and warning, and an independent reader.

The concurrent review fixture opens two signed-in browser sessions and gives each reviewer
a distinct commit message. It checks that both confirmed the same suggestion and that the
two browser request intervals overlapped. After both responses, and again after both
reviewers reload, it compares the complete file, commit parent, commit message, note ID
and Applied state. A run missing either response cannot establish the concurrency result.

## Equivalent data and actions

Use one versioned fixture declaration per workflow. Include original Markdown,
raw repository file contents, binary asset digests, diff anchors/ranges and
permissions. Validate these before the first interaction on both sides.

Each side gets a fresh isolated fixture created from that same declaration.
Do not run the second side on a repository/comment mutated by the first side.
Generated record IDs and timestamps may differ and must be mapped explicitly;
source text, asset bytes, document structure, line ranges and permissions may not.
Compare hashes of the fixture inputs and retain each side's setup receipt.

Express the shared workflow as user intent and required state transitions. Use
small editor-specific drivers for actual visible controls, typing, selection,
clipboard and mode switching. A missing control is an observed capability/UX
outcome, not permission to replace the workflow with an API write. Where a source
editing fallback is legitimate, record the fallback and additional actions.
Keep application data setup and post-action API/file verification outside drivers.

Use the same browser build, viewport, operating environment and fonts. Retain
screenshots after transitions finish, inspect them, and compare intended content,
clipping, selection and action state. Pixel equality is not required between two
different editor designs. Include native/browser failures rather than retrying
until only a successful screenshot remains. Never retain credentials, session
storage, CSRF headers or credentialed traces/video.

## Classification per invariant

A workflow may contain several independently classified requirements; do not
hide a regression behind a broad feature-level success label.

| Classification | Required evidence |
| --- | --- |
| Parity | Both observed runs satisfy the same invariant with equivalent saved/application semantics. |
| Improvement | Fountain satisfies a predefined invariant or measurable UX/performance criterion that the original demonstrably fails, under matched conditions. |
| Regression | The original satisfies an invariant and Fountain fails it. |
| Shared limitation | Both observed runs fail the same invariant under the same triggering conditions; retain the unmet product requirement. |

If either side is missing, the environments differ, or the failures cannot be
meaningfully matched, leave `classification` null and mark the comparison pending
or inconclusive. Do not infer a completed pair from an API control, a unit test,
a feature list or a likely common backend cause.

Keep comparison classification separate from absolute feature acceptance.
A shared limitation is not a supported feature. Parity on a destructive or lossy
behavior does not close the desired reliability requirement. An improvement in
one substep does not establish that Fountain is globally better than Tiptap.

## First real workflow set

1. Suggestion source integrity: actual diff selection containing literal
   backslash-n, genuine U+E000, zero-width text and trailing whitespace; insert,
   save, reopen and apply. Compare exact source and resulting file/commit.
2. Posted suggestion editing: change source/range, undo/redo, save/reopen, then
   apply. One symmetric expansion is now matched through both actual UIs, with
   no early source commit. The November 19 follow-ups above add shrinking, asymmetric extension and a changed-line conflict. The later deletion run above covers removed targets. The relocation run above covers an insertion and an explicit line move. The simultaneous confirmation run above covers two reviewers acting on the same suggestion.
3. Empty and whitespace source: separately compare preserved Markdown, intended
   file effect, warnings/confirmation and actual application. Stock GitLab's
   whitespace-only source becomes deletion. The matched empty/one-newline UI
   pair now verifies explicit explanation, affirmative whitespace consent and
   source reopening. Two middle lines and the mixed Unicode whitespace fixture now also have a matched pair. Preserving blank lines in the applied repository file remains open.
4. Prose-only editing of an applied proposal: compare suggestion IDs/application
   metadata and source commit before/after. The original-editor UI pair now
   verifies the same lost Applied flag/recreated identity on both sides. The
   earlier stock API control remains separate attribution evidence.
5. Whole-document rich clipboard and a short cross-mark partial fragment now
   have matched UI fixtures, including keyboard/pointer direction. Cross-paragraph and rectangular body-cell transfers now also have matched
   fixtures and retained visual controls. Ownership and external-app-specific imports remain. Extend table, task-state, media,
   source-switching, review and persistence journeys, followed by permissions,
   concurrency and additional browser/mobile profiles.

Current API controls and negative blank-line receipts must remain visible.
Do not erase the failed intended blank-line application or label reset when
classifying editor compatibility.

## Reproducible evidence and gating

The runner opens a fixed private audit issue to verify the actual browser bundle before collecting any workflow. It compares the issue ID and source digest across both runs. Each workflow then verifies its own active editor. This keeps a failure to open a particular document visible in that workflow. A failed build check disqualifies the run from comparison.

Use immutable run directories containing candidate/source/image/browser hashes,
fixture checksums, each side's actual actions, sanitized errors, exact saved
Markdown, API metadata, asset/file bytes or digests, repository commits and visual
evidence. Keep original and Fountain results side by side with structured deltas
and per-invariant classifications. Preserve failed and incomplete runs.

The paired runner must not silently change acceptance limits, omit failed
features, replace real interactions with model calls or fabricate baseline data.
Fail the regression gate on verified regressions; keep new/unexplained failures
and incomplete required pairs visible. Preserve existing engine/security/source/
performance gates independently. Define any known-limitation policy explicitly,
without converting an unmet feature requirement into a pass.

Implemented: guarded stock/native deployment selection, shared fixture corpus,
real editor-specific drivers, immutable original/candidate receipts, strict
per-invariant comparison and separate regression/feature gates. The original
handoff discovery is retained; predefined immediate and settled profiles run
identically on both sides. The comparator refuses environment/input/instrument
mismatches, missing editor proof and unobserved outcomes.

Next: extend matched workflows to clipboard ownership across custom nodes and additional Unicode
workflows plus rapid-input profiles, tables/tasks/media and then roles/concurrency,
additional browsers/mobile and deployment beyond the local single-container profile. Keep the shared Applied-history
failure open. Add repeated profiles before making frequency/performance claims.
No broad superiority claim or release promotion follows from this initial corpus.

The [table follow-up](COMPATIBILITY_GRID_RESULTS.md) retains an initial semantic
pass that missed visible stray selection paint, followed by a repair and fresh
42-check matched pair. Continue requiring visual controls alongside semantic
checks; scoped parity alone does not establish complete application acceptance.

The [matched task lifecycle](COMPATIBILITY_TASK_RESULTS.md) adds 22 parity/four
improvement checks after repairing a native list-exit Save blocker. The four
improvements concern one empty-task Enter behavior. Prior diagnostic/collector
and startup failures remain retained; wider task/role/platform coverage remains.

The [matched recovery follow-up](COMPATIBILITY_TASK_RECOVERY_RESULTS.md) verifies
populated leaf-item deletion, reopened/reader checkbox updates and actual command
effects. It adds 48 parity/eight correlated improvement checks for one scoped
literal-text boundary, with a working active-root control. Wider task/role/platform
coverage remains; original/native startup failures are retained separately.

The [reader-menu follow-up](COMPATIBILITY_TASK_MENU_RESULTS.md) adds 54 parity
checks for duplicate-target disable/restore/delete, not-applicable retention through
rich editing and authored strike preservation. Heading/prose observer corrections
are retained separately; no product improvement is credited to representation differences.

The [child-task conversion audit](COMPATIBILITY_TASK_CONVERSION_RESULTS.md) records
25 parity, one strict native UI-structure difference and six shared-loss checks.
Both create real linked children, but code indentation is lost by a shared host
helper. The extra native paragraph needs caret-provenance qualification. Neither
gate passes; these findings remain open rather than being relabeled as parity.

The [verified repair follow-up](COMPATIBILITY_TASK_CONVERSION_REPAIR_RESULTS.md)
closes the demonstrated source/title and extra-paragraph gaps with a fresh matched
pair: 66 parity / 14 improvement checks across four workflows. The historical red
report above remains unchanged as evidence of the earlier candidate. An intervening
premature-loading comparison is excluded; broader conversion fidelity remains open.

Follow-up: [quoted/container conversion repair](COMPATIBILITY_TASK_CONTAINER_RESULTS.md)
verifies the separately recorded four-case corpus. Historical results above remain
unchanged; broader application acceptance is still open.

The [matched two-session conflict audit](COMPATIBILITY_CONFLICT_RESULTS.md) verifies
draft retention, current-version disclosure, explicit discard/overwrite and fresh
editing with the same root account. Other actors/roles, offline and late/racing
updates, and simultaneous submits remain open.

The [matched non-author access audit](COMPATIBILITY_ACCESS_RESULTS.md) now verifies
Guest/anonymous boundaries and exposes shared pending-draft loss after live edit
permission revocation. Feature acceptance remains red; repair the host Save
acknowledgement/draft-clearing path and rerun before promoting this workflow.

The [verified revoked-save repair](COMPATIBILITY_ACCESS_REPAIR_RESULTS.md) keeps
the draft, explains revoked authority and avoids a false conflict. Its fresh
matched and independent feedback gates pass; genuine-conflict controls also pass.
Historical red results above remain unchanged; broader acceptance remains open.
