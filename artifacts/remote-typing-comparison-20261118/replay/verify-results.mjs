import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import * as Y from 'yjs';

const runs = ['first-control','parent-a','candidate-a','candidate-b','parent-b','fresh-open'];
const reports = Object.fromEntries(await Promise.all(runs.map(async name => [
  name, JSON.parse(await readFile(name+'/report.json','utf8'))
])));
const median = values => {
  const sorted = [...values].sort((a,b) => a-b), mid = Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
};
const round = n => Math.round(n*100)/100;
const summary = { applications:0, consumers:0, cases:[] };
for (const report of Object.values(reports)) {
  assert.deepEqual(report.errors,[]);
  for (const c of report.cases) for (const t of c.trials) {
    assert.equal(t.samples.length,report.word.length);
    summary.applications += t.samples.length;
    summary.consumers++;
  }
}
for (const base of reports['parent-a'].cases) {
  const key = [base.engine,base.size,base.index].join('-');
  const seed = await readFile('parent-a/captures/'+key+'.bin');
  const updates = JSON.parse(await readFile('parent-a/captures/'+key+'.json','utf8')).updates;
  const sha = data => createHash('sha256').update(data).digest('hex');
  assert.equal(sha(seed),base.seedHash);
  assert.equal(sha(JSON.stringify(updates)),base.wireHash);
  const doc = new Y.Doc();
  Y.applyUpdate(doc,seed);
  const roots = new Map([...doc.share].map(([name,type])=>[type,name]));
  const items = {};
  for (const chain of doc.store.clients.values()) for (const record of chain) {
    if (!(record instanceof Y.Item)) continue;
    let type = record.parent;
    while (type?._item) type=type._item.parent;
    const name = roots.get(type);
    assert.ok(name);
    items[name] = (items[name] ?? 0) + 1;
  }
  doc.destroy();
  const result = {key, seedBytes:seed.length, gzipBytes:gzipSync(seed).length, items,
    medianEditBytes:median(base.wireBytes), runs:{}};
  for (const name of runs.slice(1)) {
    const report=reports[name];
    const c=report.cases.find(other=>other.engine===base.engine && other.size===base.size && other.index===base.index);
    assert.equal(c.seedHash,base.seedHash);
    assert.equal(c.wireHash,base.wireHash);
    assert.equal(c.jsonHash,base.jsonHash);
    const medians = {};
    for (const mode of new Set(c.trials.map(t=>t.mode))) {
      const samples=c.trials.filter(t=>t.mode===mode).flatMap(t=>t.samples.slice(report.warmupPerTrial));
      medians[mode]=round(median(samples.map(s=>s.applyMs)));
    }
    result.runs[name]=medians;
  }
  summary.cases.push(result);
}
console.log(JSON.stringify(summary,null,2));
