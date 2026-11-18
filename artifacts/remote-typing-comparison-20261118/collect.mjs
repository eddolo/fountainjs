import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const digest = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const groups=['measured','matched-repair','remote-first','repair-second','remote-second',
  'apply-parent-1','apply-candidate-1','apply-candidate-2','apply-parent-2'];
const runs=[];
for(const name of groups){
  const file=name+'/report.json';
  const report=JSON.parse(await readFile(file));
  if(report.errors.length>0) throw Error(file+' has page errors');
  const rows=[];
  for(const size of report.sizes) for(const engine of ['fountain','tiptap']){
    const cases=report.results.filter(r=>r.size===size&&r.engine===engine);
    const samples=cases.flatMap(r=>r.samples);
    const lengths=cases.flatMap(r=>r.measuredUpdates);
    if(cases.length!==2 || samples.length!==22 || lengths.length!==22 || cases.some(r=>r.peersReopened!==3 || r.visibility.some(v=>v!=='visible'))) throw Error(file+' incomplete');
    const metrics={};
    for(const key of ['localFrameTaskMs','peerFrameTaskMs','peerDomMs','peerApplyMs']){
      if(!Object.hasOwn(samples[0],key))continue;
      const values=samples.map(s=>s[key]).sort((a,b)=>a-b);
      metrics[key]={median:values[10],p95:values[20]};
    }
    rows.push({size,engine,keys:samples.length,updates:lengths.length,minBytes:Math.min(...lengths),maxBytes:Math.max(...lengths),metrics});
  }
  runs.push({name,variant:report.variant||'release',browser:report.browser,date:report.date,sha256:await digest(file),rows});
}
const archives={};
for(const file of ['candidate.tgz','repair.tgz','fountainjs-editor-0.5.0-beta.1.tgz']) archives[file]=await digest(file);
await writeFile('comparison.json',JSON.stringify({archives,lock:await digest('pnpm-lock.yaml'),runs},null,2)+'\n');
console.log('Versions and broadcasts verified for',runs.reduce((n,r)=>n+r.rows.reduce((m,s)=>m+s.keys,0),0),'measured keys.');
