import { performance } from 'node:perf_hooks';
import {
  CoreExtension,
  Schema,
  composeExtensions,
  createCollaborationExtension,
  createEditor,
} from '../dist/index.js';
import { ServerHTMLImporter } from '../dist/html-server.js';

const sizes = [100, 1_000, 5_000, 10_000];
const iterations = 12;
const limits = Object.freeze({
  localP95: { 100: 20, 1000: 45, 5000: 175, 10000: 350 },
  remoteP95: { 100: 25, 1000: 55, 5000: 200, 10000: 400 },
  fullRemoteP95: { 100: 35, 1000: 140, 5000: 600, 10000: 1_200 },
  // A 10x document should stay near-linear. The allowance absorbs timer noise
  // while still failing the former quadratic matcher (roughly 100x growth).
  maximumCurveRatio: 15,
  longSessionHeap: 8 * 1024 * 1024,
  retainedHeap: 16 * 1024 * 1024,
  serverHTMLP95: { 100: 35, 1000: 120, 5000: 500, 10000: 900 },
  serverHTMLMaximumCurveRatio: 15,
  serverHTMLHeap: 48 * 1024 * 1024,
});

function content(size, suffix = '') {
  return {
    type: 'doc',
    content: Array.from({ length: size }, (_, index) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: `Paragraph ${index}${index === size - 1 ? suffix : ''}` }],
    })),
  };
}

function htmlContent(size) {
  return Array.from({ length: size }, (_, index) => (
    `<p data-index="${index}"><strong>Paragraph ${index}</strong> with <a href="https://example.com/${index}">a safe link</a>.</p>`
  )).join('');
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function sample(run, count = iterations) {
  run();
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    run();
    values.push(performance.now() - started);
  }
  return {
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

function localCurve(size) {
  const kit = composeExtensions([CoreExtension]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: content(size) });
  let offset = `Paragraph ${size - 1}`.length;
  const result = sample(() => {
    const accepted = editor.dispatch(editor.state.createTransaction().insertText([size - 1, 0], offset, '!'));
    if (!accepted) throw new Error('Local benchmark transaction was rejected.');
    offset += 1;
  });
  editor.destroy();
  return result;
}

function remoteCurve(size) {
  let context;
  const collaboration = createCollaborationExtension({
    adapter: () => ({ connect: (value) => { context = value; } }),
  });
  const kit = composeExtensions([CoreExtension, collaboration]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: content(size) });
  let offset = `Paragraph ${size - 1}`.length;
  const result = sample(() => {
    const transaction = editor.state.createTransaction().insertText([size - 1, 0], offset, '!');
    if (!context.applyRemoteTransaction(transaction, { origin: 'performance-budget' })) {
      throw new Error('Incremental remote benchmark transaction was rejected.');
    }
    offset += 1;
  });
  editor.destroy();
  return result;
}

function fullRemoteCurve(size) {
  let context;
  const collaboration = createCollaborationExtension({
    adapter: () => ({ connect: (value) => { context = value; } }),
  });
  const kit = composeExtensions([CoreExtension, collaboration]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: content(size) });
  const documents = Array.from({ length: Math.max(6, Math.floor(iterations / 2) + 1) }, (_, index) => (
    content(size, ` remote-${index + 1}`)
  ));
  let revision = 0;
  const result = sample(() => {
    const document = documents[revision % documents.length];
    revision += 1;
    if (!context.applyRemoteDocument(document, { origin: 'json-boundary-budget' })) {
      throw new Error('Full-document remote benchmark update was rejected.');
    }
  }, Math.max(5, Math.floor(iterations / 2)));
  editor.destroy();
  return result;
}

function format(value) { return `${value.toFixed(2)} ms`; }

const local = new Map();
const remote = new Map();
const fullRemote = new Map();
const failures = [];
const serverHTML = new Map();
const serverHTMLSchema = new Schema(composeExtensions([CoreExtension]).schema);
const serverHTMLImporter = new ServerHTMLImporter({
  maxInputBytes: 2 * 1024 * 1024,
  maxNodes: 100_000,
});

for (const size of sizes) {
  const localResult = localCurve(size);
  const remoteResult = remoteCurve(size);
  const fullRemoteResult = fullRemoteCurve(size);
  local.set(size, localResult);
  remote.set(size, remoteResult);
  fullRemote.set(size, fullRemoteResult);
  console.log(`${size.toLocaleString('en-US')} blocks: local p50 ${format(localResult.median)}, p95 ${format(localResult.p95)}; incremental remote p50 ${format(remoteResult.median)}, p95 ${format(remoteResult.p95)}; JSON boundary p50 ${format(fullRemoteResult.median)}, p95 ${format(fullRemoteResult.p95)}`);
  if (localResult.p95 > limits.localP95[size]) failures.push(`${size}-block local p95 ${format(localResult.p95)} exceeds ${limits.localP95[size]} ms`);
  if (remoteResult.p95 > limits.remoteP95[size]) failures.push(`${size}-block incremental remote p95 ${format(remoteResult.p95)} exceeds ${limits.remoteP95[size]} ms`);
  if (fullRemoteResult.p95 > limits.fullRemoteP95[size]) failures.push(`${size}-block JSON-boundary p95 ${format(fullRemoteResult.p95)} exceeds ${limits.fullRemoteP95[size]} ms`);
}

for (const size of sizes) {
  const html = htmlContent(size);
  const result = sample(() => {
    const document = serverHTMLImporter.parse(html, serverHTMLSchema);
    if (document.childCount !== size) throw new Error('Server HTML benchmark returned an incomplete document.');
  }, 6);
  serverHTML.set(size, result);
  console.log(`${size.toLocaleString('en-US')} HTML blocks: server parse p50 ${format(result.median)}, p95 ${format(result.p95)}`);
  if (result.p95 > limits.serverHTMLP95[size]) {
    failures.push(`${size}-block server HTML p95 ${format(result.p95)} exceeds ${limits.serverHTMLP95[size]} ms`);
  }
}

const serverHTMLRatio = serverHTML.get(10_000).median / Math.max(serverHTML.get(1_000).median, 0.01);
console.log(`server HTML 1,000→10,000 median growth: ${serverHTMLRatio.toFixed(2)}x / ${limits.serverHTMLMaximumCurveRatio}x`);
if (serverHTMLRatio > limits.serverHTMLMaximumCurveRatio) {
  failures.push(`server HTML curve grew ${serverHTMLRatio.toFixed(2)}x from 1,000 to 10,000 blocks`);
}

for (const [name, curve] of [['local', local], ['incremental remote', remote]]) {
  const oneThousand = curve.get(1_000).median;
  const tenThousand = curve.get(10_000).median;
  const ratio = tenThousand / Math.max(oneThousand, 0.01);
  console.log(`${name} 1,000→10,000 median growth: ${ratio.toFixed(2)}x / ${limits.maximumCurveRatio}x`);
  if (ratio > limits.maximumCurveRatio) failures.push(`${name} curve grew ${ratio.toFixed(2)}x from 1,000 to 10,000 blocks`);
}

if (typeof globalThis.gc !== 'function') {
  failures.push('retained-memory budget requires Node --expose-gc');
} else {
  let sessionEditor = createEditor({
    schema: composeExtensions([CoreExtension]).schema,
    content: content(1_000),
  });
  globalThis.gc();
  const sessionBaseline = process.memoryUsage().heapUsed;
  let sessionOffset = 'Paragraph 999'.length;
  for (let index = 0; index < 2_000; index += 1) {
    sessionEditor.dispatch(sessionEditor.state.createTransaction().insertText([999, 0], sessionOffset, '!'));
    sessionOffset += 1;
  }
  globalThis.gc();
  const sessionGrowth = Math.max(0, process.memoryUsage().heapUsed - sessionBaseline);
  console.log(`2,000-edit live-session heap growth: ${(sessionGrowth / 1024 / 1024).toFixed(2)} MiB / ${(limits.longSessionHeap / 1024 / 1024).toFixed(0)} MiB`);
  if (sessionGrowth > limits.longSessionHeap) failures.push(`long session grew by ${(sessionGrowth / 1024 / 1024).toFixed(2)} MiB`);
  sessionEditor.destroy();
  sessionEditor = undefined;

  globalThis.gc();
  const baseline = process.memoryUsage().heapUsed;
  for (let index = 0; index < 40; index += 1) {
    const kit = composeExtensions([CoreExtension]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: content(250) });
    const unsubscribe = editor.subscribe(() => undefined);
    editor.dispatch(editor.state.createTransaction().insertText([249, 0], 0, '!'));
    unsubscribe();
    editor.destroy();
  }
  globalThis.gc();
  globalThis.gc();
  const retained = Math.max(0, process.memoryUsage().heapUsed - baseline);
  console.log(`destroyed-editor retained heap: ${(retained / 1024 / 1024).toFixed(2)} MiB / ${(limits.retainedHeap / 1024 / 1024).toFixed(0)} MiB`);
  if (retained > limits.retainedHeap) failures.push(`destroyed editors retained ${(retained / 1024 / 1024).toFixed(2)} MiB`);

  globalThis.gc();
  const htmlBaseline = process.memoryUsage().heapUsed;
  let parsedHTMLDocument = serverHTMLImporter.parse(htmlContent(10_000), serverHTMLSchema);
  globalThis.gc();
  const htmlGrowth = Math.max(0, process.memoryUsage().heapUsed - htmlBaseline);
  console.log(`retained 10,000-block server HTML document: ${(htmlGrowth / 1024 / 1024).toFixed(2)} MiB / ${(limits.serverHTMLHeap / 1024 / 1024).toFixed(0)} MiB`);
  if (parsedHTMLDocument.childCount !== 10_000) failures.push('server HTML memory fixture returned an incomplete document');
  if (htmlGrowth > limits.serverHTMLHeap) failures.push(`server HTML document retained ${(htmlGrowth / 1024 / 1024).toFixed(2)} MiB`);
  parsedHTMLDocument = undefined;
}

if (failures.length) throw new Error(`Performance budget failed:\n- ${failures.join('\n- ')}`);
