import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const runs = [];
for (const dir of ['results-1', 'paired-1', 'paired-2', 'paired-3']) {
  const raw = JSON.parse(await readFile(dir + '/report.json', 'utf8'));
  const cells = [];
  for (const size of [100, 1000, 5000]) {
    for (const engine of ['fountain', 'tiptap']) {
      const samples = raw.results.filter(r => r.engine === engine && r.size === size).flatMap(r => r.samples);
      if (samples.length !== 22) throw new Error('Incomplete run: ' + dir);
      const times = samples.map(s => s.nextFrameTaskMs).sort((a,b) => a-b);
      const events = samples.flatMap(s => s.eventTiming ? [s.eventTiming.duration] : []);
      cells.push({ size, engine, nativeKeys: times.length, nextFrameTaskMedianMs: times[10],
        nextFrameTaskP95Ms: times[20], reportedEventTimingDurationsMs: events });
    }
  }
  runs.push({ dir, variant: raw.variant || 'release', host: raw.host, chromium: raw.chromium,
    eventTimingThresholdMs: raw.eventTimingThresholdMs, date: raw.date, reportSHA256: await hash(dir + '/report.json'), cells });
}
await writeFile('summary.json', JSON.stringify({
  releaseSHA256: await hash('candidate.tgz'), repairSHA256: await hash('fountainjs-editor-0.5.0-beta.1.tgz'),
  lockSHA256: await hash('pnpm-lock.yaml'), runs
}, null, 2) + '\n');
