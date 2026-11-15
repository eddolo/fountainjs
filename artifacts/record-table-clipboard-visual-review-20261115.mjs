import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const directory = 'artifacts/gitlab-native-table-clipboard-20261115/';
const hash = async path => createHash('sha256').update(await readFile(new URL(path, root))).digest('hex');
const paths = ['controls-toolbar-1440.png', 'controls-toolbar-1100.png', 'controls-toolbar-390.png',
  'controls-media-1440.png', 'table-document-copy.png', 'original-after-restart.png',
  'recording-72s.png', 'recording-75s.png', 'recording-90s.png', 'recording-170s.png',
  'recording-177s.png', 'recording-65-to-94s.png'].map(name => directory + name);
for (const [browser, name] of [['chromium', 'external-rich-table.png'], ['chromium', 'merged-grid-expanded.png'],
  ['firefox', 'rich-grid-pasted.png'], ['firefox', 'merged-slice-in-document.png']])
  paths.push(`artifacts/controls-final-clipboard-browser-20261115/table-clipboard-real-copie-8765d-real-table-document-targets-${browser}/${name}`);
const review = {
  date: new Date().toISOString(),
  scope: 'Reviewed named screenshots and sampled recording frames; not a full-movie review',
  recordingSha256: 'ee060af68f82852717bf042cfe6a091db782495688ea77bfc74924b0d21dff7f',
  images: await Promise.all(paths.map(async path => ({ path, sha256: await hash(path) }))),
  observations: [
    'At 1440px all controls share one toolbar row. At 1100px Attach, Paste Markdown and Media wrap together instead of leaving Media alone.',
    'At 390px the media panel flows below the common tools without horizontal clipping; primary Properties, left-aligned common actions and divided red deletion are distinguishable.',
    'Native grid copy/paste visibly retains headers, bold cells and referenced notes. Three tables, rendered math and the uploaded figure remain coherent in the saved reader after restart.',
    'The 75-second recording frame shows all three saved Grid body notes and their backlinks; the contact sheet samples one frame per second from 65 through 94 seconds.',
    'Chromium/Firefox screenshots show retained rich table text, color, merged geometry and copied bold note bodies in their independent and same-editor destinations.'
  ],
  limits: ['Independent rich text uses its own browser-default presentation, not the Fountain stylesheet.',
    'Physical Safari, installed WebKit OS format transport, cut/move identity and broader product/assistive-technology acceptance remain open.']
};
await writeFile(new URL(directory + 'visual-review.json', root), JSON.stringify(review, null, 2) + '\n');
console.log(`Recorded ${review.images.length} explicitly reviewed screenshots/frames.`);
