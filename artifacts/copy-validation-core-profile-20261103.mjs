import { Session } from 'node:inspector/promises';
import { performance } from 'node:perf_hooks';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TraceMap, originalPositionFor } from '../node_modules/.pnpm/@jridgewell+trace-mapping@0.3.31/node_modules/@jridgewell/trace-mapping/dist/trace-mapping.mjs';
import { CoreExtension, composeExtensions, createEditor, createCollaborationExtension } from '../dist/index.js';

// Diagnostic only: no gate threshold, warm-up, sampling, or acceptance change.
const session = new Session(); session.connect();
await session.post('Profiler.enable');
await session.post('Profiler.setSamplingInterval', { interval: 200 });
const mappings = new Map();
const reports = [];
for (const size of [1_000, 10_000]) for (const mode of ['local', 'remote']) {
  let context;
  const collaboration = createCollaborationExtension({ adapter: () => ({ connect: value => { context = value; } }) });
  const kit = composeExtensions(mode === 'local' ? [CoreExtension] : [CoreExtension, collaboration]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content:
    Array.from({ length: size }, (_, index) => ({ type: 'paragraph', content: [{ type: 'text', text: `Paragraph ${index}` }] })) } });
  let offset = `Paragraph ${size - 1}`.length;
  await session.post('Profiler.start');
  const cpu = process.threadCpuUsage(), started = performance.now();
  for (let index = 0; index < 4_000; index++) {
    const transaction = editor.createTransaction().insertText([size - 1, 0], offset++, '!');
    if (!(mode === 'local' ? editor.dispatch(transaction) : context.applyRemoteTransaction(transaction, { origin: 'profile' }))) {
      throw new Error('Diagnostic edit rejected');
    }
  }
  const wallMs = performance.now() - started, used = process.threadCpuUsage(cpu);
  const { profile } = await session.post('Profiler.stop');
  const filename = `artifacts/copy-validation-core-${mode}-${size}-20261103.cpuprofile`;
  writeFileSync(filename, JSON.stringify(profile));
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const self = new Map();
  profile.samples.forEach((id, index) => self.set(id, (self.get(id) ?? 0) + profile.timeDeltas[index]));
  const frames = [...self].sort((left, right) => right[1] - left[1]).slice(0, 18).map(([id, microseconds]) => {
    const frame = nodes.get(id).callFrame;
    let original;
    if (frame.url.startsWith('file:')) {
      const path = fileURLToPath(frame.url) + '.map';
      if (existsSync(path)) {
        if (!mappings.has(path)) mappings.set(path, new TraceMap(JSON.parse(readFileSync(path, 'utf8'))));
        original = originalPositionFor(mappings.get(path), { line: frame.lineNumber + 1, column: frame.columnNumber });
      }
    }
    return { name: frame.functionName, selfMs: microseconds / 1000,
      source: original?.source, line: original?.line, generatedURL: frame.url };
  });
  const report = { size, mode, edits: 4000, wallMs, threadCpuMs: (used.user + used.system) / 1000, frames, filename };
  reports.push(report); console.log(JSON.stringify({ size, mode, wallMs, threadCpuMs: report.threadCpuMs, top: frames.slice(0, 7) }));
  editor.destroy();
}
session.disconnect();
writeFileSync('artifacts/copy-validation-core-profile-report-20261103.json', JSON.stringify(reports, null, 2) + '\n');
