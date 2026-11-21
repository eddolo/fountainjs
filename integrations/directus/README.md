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

In Data Studio, open **Settings → Data Model**, select the collection and open its Fountain HTML field. On the **Interface** tab, use **Toolbar** to select controls, then save. The default includes Bold, Italic, Underline, Heading 1–3, numbered lists and bulleted lists. Administrators can also enable Heading 4–6, Strikethrough, Subscript, Superscript, Undo and Redo. An empty selection of controls leaves the field editable.

The [paired Chromium workflow](../../artifacts/directus-handover/7b6786bb-966f-4dec-8437-6255931d49a7/report.json) applied each mark to a selected word, used the toolbar to undo and redo, and checked the complete stored HTML on both editors. In the [administrator screen](../../artifacts/directus-handover/7b6786bb-966f-4dec-8437-6255931d49a7/toolbar-settings.png), the administrator then enabled only Italic. An author reopened the item, removed that mark with the keyboard, regained editor focus and saved the remaining formatting intact. [Fountain toolbar](../../artifacts/directus-handover/7b6786bb-966f-4dec-8437-6255931d49a7/fountain-toolbar.png) · [Stock toolbar](../../artifacts/directus-handover/7b6786bb-966f-4dec-8437-6255931d49a7/stock-toolbar.png).

### Headings and lists

Select paragraphs and choose a heading level. Choosing the same level again returns them to paragraphs. The numbered and bulleted list buttons wrap selected paragraphs or lift selected items out of an active list. Switching list type from a caret changes the containing list and leaves the caret in the same item, as in stock Data Studio.

Run `node integrations/directus/audit-stock.mjs --structure` after building the extension to reproduce the [structural editing comparison](../../artifacts/directus-handover/fa43cade-3094-4d38-8396-db0eb01428b2/report.json). Both editors produced the same HTML for a release note containing two headings, two list items and inline bold text. The reopened numbered lists had 40 px indentation. After switching the field back, stock Directus edited and saved the same list created in Fountain. [Fountain field](../../artifacts/directus-handover/fa43cade-3094-4d38-8396-db0eb01428b2/fountain-structure.png) · [Stock field](../../artifacts/directus-handover/fa43cade-3094-4d38-8396-db0eb01428b2/stock-structure.png).

The private field currently admits fragments it can serialize exactly. It displays other source as text to protect the stored field during evaluation. Full editing of those documents remains required for parity. Other stock toolbar actions, asset drawers, raw and comparison modes, extension-defined HTML, non-admin permissions, concurrent authors and the broader lifecycle matrix remain open.
