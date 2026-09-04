# Format boundaries

FountainJS keeps one typed document tree and treats external formats as boundaries. Presentation HTML is not the application state.

## JSON

JSON is the lossless persistence format. Nodes use stable type names, optional attributes, child content, and marks. Always import through the receiving `Schema`; unknown types and invalid attributes are rejected.

## HTML

`HTMLExporter` produces a full responsive document or a fragment. Text and attributes are escaped. Only approved protocols survive link and media serialization. Alignment, text colour, subscript, superscript, semantic hard breaks, tasks, tables, images, native audio/video with tracks, downloadable file metadata, and provider-approved embeds retain their HTML meaning.

`HTMLImporter` supports headings, paragraphs, quotes, preformatted code, ordered/bullet/task lists, images and figures, audio, video, files, approved embeds, tables, dividers, line breaks, common inline marks, and math nodes when their receiving schema includes the corresponding extension. Media is reconstructed through schema validation: an iframe is discarded unless the configured `MediaExtension` recognizes its canonical HTTPS provider URL and accepts every permission/sandbox attribute. Math HTML stores TeX separately from its computed accessible label, so import does not persist renderer markup or mutate JSON. The importer uses `DOMParser`, so a DOM shim is required in Node.js.

## Markdown

The Markdown boundary supports headings, paragraphs, quotes, fenced code, lists, tables, images, dividers, links, strong/emphasis/strike/code marks, highlight extension syntax, and `$...$`/`$$...$$` math when `MathExtension` is present. Audio, video, file, and embed nodes export as readable destination links plus optional caption text because CommonMark has no portable typed representation for them; re-import therefore produces links, not media nodes. Use validated JSON or HTML when their type and attributes must round-trip.

Lean source uses the ordinary `code_block` with `language: "lean"`, so JSON,
HTML, Markdown fenced code, and plain text remain portable even when no Lean
provider is configured. Provider descriptors and proof results are view/runtime
state and are never serialized with the document.

Markdown cannot represent every custom schema attribute. Use JSON when lossless round-tripping is required.

## Plain text

`TextExporter` joins block text with configurable separators. It intentionally discards marks and structure, but preserves math as its TeX source and media as readable `[Audio: …]`, `[Video: …]`, `[File: …]`, or `[Embed: …]` projections. It is suitable for search indexing, previews, and explicit AI context.

## Security boundary

Treat imported content and AI output as untrusted. The included AI controller only accepts replacement text, and the HTML exporter escapes document data. The default media module denies arbitrary iframes and validates playback, track, file, sandbox, and permission attributes; a custom embed resolver and every upload adapter remain trusted application code. Hosts must enforce their own storage authorization, content-type verification, malware scanning, and retention policies.
