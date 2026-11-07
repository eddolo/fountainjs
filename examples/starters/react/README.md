# FountainJS React starter

Use Node.js 20.19+ or 22.12+. Run these commands in this directory.

```sh
npm install
npm run dev
```

Open the address Vite prints. Select text and use **Bold** in the toolbar.
Open **Document JSON** to see the resulting mark, then try **Undo** and **Redo**.
Reloading starts from the sample document.

In `main.jsx`, `useFountain` manages the editor and `FountainComposer` mounts
the supplied toolbar and editing surface. The `onUpdate` callback reads
portable document JSON. Use that value if you add persistence to your app.

Use `npm run build` to create the static site in `dist/`. This project uses
the published FountainJS beta pinned in `package.json`.

[React demo](https://eddolo.github.io/fountainjs/demos/react-article.html) · [Developer guide](https://eddolo.github.io/fountainjs/developers.html#surfaces)
