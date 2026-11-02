// Reproduce the source-data experiment without modifying the production harness.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

let script = readFileSync('scripts/check-markdown-conformance.mjs', 'utf8');
const substitutions = [
  ["import { readFileSync, readdirSync } from 'node:fs';", "import { readFileSync, readdirSync } from 'node:fs';\nimport { reconstructSource } from './html-source-reconstruction-prototype-20261102.mjs';\nimport { createInertHTMLInlineExtension, createInertHTMLRawTextExtension } from '../dist/html-inert.js';"],
  ['...(preserveAnchors ? HTMLAnchorExtension.nodes : {}),', "...(preserveAnchors ? { ...HTMLAnchorExtension.nodes, ...createInertHTMLInlineExtension({tags:['foo','bar','warning','bab','c2c','b2','responsive-image']}).nodes, ...createInertHTMLRawTextExtension({tags:['script','style','textarea']}).nodes } : {}),"],
  ['const actual = semanticProjection(HTMLExporter.export(doc, { document: false }));', 'const fragment = HTMLExporter.export(doc, { document: false });\n    const actual = semanticProjection(preserveAnchors ? reconstructSource(fragment) : fragment);'],
];
for (const [from, to] of substitutions) {
  if (script.split(from).length !== 2) throw Error('Probe no longer matches its source harness: ' + from);
  script = script.replace(from, to);
}
// Moving the generated script one directory sideways changes only local imports.
script = script.replaceAll("from './check-markdown-", "from '../scripts/check-markdown-");
const generated = 'artifacts/html-source-conformance-probe-20261102.mjs';
writeFileSync(generated, script);
const result = spawnSync(process.execPath, [generated, '--report', '--anchor-report', '--document-flow-report', '--show-mismatches'], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
