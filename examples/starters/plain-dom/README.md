# FountainJS plain DOM starter

Use Node.js 20.19+ or 22.12+. Run these commands in this directory.

```sh
npm install
npm run dev
```

Open the address Vite prints. Type in the paragraph, choose **Insert callout**,
edit the callout, then use **Undo** and **Redo**. Open **Document JSON** to see
the callout's content and type. Reloading starts from the sample document.

In `main.js`, `defineExtension` registers the callout's schema and DOM
representation. `insertNode` inserts it through a Fountain transaction.
Change the DOM tag or CSS, then use the JSON panel to see how the document
stays independent of presentation.

Use `npm run build` to create the static site in `dist/`. This project uses
the published FountainJS beta pinned in `package.json`.

[Plain DOM demo](https://eddolo.github.io/fountainjs/demos/plain-dom-notes.html) · [Developer guide](https://eddolo.github.io/fountainjs/developers.html#extensions)
