import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const unitPath='artifacts/retained-adapter-unit-20261106.json',browserPath='artifacts/retained-adapter-browser-final-20261106.json';
const unit=await read(unitPath),browser=await read(browserPath),checks=await read('artifacts/retained-adapter-checks-20261106.json');
const failures=unit.testResults.flatMap(s=>s.assertionResults.filter(t=>t.status==='failed').map(t=>({file:relative('.',s.name).replaceAll('\\','/'),name:t.fullName})));
assert.equal(unit.numTotalTests,4304);assert.equal(unit.numPassedTests,4298);assert.equal(failures.length,6);assert(failures.every(t=>t.file==='tests/yjs-document-range.test.ts'));
const candidateNames=['yjs-retained-adapter.test.ts','replace-node-provenance.test.ts','yjs-retained-document.test.ts','yjs-retained-text.test.ts','yjs-retained-nodes.test.ts','yjs-retained-mapping.test.ts'];
const focused=unit.testResults.filter(s=>candidateNames.some(n=>s.name.endsWith('/'+n)||s.name.endsWith('\\'+n))).flatMap(s=>s.assertionResults);
assert.equal(focused.length,165);assert(focused.every(t=>t.status==='passed'));
assert.equal(browser.stats.expected,21);assert.equal(browser.stats.unexpected,3);assert.equal(browser.stats.skipped,0);
const browserFailures=[];function visit(suites){for(const suite of suites){visit(suite.suites??[]);for(const spec of suite.specs??[])for(const test of spec.tests??[])if(test.status!=='expected')browserFailures.push({name:spec.title,project:test.projectName,status:test.status})}}visit(browser.suites);
assert.equal(browserFailures.length,3);assert(browserFailures.every(t=>t.name==='right-arrow navigation crosses a remote presence without consuming a character step'));
for(const check of checks)assert.equal(check.exitCode,check.check==='test:budget'?1:0);
const nodes=await Promise.all(['es','cjs'].map(mode=>read(`artifacts/retained-adapter-node-${mode}-20261106.json`)));assert(nodes.every(n=>n.passed===12&&n.domRequired===false));
const mapped=new Set();const canary='artifacts/retained-adapter-build-20261106';
for(const file of await readdir(canary))if(file.endsWith('.map')){const path=resolve(canary,file),map=await read(path);for(let i=0;i<map.sources.length;i++){const source=resolve(dirname(path),map.sources[i]);if(source.startsWith(resolve('src')+'/')||source.startsWith(resolve('src')+'\\')){assert.equal(map.sourcesContent[i],await readFile(source,'utf8'));mapped.add(relative('.',source).replaceAll('\\','/'))}}}
for(const name of ['retained-adapter','retained-selection','retained-document','retained-text'])assert(mapped.has(`src/yjs/${name}.ts`));
const packageJSON=await read('package.json');assert(!Object.keys(packageJSON.exports).some(key=>key.includes('retained')));
const evidence=[];async function walk(folder){for(const file of await readdir(folder,{withFileTypes:true})){const path=`${folder}/${file.name}`;if(file.isDirectory())await walk(path);else evidence.push({path,sha256:await hash(path)})}}await walk('artifacts/retained-adapter-browser-final-20261106');
const sourcePaths=['src/core/transaction/replace-node-step.ts','src/yjs/index.ts','src/yjs/retained-adapter.ts','src/yjs/retained-selection.ts','src/yjs/retained-document.ts','src/yjs/retained-text.ts','tests/yjs-retained-adapter.test.ts','tests/replace-node-provenance.test.ts','tests/manual/retained-adapter-real.spec.ts'];
const receipt={date:'2026-11-06',publication:'Local only, user preference; no push/npm/site update.',adoptionReady:false,defaultAdapterSwitched:false,publicPackageExportsUnchanged:true,
 source:await Promise.all(sourcePaths.map(async path=>({path,sha256:await hash(path)}))),
 unit:{path:unitPath,sha256:await hash(unitPath),total:unit.numTotalTests,passed:unit.numPassedTests,failed:unit.numFailedTests,pending:unit.numPendingTests,requiredFailures:failures,focusedCandidatePassed:focused.length},
 browser:{path:browserPath,sha256:await hash(browserPath),passed:browser.stats.expected,failed:browser.stats.unexpected,skipped:browser.stats.skipped,requiredFailures:browserFailures,headless:true,workers:1,nativeInput:true,splitCaret:'Approached using native End/Left and verified offset 3; separate required Right-arrow regression remains failing.',visualReview:['Chromium converged quote and retained figure','Firefox converged split and retained figure','Chromium and WebKit reopened Planning content','Chromium saved-video frame at 1.7 seconds'],videos:evidence.filter(f=>f.path.endsWith('.webm')).length,evidence},
 compiledNode:{journeys:nodes.reduce((sum,n)=>sum+n.passed,0),formats:nodes,currentSourceMapModules:mapped.size},checks,
 limits:'Unchanged. Public-build gate remains red for core ESM and aggregate ESM/CJS. Existing performance/heap checks pass; these do not certify experimental adapter performance.',
 next:'Fix native arrow navigation around remote caret widgets; then incremental candidate projection, large-document bounds/compaction and protocol adoption work.'};
await writeFile('artifacts/retained-adapter-verification-20261106.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({units:receipt.unit.passed,knownUnitFailures:failures.length,focused:focused.length,browserPassed:21,requiredBrowserFailures:3,nodeJourneys:24,currentMapModules:mapped.size,recordedVideos:receipt.browser.videos,adoptionReady:false}));
