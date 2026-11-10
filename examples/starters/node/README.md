# FountainJS Node.js starter

Use Node.js 20.19 or later. Run these commands in the extracted directory.

```sh
npm install
npm start
```

The starter reads `sample.md` and prints validated Fountain JSON. It uses
the published beta, with no browser, DOM shim, build step, or server.

```sh
node convert.mjs sample.md > document.json
node convert.mjs sample.md html > fragment.html
node convert.mjs sample.md markdown > roundtrip.md
node convert.mjs your-page.html > document.json
```

The Markdown round trip preserves unchanged UTF-8 source, including line
endings and an optional byte-order mark. Invalid UTF-8 is rejected.
HTML input uses the separate server importer and writes reported
conversion issues to stderr. The HTML output is a fragment that your app can
embed in its reader with the app's own resource policy.

In `convert.mjs`, `fountainjs-editor/core` provides the schema class, Markdown
parser, and exporters. The pinned beta exports its built-in schema definition
from the package root. `fountainjs-editor/html/server` is loaded only for HTML
input. The schema validates the JSON before export.

[Server conversion demo](https://eddolo.github.io/fountainjs/demos/node-markdown.html) · [Developer guide](https://eddolo.github.io/fountainjs/developers.html#starter-node)
