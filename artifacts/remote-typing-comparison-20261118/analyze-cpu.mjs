import {SourceMap} from 'node:module';
import {readFile,readdir,writeFile} from 'node:fs/promises';
const folder=process.argv[2] || 'cpu';
const variant=JSON.parse(await readFile(folder+'/report.json')).variant;
const packageName={remote:'fountain-remote-candidate',repair:'fountain-path-fix',release:'fountainjs-editor'}[variant];
const asset=(await readdir(folder+'/maps')).filter(f=>f.endsWith('.js.map'));
const sources=new Map();
for(const name of asset) sources.set(name.slice(0,-4),new SourceMap(JSON.parse(await readFile(folder+'/maps/'+name))));
const output=[];
const fountainMaps=new Map();
for(const file of (await readdir(folder)).filter(n=>n.endsWith('.cpuprofile'))){
  const profile=JSON.parse(await readFile(folder+'/'+file));
  const parents=new Map();
  const frames=new Map();
  for(const node of profile.nodes) {
    const frame=node.callFrame;
    const asset=frame.url.split('/').pop();
    let mapped=sources.get(asset)?.findEntry(frame.lineNumber,frame.columnNumber);
    if(mapped?.originalSource?.includes('/fountainjs-editor/dist/')){
      const name=mapped.originalSource.split('/').at(-1);
      if(!fountainMaps.has(name)) fountainMaps.set(name,new SourceMap(JSON.parse(await readFile('node_modules/'+packageName+'/dist/'+name+'.map'))));
      mapped=fountainMaps.get(name).findEntry(mapped.originalLine,mapped.originalColumn);
    }
    const path=mapped?.originalSource?.replace(/^.*\/src\//,'src/') ?? '';
    const label=path ? path+':'+(mapped.originalLine+1) : frame.functionName || '(native)';
    frames.set(node.id,{label,name:frame.functionName});
    for(const child of node.children??[]) parents.set(child,node.id);
  }
  const self=new Map(), total=new Map();
  for(const [i,id] of profile.samples.entries()){
    const us=profile.timeDeltas[i];
    const labels=new Set();
    for(let at=id;at;at=parents.get(at)){
      const frame=frames.get(at);
      if(at===id)self.set(frame.label,(self.get(frame.label)??0)+us);
      labels.add(frame.label);
    }
    for(const label of labels)total.set(label,(total.get(label)??0)+us);
  }
  const ranked=m=>[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([label,us])=>({label,ms:Math.round(us/100)/10}));
  const entry={file,self:ranked(self),inclusive:ranked(total)};
  output.push(entry);
  console.log(file,JSON.stringify(entry.self.slice(0,6)));
}
await writeFile(folder+'/summary.json',JSON.stringify(output,null,2)+'\n');
