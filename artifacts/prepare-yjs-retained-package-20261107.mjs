import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const directory = mkdtempSync(join(tmpdir(), 'fountain-retained-consumer-'));
writeFileSync('artifacts/yjs-retained-package-consumer-20261107.path', directory);
writeFileSync(`${directory}/package.json`, JSON.stringify({ private: true, type: 'module', dependencies: {
  'fountainjs-editor': `file:${resolve('artifacts/yjs-retained-package-20261107.tgz').replaceAll('\\', '/')}`,
  yjs: '13.6.32', typescript: '7.0.2', '@types/node': '26.4.1',
} }, null, 2) + '\n');
writeFileSync(`${directory}/.npmrc`, 'auto-install-peers=false\n');
writeFileSync(`${directory}/check.mjs`, `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { checkRetainedYjs } from './yjs-retained-check.mjs';
const require = createRequire(import.meta.url), mode = process.argv[2];
const load = mode === 'cjs' ? name => require(name) : name => import(name);
assert.match(require.resolve('fountainjs-editor'), /fountain-retained-consumer-[^/\\\\]+[/\\\\]node_modules/);
try { require.resolve('jsdom'); throw new Error('Consumer unexpectedly installed jsdom'); }
catch (error) { assert.equal(error.code, 'MODULE_NOT_FOUND'); }
const count = await checkRetainedYjs(await load('fountainjs-editor'), await load('fountainjs-editor/experimental/yjs-retained'), await load('yjs'), await load('fountainjs-editor/yjs'));
console.log(JSON.stringify({ mode, count, resolved: require.resolve('fountainjs-editor'), document: typeof globalThis.document, window: typeof globalThis.window }));
`);
writeFileSync(`${directory}/yjs-retained-check.mjs`, readFileSync('scripts/fixtures/yjs-retained-check.mjs'));
const consumer = `
import * as Y from 'yjs';
import { composeExtensions, createEditor, defineExtension } from 'fountainjs-editor/core';
import { createRetainedYjsCollaborationExtension, RetainedYjsCollaborationAdapter, captureRetainedCheckpoint, restoreRetainedCheckpoint, type RetainedAdmission, type RetainedAdmissionLease, type RetainedCheckpoint, type DocumentRoomSnapshot } from 'fountainjs-editor/experimental/yjs-retained';
const document = new Y.Doc();
const definition = defineExtension({ name: 'consumer', nodes: { doc: { content: 'block+' }, paragraph: { content: 'inline*', group: 'block' }, text: { group: 'inline', inline: true } } });
declare const checkpoint: RetainedCheckpoint;
declare const snapshot: DocumentRoomSnapshot;
const admission: RetainedAdmission = { schemaVersion: 'consumer-1', load: async (signal: AbortSignal) => signal.aborted ? checkpoint : snapshot, authority: { key: 'paper', bind: async (lease: RetainedAdmissionLease, signal: AbortSignal) => { const protocol: 'retained' = lease.protocol; void protocol; void signal; } } };
const extension = createRetainedYjsCollaborationExtension({ document, admission, user: { id: 'a', name: 'A', color: '#7048e8' } });
const kit = composeExtensions([definition, extension]);
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: [{ type: 'paragraph' }] } });
const captured: Promise<RetainedCheckpoint> = captureRetainedCheckpoint(document, editor.state.schema, 'consumer-1');
captured.then(async value => { const restored = await restoreRetainedCheckpoint(value, editor.state.schema, 'consumer-1'); restored.document.destroy(); });
new RetainedYjsCollaborationAdapter({ document: new Y.Doc(), user: { id: 'b', name: 'B', color: '#7048e8' } });
// @ts-expect-error a host cannot bind a legacy protocol as a retained lease
const badProtocol: RetainedAdmissionLease['protocol'] = 'legacy';
// @ts-expect-error the actual public checkpoint capture requires a schema
captureRetainedCheckpoint(document);
void badProtocol;
`;
writeFileSync(`${directory}/consumer.mts`, consumer);
writeFileSync(`${directory}/consumer.cts`, consumer);
writeFileSync(`${directory}/tsconfig.json`, JSON.stringify({ compilerOptions: {
  target: 'ES2023', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true,
  skipLibCheck: true, noEmit: true, lib: ['ES2023', 'DOM', 'DOM.Iterable'], types: ['node'],
}, files: ['consumer.mts', 'consumer.cts'] }, null, 2));
let fixture = readFileSync('artifacts/retained-adapter-fixture-compiled-20261106.html', 'utf8');
for (const [source, replacement] of [
  ['<link rel="stylesheet" href="/artifacts/cursor-overlay-build-20261106/styles.css">', ''],
  ['Retained collaboration — internal browser audit', 'Retained collaboration package preview'],
  ['Two real Fountain views. Experimental adapter; no public package export.', 'Pause synchronization, edit in both panes, then synchronize and try author undo. This local demo uses the installed beta preview.'],
  ["import * as Y from 'yjs';", "import * as Y from 'yjs';\nimport 'fountainjs-editor/styles.css';"],
  ['/artifacts/cursor-overlay-build-20261106/engine.js', 'fountainjs-editor'],
  ['/artifacts/cursor-overlay-build-20261106/retained-adapter.js', 'fountainjs-editor/experimental/yjs-retained'],
]) {
  if (fixture.split(source).length !== 2) throw new Error('Expected exactly one fixture reference to ' + source);
  fixture = fixture.replace(source, replacement);
}
writeFileSync(join(directory, 'index.html'), fixture);
mkdirSync(join(directory, 'tests', 'fixtures'), { recursive: true });
copyFileSync('tests/fixtures/cross-container-figure.png', join(directory, 'tests', 'fixtures', 'cross-container-figure.png'));
console.log(directory);
