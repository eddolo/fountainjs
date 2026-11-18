# Release review with Vue 3

Open this folder in a terminal with Node.js 20.19+ on the 20.x line, or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Enter a release name and review notes. Select a phrase and choose **Bold**. Expand **Document JSON** to inspect the text and its mark. Choose **Save review** and reload to reopen the saved title, paragraphs and formatting.

`ReviewForm.vue` binds a `FountainDocumentField` to a Vue shallow ref using `v-model`. The field owns its editor. Its schema uses the supplied paragraph, text and bold definitions, with the history plugin for undo and redo. The toolbar uses the exposed editor handle to run the standard Fountain command. Keep the field options stable so Vue updates preserve the editing surface.

The form stores one review in this browser’s local storage for this origin. Saving replaces the previous review. In a shared application, send the title and document JSON to your persistence service from `saveReview`. Run `npm run build` to compile the single-file component for production.
