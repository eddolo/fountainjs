import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,relative,dirname} from 'node:path';
const read=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const file=async path=>({path,bytes:(await stat(path)).size,sha256:await hash(path)});
const baseline=await read('artifacts/retained-checkpoint-verification-20261106.json');
const focused=await read('artifacts/retained-room-store-focused-20261106.json'),full=await read('artifacts/retained-room-store-full-source-20261106.json');
assert.equal(focused.numTotalTests,61);assert.equal(focused.numPassedTests,61);assert.equal(focused.numFailedTests,0);
assert.equal(full.numTotalTests,baseline.fullSource.total+26);assert.equal(full.numPassedTests,baseline.fullSource.passed+26);assert.equal(full.numFailedTests,6);assert.equal(full.numPendingTests,0);
const failures=full.testResults.flatMap(suite=>suite.assertionResults.filter(test=>test.status==='failed').map(test=>({file:relative('.',suite.name).replaceAll('\\','/'),name:test.fullName})));
assert.deepEqual(failures,baseline.fullSource.requiredFailures);
const discovered=execFileSync('rg',['--files','tests','examples/extensions','-g','*.test.ts','-g','*.test.tsx'],{encoding:'utf8'}).trim().split(/\r?\n/).map(path=>path.replaceAll('\\','/')).sort();
assert.deepEqual(full.testResults.map(row=>relative('.',row.name).replaceAll('\\','/')).sort(),discovered);
const checks=await read('artifacts/retained-room-store-checks-20261106.json');assert.deepEqual(checks.map(row=>row.check),['types','full-source','build','api','headless','budget']);
for(const row of checks)assert.equal(row.exitCode,['full-source','budget'].includes(row.check)?1:0);
const budget=await readFile('artifacts/retained-room-store-budget-20261106.log','utf8');
assert.deepEqual(budget.split(/\r?\n/).filter(line=>line.startsWith('- ')&&line.includes('exceeds its budget')),['- dist/core.js exceeds its budget by 0.1 KiB','- all ESM runtime code exceeds its budget by 76.0 KiB','- all CommonJS runtime code exceeds its budget by 59.9 KiB']);
const browser=await read('artifacts/retained-room-store-browser-20261106.json');assert.equal(browser.stats.expected,9);for(const key of ['unexpected','flaky','skipped'])assert.equal(browser.stats[key],0);assert.equal(browser.config.workers,1);
const journeys=[];function visit(suites){for(const suite of suites){visit(suite.suites??[]);for(const spec of suite.specs??[])for(const test of spec.tests??[])journeys.push({name:spec.title,...test})}}visit(browser.suites);assert.equal(journeys.length,9);
const recordings=[],projects={};
for(const journey of journeys){
 assert.equal(journey.status,'expected');assert.equal(journey.results.length,1);projects[journey.projectName]=(projects[journey.projectName]??0)+1;
 const attachments=journey.results[0].attachments,urls=JSON.parse(Buffer.from(attachments.find(item=>item.name==='runtime-modules').body,'base64').toString('utf8'));
 assert(!urls.some(path=>path.startsWith('/src/')));assert(urls.includes('/artifacts/retained-room-store-build-20261106/room-store.js'));
 assert(attachments.some(item=>item.name==='trace'));const recording=await file(attachments.find(item=>item.name==='video').path);assert(recording.bytes>0);recordings.push({project:journey.projectName,name:journey.name,...recording});
 const result=JSON.parse(Buffer.from(attachments.find(item=>item.name==='room-result').body,'base64').toString('utf8'));assert.deepEqual(result.stored,result.writer);assert.deepEqual(result.peer,result.writer);assert.equal(result.writerStatus,'connected');assert.equal(result.peerStatus,'connected');
}
assert.deepEqual(projects,{chromium:3,firefox:3,webkit:3});
const compiled=new Set(),directory='artifacts/retained-room-store-build-20261106';
for(const name of await readdir(directory))if(name.endsWith('.map')){
 const path=directory+'/'+name,map=await read(path);
 for(let i=0;i<map.sources.length;i++){
  const source=resolve(dirname(path),map.sources[i]),local=relative('.',source).replaceAll('\\','/');
  if(!local.startsWith('src/'))continue;
  assert.equal(map.sourcesContent[i],await readFile(source,'utf8'),`stale compiled source ${local}`);compiled.add(local);
 }
}
for(const name of ['src/yjs/retained-room-store.ts','src/yjs/retained-checkpoint.ts','src/yjs/retained-adapter.ts'])assert(compiled.has(name));
const publicBaseline=await read('artifacts/retained-model-reuse-public-after-20261106.json');assert.equal(publicBaseline.length,171);for(const row of publicBaseline)assert.equal(await hash(row.path),row.sha256,`changed public runtime ${row.path}`);
const unchanged=['src/yjs/index.ts','package.json','scripts/check-build-budgets.mjs'];
const verifiedUnchanged=[];
for(const path of unchanged){
 const original=execFileSync('git',['show',`a978cfb9:${path}`],{encoding:'buffer',stdio:['ignore','pipe','pipe']});assert.equal(createHash('sha256').update(original).digest('hex'),await hash(path));verifiedUnchanged.push(path);
}
const nodes=await Promise.all(['es','cjs'].map(mode=>read(`artifacts/retained-room-store-node-${mode}-20261106.json`)));for(const node of nodes){assert.equal(node.passed,8);assert.equal(node.dom,false)}
const visualFolder='artifacts/retained-room-store-visual-20261106',visual=await Promise.all((await readdir(visualFolder)).filter(name=>/\.(png|webm)$/.test(name)).sort().map(name=>file(visualFolder+'/'+name)));
assert.equal(visual.filter(row=>row.path.endsWith('.webm')).length,9);assert.equal(visual.filter(row=>row.path.endsWith('.png')).length,24);
const sources=['src/yjs/retained-room-store.ts','src/yjs/retained-checkpoint.ts','tests/yjs-retained-room-store.test.ts','tests/manual/retained-room-store-real.spec.ts','artifacts/build-retained-room-store-20261106.mjs','artifacts/retained-room-store-fixture-20261106.html','artifacts/retained-room-store-browser-20261106.config.ts','artifacts/retained-room-store-node-20261106.mjs','artifacts/curate-retained-room-store-20261106.mjs','artifacts/run-retained-room-store-checks-20261106.ps1','artifacts/verify-retained-room-store-20261106.mjs'];
const receipt={date:'2026-11-06',baselineCommit:'a978cfb9',goalComplete:false,publication:'Local only; no default adapter switch or publication.',source:await Promise.all(sources.map(file)),fullSource:{...await file('artifacts/retained-room-store-full-source-20261106.json'),total:full.numTotalTests,passed:full.numPassedTests,failed:6,skipped:0,files:discovered.length,requiredFailures:failures},focused:{passed:61,newRoomStoreCases:26,checkpointCases:35},checks,logs:await Promise.all(checks.map(row=>file(row.log))),browser:{passed:9,projects,recordings,compiledModules:compiled.size,scope:'Browser-local single-authority reference; not a deployed server.'},compiledNode:{passed:16,cases:nodes},visualArtifacts:visual,visualReview:'Three-engine handoff stage/final captures and sampled recording filmstrips reviewed. Initial partial-undo assertion strengthened to exact pre-freeze document equality. Not full playback or physical devices.',invariants:{publicRuntimeAndCssByteIdentical:171,verifiedUnchanged},documents:await Promise.all(['docs/YJS_RETAINED_ROOM_FENCING_AUDIT.md','docs/YJS_RETAINED_COMPACTION_DIAGNOSTIC.md','docs/ROADMAP.md','docs/TIPTAP_PARITY.md','CHANGELOG.md'].map(file)),open:['Six default-adapter failures','Durable/distributed provider fencing and recovery','Fresh-room auxiliary/anchor and offline-edit migration','Compaction and legacy adoption','Large-room batch cost and throughput','Three size overruns and fresh complete release CI','Overall parity']};
await writeFile('artifacts/retained-room-store-verification-20261106.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({newCases:26,fullPassed:full.numPassedTests,requiredDefaultFailures:6,browserPassed:9,nodePassed:16,sourceModules:compiled.size,publicFilesUnchanged:171}));
