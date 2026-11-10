import { readFile, writeFile } from 'node:fs/promises';

// Run the same native-input journeys through the actual built public default.
// The legacy conflict peer deliberately uses the separate compatibility entry.
let html = await readFile('artifacts/retained-adapter-fixture-20261106.html', 'utf8');
html = html.replace("import {RetainedYjsCollaborationAdapter} from '/src/yjs/retained-adapter.ts';",
  "import {YjsCollaborationAdapter as RetainedYjsCollaborationAdapter} from '/dist/yjs.js';")
  .replaceAll('/src/yjs/legacy.ts', '/dist/yjs-legacy.js')
  .replaceAll('/src/index.ts', '/dist/index.js')
  .replaceAll('/src/styles.css', '/dist/styles.css')
  .replace('Retained collaboration — internal browser audit', 'Default collaboration — browser audit')
  .replace('experimental retained adapter', 'public default adapter');
if (html.includes('/src/')) throw new Error('Default browser fixture still imports project source.');
await writeFile('artifacts/yjs-default-fixture.html', html);
