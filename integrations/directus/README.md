# Directus Data Studio integration

The second flagship is under development against [Directus v12.7.0](https://github.com/directus/directus/releases/tag/v12.7.0), revision `3e3bdddd20bc5f80200452d2b1aad4e3029c95e4`. The first workflow uses the real Data Studio item form and its authenticated API, SQLite and field metadata. The standalone container image is pinned by digest in [the browser audit](audit-stock.mjs).

## Editor contract

| Surface | Contract to retain | Upstream implementation |
| --- | --- | --- |
| HTML field | The registered interface is `input-rich-text-html` on a `text` column. Its form value is an HTML fragment or null. A rich edit emits `input`, and an empty editor emits null. Directus owns item Save. | [Registration](https://github.com/directus/directus/blob/3e3bdddd20bc5f80200452d2b1aad4e3029c95e4/app/src/interfaces/input-rich-text-html/index.ts) · [Field component](https://github.com/directus/directus/blob/3e3bdddd20bc5f80200452d2b1aad4e3029c95e4/app/src/interfaces/input-rich-text-html/input-rich-text-html.vue) |
| Authoring and source fidelity | Fields configure toolbar actions, link protocols, inline styles, custom formats and contributed extensions. Raw HTML editing and the markup-loss warning have separate paths. Immutable fields and comparison views have distinct behavior. | [Field source and upstream tests](https://github.com/directus/directus/tree/3e3bdddd20bc5f80200452d2b1aad4e3029c95e4/app/src/interfaces/input-rich-text-html) |
| Assets and links | Media drawers and image selection use Directus file IDs, project URLs and settings. Saved asset references must reopen with the appropriate account permissions. | [Editor composables](https://github.com/directus/directus/tree/3e3bdddd20bc5f80200452d2b1aad4e3029c95e4/app/src/interfaces/input-rich-text-html/composables) |
| Review and lifecycle | Item Save, drafts, versions, revisions and preview belong to Data Studio. The revision comparison imports the original editor schema directly. Mapping the field interface alone leaves comparison work open. | [Item form](https://github.com/directus/directus/blob/3e3bdddd20bc5f80200452d2b1aad4e3029c95e4/app/src/modules/content/routes/item.vue) · [Comparison](https://github.com/directus/directus/blob/3e3bdddd20bc5f80200452d2b1aad4e3029c95e4/app/src/views/private/components/comparison/use-comparison.ts) |

The separately registered Markdown field and Editor.js JSON block field have different storage contracts. This integration starts with the HTML field. [Other Directus interfaces](https://github.com/directus/directus/tree/3e3bdddd20bc5f80200452d2b1aad4e3029c95e4/app/src/interfaces)

## Reproduce the first workflow

With the FountainJS checkout's dependencies, Docker and Playwright Chromium installed, run from the repository root. The audit uses a disposable container bound to loopback, generates its own credentials, and removes the container on exit.

```sh
docker pull directus/directus@sha256:f197911d949a37d882f781b0381955b851c86625435014cd67bdaf3eabcff2a7
node integrations/directus/audit-stock.mjs
node integrations/directus/build.mjs
node integrations/directus/audit-stock.mjs --paired
```

The stock audit creates a collection and a formatted item, signs in through the browser, edits a paragraph, undoes and redoes it, saves and compares the complete HTML with the API. A fresh signed-in browser reopens the record after the service restarts. Each run records the image ID and loaded stock editor chunk hash.

The handover audit changes only the field's interface metadata on the same item. It checks the mounted Fountain build ID and installed bundle digest, saves through Directus, restarts the service, then switches the field back and saves a further edit in the stock editor. Receipts and screenshots are written under `artifacts/directus-stock/` and `artifacts/directus-handover/`.

The [paired run with reopened editor captures](../../artifacts/directus-handover/31510dd9-e3ff-43bd-9dda-16acf4ed8729/report.json) retained the item heading and bold owner across all three saves. The receipt identifies the installed Fountain bundle by SHA-256 and the loaded stock editor chunk. [Fountain field](../../artifacts/directus-handover/31510dd9-e3ff-43bd-9dda-16acf4ed8729/fountain.png) · [Same item after rollback](../../artifacts/directus-handover/31510dd9-e3ff-43bd-9dda-16acf4ed8729/stock-rollback.png).

In the default desktop theme, the reopened heading, body, bold text and paragraph gaps matched stock on all nine recorded measurements. The same audit exercised a nullable HTML field in both editors. Two Enter presses preserved the intervening empty paragraph through save and reopen. Clearing the whole field saved `null`. Reopening that field and entering only U+200B preserved the character in the stored HTML.

## Configure an HTML field toolbar

In Data Studio, open **Settings → Data Model**, select the collection and open its Fountain HTML field. On the **Interface** tab, use **Toolbar** to select controls, then save. The default includes Bold, Italic, Underline, Heading 1–3, numbered lists, bulleted lists, Block quote, Link and Edit HTML source. Administrators can also enable Heading 4–6, Strikethrough, Subscript, Superscript, Unlink, Undo and Redo. An empty selection of controls leaves the field editable.

The [paired Chromium workflow](../../artifacts/directus-handover/7b6786bb-966f-4dec-8437-6255931d49a7/report.json) applied each mark to a selected word, used the toolbar to undo and redo, and checked the complete stored HTML on both editors. In the [administrator screen](../../artifacts/directus-handover/7b6786bb-966f-4dec-8437-6255931d49a7/toolbar-settings.png), the administrator then enabled only Italic. An author reopened the item, removed that mark with the keyboard, regained editor focus and saved the remaining formatting intact. [Fountain toolbar](../../artifacts/directus-handover/7b6786bb-966f-4dec-8437-6255931d49a7/fountain-toolbar.png) · [Stock toolbar](../../artifacts/directus-handover/7b6786bb-966f-4dec-8437-6255931d49a7/stock-toolbar.png).

### Headings and lists

Select paragraphs and choose a heading level. Choosing the same level again returns them to paragraphs. The numbered and bulleted list buttons wrap selected paragraphs or lift selected items out of an active list. Switching list type from a caret changes the containing list and leaves the caret in the same item, as in stock Data Studio.

Run `node integrations/directus/audit-stock.mjs --structure` after building the extension to reproduce the [structural editing comparison](../../artifacts/directus-handover/fa43cade-3094-4d38-8396-db0eb01428b2/report.json). Both editors produced the same HTML for a release note containing two headings, two list items and inline bold text. The reopened numbered lists had 40 px indentation. After switching the field back, stock Directus edited and saved the same list created in Fountain. [Fountain field](../../artifacts/directus-handover/fa43cade-3094-4d38-8396-db0eb01428b2/fountain-structure.png) · [Stock field](../../artifacts/directus-handover/fa43cade-3094-4d38-8396-db0eb01428b2/stock-structure.png).

### Block quotes

Select paragraphs and click **Block quote** to quote them. To remove quoting from only one paragraph, place the caret there and click the button again. Other quoted paragraphs keep their formatting. At the end of the last quoted paragraph, pressing Enter twice starts an ordinary paragraph after the quote.

Run `node integrations/directus/audit-stock.mjs --quote` after building the extension. The [matched Chromium run](../../artifacts/directus-handover/08ffaa2a-a85e-4394-bbc5-7eb4e8258d20/report.json) checked exact saved HTML after quoting three paragraphs, lifting the middle one, undoing and redoing, and typing outside the quote. After rollback, stock Directus reopened and edited the same Fountain item. The receipt includes the keyboard observations. [Fountain quote](../../artifacts/directus-handover/08ffaa2a-a85e-4394-bbc5-7eb4e8258d20/fountain-quote.png) · [Stock quote](../../artifacts/directus-handover/08ffaa2a-a85e-4394-bbc5-7eb4e8258d20/stock-quote.png).

### Text links

Select text in a paragraph and choose **Link**, or place the caret in an existing link to edit it. The drawer shows its URL, display text, tooltip and **New Tab** setting. Applying a link updates the form. Save the item to persist it. **Unlink** removes the destination and leaves the text in place. The field undo and redo controls also work after unlinking.

Build the extension and run `node integrations/directus/audit-stock.mjs --links` to compare against the stock HTML field. In the [paired Chromium run](../../artifacts/directus-handover/9b23455d-4a18-4054-9393-147954b3fa52/report.json), the two editors saved identical HTML for creating a new-tab link, changing its label and destination, unlinking it, editing a partly bold link with an author-supplied `nofollow` relationship, and inserting a URL at an empty caret with Ctrl+K. Stock Directus then edited the tooltip on that same Fountain-authored link after rollback. [Fountain drawer](../../artifacts/directus-handover/9b23455d-4a18-4054-9393-147954b3fa52/fountain-link.png) · [Stock drawer](../../artifacts/directus-handover/9b23455d-4a18-4054-9393-147954b3fa52/stock-link.png)

The text-link workflow uses Fountain’s URL policy. Image links, field-specific additional protocols and selections spanning multiple blocks still need separate integration work.

### Edit HTML source

Open **Edit HTML source** in the field toolbar. **Apply source** updates the item form. Choose **Save** on the item to write that change to Directus. Closing the drawer discards edits made since opening it. For HTML that the visual editor can represent exactly, the source edit also supports the field’s undo and redo controls.

If an existing fragment would change during visual editing, the field displays its stored HTML as text and offers the same source drawer. Authors can edit that markup directly. Applying HTML that the editor can represent exactly restores visual editing. A field configured as read-only displays the stored source without editing controls.

After building the extension, run `node integrations/directus/audit-stock.mjs --source`. The [Data Studio comparison](../../artifacts/directus-handover/a2f533a8-91ea-4b84-abad-7d65ac5ecb29/report.json) saved and reopened a legacy tag and its single-quoted attribute in both editors. In Fountain, typing into a fragment with mixed CRLF, LF and CR line endings preserved each existing separator in the saved field. On reopening, Backspace between an adjacent CRLF and LF removed the CRLF and retained the LF. The audit checked the saved HTML through the Directus API after each edit. After rollback, stock Directus reopened and edited the item that Fountain had returned to visual mode. [Source drawer](../../artifacts/directus-handover/a2f533a8-91ea-4b84-abad-7d65ac5ecb29/source-drawer.png)

Visual editing of extension-defined HTML, stock’s markup-normalization comparison and confirmation, revision comparison, asset drawers, other stock toolbar actions, non-admin permissions, concurrent authors and the broader item lifecycle remain open.
