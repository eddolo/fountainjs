import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,relative,dirname,sep} from 'node:path';
const prefix='artifacts/retained-direct-text',read=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex'),file=async path=>({path,sha256:await hash(path)});
const unit=await read(prefix+'-focused-20261106.json');
assert.equal(unit.numTotalTests,275);assert.equal(unit.numPassedTests,269);assert.equal(unit.numFailedTests,6);assert.equal(unit.numPendingTests,0);
const failures=unit.testResults.flatMap(suite=>suite.assertionResults.filter(test=>test.status==='failed').map(test=>({file:relative('.',suite.name).replaceAll('\\','/'),name:test.fullName})));
assert.deepEqual(failures,(await read('artifacts/cursor-overlay-verification-20261106.json')).unit.requiredFailures);
const candidate=unit.testResults.filter(suite=>/\/yjs-retained-(text|nodes|document|adapter|mapping)\.test\.ts$/.test(suite.name.replaceAll('\\','/'))).flatMap(suite=>suite.assertionResults);
assert.equal(candidate.length,253);assert(candidate.every(test=>test.status==='passed'));
const full=await read(prefix+'-full-source-20261106.json');assert.equal(full.numTotalTests,4405);assert.equal(full.numPassedTests,4399);assert.equal(full.numFailedTests,6);assert.equal(full.numPendingTests,0);
assert.deepEqual(full.testResults.flatMap(suite=>suite.assertionResults.filter(test=>test.status==='failed').map(test=>({file:relative('.',suite.name).replaceAll('\\','/'),name:test.fullName}))),failures);
const discovered=execFileSync('rg',['--files','tests','examples/extensions','-g','*.test.ts','-g','*.test.tsx'],{encoding:'utf8'}).trim().split(/\r?\n/).map(path=>path.replaceAll('\\','/')).sort();
assert.deepEqual(full.testResults.map(suite=>relative('.',suite.name).replaceAll('\\','/')).sort(),discovered);
const checks=await read(prefix+'-checks-20261106.json');
assert.deepEqual(checks.map(check=>check.check),['typecheck','focused','full-source','build','test:api','test:headless','test:package','test:server-runtimes','test:budget','test:performance','browser','manual-types']);
for(const check of checks)assert.equal(check.exitCode,['focused','full-source','test:budget'].includes(check.check)?1:0);
const browser=await read(prefix+'-browser-20261106.json');assert.equal(browser.stats.expected,99);
for(const key of ['unexpected','flaky','skipped'])assert.equal(browser.stats[key],0);
assert.equal(browser.config.workers,1);
assert((await readFile('artifacts/retained-adapter-browser-20261106.config.ts','utf8')).includes('headless:true'));
assert(browser.config.projects.every(project=>project.retries===0));
const journeys=[];function visit(suites){for(const suite of suites){visit(suite.suites??[]);for(const spec of suite.specs??[])for(const test of spec.tests??[])journeys.push({name:spec.title,...test});}}visit(browser.suites);
assert.equal(journeys.length,99);assert.equal(new Set(journeys.map(test=>test.projectName+'\0'+test.name)).size,99);
const perProject={};
for(const journey of journeys){
 assert.equal(journey.status,'expected');assert.equal(journey.results.length,1);perProject[journey.projectName]=(perProject[journey.projectName]??0)+1;
 const attachment=journey.results[0].attachments.find(item=>item.name==='runtime-modules');assert(attachment?.body);
 const urls=JSON.parse(Buffer.from(attachment.body,'base64').toString('utf8'));
 assert(urls.includes('/artifacts/cursor-overlay-build-20261106/engine.js'));assert(!urls.some(url=>url.startsWith('/src/')));
}
assert.deepEqual(perProject,{chromium:33,firefox:33,webkit:33});
const replacement=journeys.filter(test=>test.name==='replaces marked text and deletes natively while preserving peer edits through keyboard history');assert.equal(replacement.length,3);
for(const test of replacement){const attachment=test.results[0].attachments.find(item=>item.name==='native-replacement-result');assert(attachment?.body);const peers=JSON.parse(Buffer.from(attachment.body,'base64').toString('utf8'));assert(peers.every(peer=>peer.status==='connected'));assert.deepEqual(peers[0].json,peers[1].json);assert.equal(peers[0].json.content[0].content[0].text,'Aha');assert.equal(peers[0].json.content[1].content[0].text,'BetaZ');}
const large=journeys.filter(test=>test.name==='edits a thousand-paragraph shared document with native input and independent author history');assert.equal(large.length,3);
for(const test of large){const attachment=test.results[0].attachments.find(item=>item.name==='bulk-document-result');assert(attachment?.body);const result=JSON.parse(Buffer.from(attachment.body,'base64').toString('utf8'));assert.equal(result.paragraphs,1000);assert(result.peers.every(peer=>peer.status==='connected'&&peer.json.content.length===1001));assert.deepEqual(result.peers[0].json,result.peers[1].json);}
const nodes=await Promise.all(['es','cjs'].map(mode=>read(`${prefix}-node-${mode}-20261106.json`)));assert(nodes.every(row=>row.passed===18&&row.domRequired===false));
const runtime=await read('artifacts/retained-read-public-runtime-before-20261106.json');assert.equal(runtime.length,171);for(const saved of runtime)assert.equal(await hash(saved.path),saved.sha256);
for(const path of ['api-surface.json','scripts/check-build-budgets.mjs','scripts/check-performance-budgets.mjs','tests/yjs-document-range.test.ts','src/yjs/index.ts','.github/workflows/ci.yml','src/yjs/retained-nodes.ts','src/yjs/retained-text.ts'])assert.equal((await readFile(path,'utf8')).replaceAll('\r\n','\n'),execFileSync('git',['-c','core.longpaths=true','show',`9d7793dc:${path}`],{encoding:'utf8',maxBuffer:16*1024*1024}).replaceAll('\r\n','\n'));
const path='src/yjs/retained-document.ts',current=await readFile(path,'utf8'),before=execFileSync('git',['show',`9d7793dc:${path}`],{encoding:'utf8'});
assert.deepEqual(current.match(/^const (?:VERSION|MAX_[A-Z_]+) = .+$/gm),before.match(/^const (?:VERSION|MAX_[A-Z_]+) = .+$/gm));
const budget=await readFile(prefix+'-test-budget-20261106.log','utf8');assert.equal((budget.match(/^- .*exceeds its budget/gm)??[]).length,3);assert(!budget.includes('- dist/styles.css exceeds'));
const canary='artifacts/cursor-overlay-build-20261106',mapped=new Set();
for(const name of await readdir(canary))if(name.endsWith('.map')){const path=resolve(canary,name),map=await read(path);for(let i=0;i<map.sources.length;i++){const source=resolve(dirname(path),map.sources[i]);if(source.startsWith(resolve('src')+sep)){assert.equal(map.sourcesContent[i],await readFile(source,'utf8'));mapped.add(relative('.',source).replaceAll('\\','/'));}}}
assert(mapped.has('src/yjs/retained-document.ts'));
const fullBaseline=execFileSync('git',['rev-parse','9d7793dc'],{encoding:'utf8'}).trim(),objectFormat=execFileSync('git',['rev-parse','--show-object-format'],{encoding:'utf8'}).trim();assert(['sha1','sha256'].includes(objectFormat));
const tree=new Map(execFileSync('git',['ls-tree','-r','-z',fullBaseline,'src'],{encoding:'utf8'}).split('\0').filter(Boolean).map(row=>{const [metadata,path]=row.split('\t');return [path,metadata.split(' ')[2]];}));
const baselineFolder='artifacts/retained-direct-text-baseline-20261106-build',baselineSource=resolve('artifacts/retained-direct-text-baseline-20261106-source-'+fullBaseline),baselineMapped=new Set();
for(const name of await readdir(baselineFolder))if(name.endsWith('.map')){const path=resolve(baselineFolder,name),map=await read(path);for(let i=0;i<map.sources.length;i++){const source=resolve(dirname(path),map.sources[i]);if(!source.startsWith(baselineSource+sep))continue;const relativeSource=relative(baselineSource,source).replaceAll('\\','/'),data=Buffer.from(map.sourcesContent[i]);assert.equal(createHash(objectFormat).update(`blob ${data.length}\0`).update(data).digest('hex'),tree.get(relativeSource),relativeSource);baselineMapped.add(relativeSource);}}
assert.deepEqual([...baselineMapped].sort(),[...mapped].sort());
execFileSync(process.execPath,['artifacts/compare-retained-direct-text-20261106.mjs'],{stdio:'pipe'});const comparison=await read(prefix+'-comparison-20261106.json');
const evidence=[];async function walk(folder){for(const item of await readdir(folder,{withFileTypes:true})){const path=folder+'/'+item.name;if(item.isDirectory())await walk(path);else evidence.push(await file(path));}}await walk(prefix+'-browser-20261106');assert.equal(evidence.filter(item=>item.path.endsWith('.webm')).length,99);
const visual=[];for(const name of await readdir(prefix+'-visual-20261106'))visual.push(await file(prefix+'-visual-20261106/'+name));assert.equal(visual.filter(item=>item.path.endsWith('.webm')).length,6);assert.equal(visual.filter(item=>item.path.endsWith('.png')).length,12);
const sources=['artifacts/run-retained-direct-text-probes-20261106.ps1','artifacts/measure-retained-node-reads-20261106.mjs','src/yjs/retained-document.ts','tests/yjs-retained-document.test.ts','artifacts/profile-retained-edit-20261106.mjs','artifacts/retained-seed-interop-20261106.mjs','artifacts/retained-session-20261106.mjs','artifacts/build-retained-baseline.mjs','artifacts/build-cursor-overlay-canary-20261106.mjs','artifacts/retained-adapter-node-20261106.mjs','artifacts/retained-read-controlled-cost-20261106.mjs','artifacts/compare-retained-direct-text-20261106.mjs','artifacts/curate-retained-direct-text-20261106.mjs','artifacts/verify-retained-direct-text-20261106.mjs','artifacts/run-retained-direct-text-checks-20261106.ps1','artifacts/retained-direct-text-browser-20261106.config.ts','artifacts/cursor-navigation-browser-20261106.config.ts','artifacts/retained-adapter-browser-20261106.config.ts','tests/manual/retained-adapter-real.spec.ts','tests/manual/cursor-native-reference.spec.ts','artifacts/retained-adapter-fixture-20261106.html'];
const receipt={date:'2026-11-06',baselineCommit:fullBaseline,goalComplete:false,publication:'Local only; no GitHub/npm/website update.',defaultAdapterSwitched:false,source:await Promise.all(sources.map(file)),focused:{...await file(prefix+'-focused-20261106.json'),total:275,passed:269,failed:6,candidatePassed:253,requiredFailures:failures,fullSourceSuiteRerun:true},browser:{...await file(prefix+'-browser-20261106.json'),distinctPassed:99,failed:0,skipped:0,retries:0,workers:1,perProject,compiledRuntimeVerifiedInEveryJourney:true,currentSourceMapModules:mapped.size,recordings:99,evidence,visualReview:'Large-document editing and native marked replacement/history captures and sampled recording frames reviewed in all three desktop engines. Not full playback or physical-device/IME certification.'},compiledNode:{journeys:36,formats:nodes},checks,logs:await Promise.all(checks.map(check=>file(check.log))),compiledArtifacts:await Promise.all((await readdir(canary)).map(name=>file(canary+'/'+name))),measurements:await Promise.all(['cost-baseline','cost-candidate','session-baseline','session-candidate','interop','comparison'].map(name=>file(`${prefix}-${name}-20261106.json`))),comparison,invariants:{publicRuntimeAndCssFilesByteIdentical:171,apiSnapshotUnchanged:true,limitsUnchanged:true,defaultRequiredFailuresUnchanged:true,defaultAdapterUnchanged:true,ciWorkflowUnchanged:true},visualArtifacts:visual,baselineCompiledSourceProof:{commit:fullBaseline,verifiedGitBlobModules:baselineMapped.size,sourceSetMatchesCurrent:true},open:['Six default-adapter retention failures','Full projection and large-document editing cost','History/wire-state growth and compaction semantics','Legacy migration and safe adoption','Three existing size overruns','Complete fresh CI required for release','Overall editor parity remains incomplete']};
receipt.fullSource={...await file(prefix+'-full-source-20261106.json'),total:full.numTotalTests,passed:full.numPassedTests,failed:6,files:discovered.length,requiredFailures:failures};
receipt.nodeReadMeasurements=await Promise.all(['baseline','candidate'].map(kind=>file(prefix+'-counts-'+kind+'-20261106.json')));
receipt.documents=await Promise.all(['docs/YJS_RETAINED_DIRECT_TEXT_AUDIT.md','docs/ROADMAP.md','docs/TIPTAP_PARITY.md','CHANGELOG.md'].map(file));
receipt.editProfile=await Promise.all(['artifacts/retained-direct-text-edit-after-20261106.json','artifacts/retained-direct-text-edit-after-20261106.cpuprofile.gz','artifacts/retained-direct-text-edit-after-frames-20261106.json'].map(file));
receipt.visualSources=await file(prefix+'-visual-sources-20261106.json');
await writeFile(prefix+'-verification-20261106.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({candidatePassed:253,requiredDefaultFailures:6,compiledNodeJourneys:36,browserJourneys:99,sourceMapModules:mapped.size,publicRuntimeFilesUnchanged:171,sessionTrialsPerBuild:3,editsPerTrial:1024,curatedVisualArtifacts:visual.length}));
