# Format boundaries

FountainJS keeps one typed document tree and treats external formats as boundaries. Presentation HTML is not the application state.

## JSON

JSON is the lossless persistence format. Nodes use stable type names, optional attributes, child content, and marks. Always import through the receiving `Schema`; unknown types and invalid attributes are rejected.

## HTML

`HTMLExporter` produces a full responsive document or a fragment. Text and attributes are escaped. Only HTTP(S), email, telephone, relative, fragment, and supported image-data URLs survive link and image serialization. Alignment, text colour, subscript, superscript, semantic hard breaks, tasks, tables, and images retain their HTML meaning.

`HTMLImporter` supports headings, paragraphs, quotes, preformatted code, ordered/bullet/task lists, images and figures, tables, dividers, line breaks, common inline marks, and math nodes when the receiving schema includes `MathExtension`. Math HTML stores TeX separately from its computed accessible label, so import does not persist renderer markup or mutate JSON. It uses `DOMParser`, so a DOM shim is required in Node.js.

## Markdown

The Markdown boundary supports headings, paragraphs, quotes, fenced code, lists, tables, media, dividers, links, strong/emphasis/strike/code marks, highlight extension syntax, and `$...$`/`$$...$$` math when `MathExtension` is present.

Lean source uses the ordinary `code_block` with `language: "lean"`, so JSON,
HTML, Markdown fenced code, and plain text remain portable even when no Lean
provider is configured. Provider descriptors and proof results are view/runtime
state and are never serialized with the document.

Markdown cannot represent every custom schema attribute. Use JSON when lossless round-tripping is required.

## Plain text

`TextExporter` joins block text with configurable separators. It intentionally discards marks and structure, but preserves math as its TeX source, and is suitable for search indexing, previews, and explicit AI context.

## Security boundary

Treat imported content and AI output as untrusted. The included AI controller only accepts replacement text, and the HTML exporter escapes document data. Custom node renderers and adapters remain application code and must enforce their own validation.
