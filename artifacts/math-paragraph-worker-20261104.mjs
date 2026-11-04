import * as root from '../dist/index.js';
import * as server from '../dist/html-server.js';
import * as word from '../dist/docx.js';
import { PagesExtension } from '../dist/pages.js';
import { exerciseMathParagraph } from './exercise-math-paragraph-20261104.mjs';
const spec = root.composeExtensions([...root.StarterKit.extensions, PagesExtension, root.createMathExtension()]).schema;
export default { async fetch(request) {
  return Response.json(exerciseMathParagraph(root, root, server, word, await request.arrayBuffer(), spec));
} };
