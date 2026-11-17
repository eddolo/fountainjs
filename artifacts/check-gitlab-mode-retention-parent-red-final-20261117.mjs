import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),base=resolve(root,'artifacts/gitlab-mode-retention-20261117');
const before=JSON.parse(await readFile(resolve(base,'before/manifest.json')));
const originalInstall=JSON.parse(Buffer.from(before.files['artifacts/gitlab-native-browser-install/install.json'].base64,'base64'));
const currentInstall=JSON.parse(await readFile(resolve(root,'artifacts/gitlab-native-browser-install/install.json')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const relative='app/assets/javascripts/vue_shared/components/markdown/markdown_editor.vue';
const target=resolve(currentInstall.source,relative);
assert.equal(execFileSync('docker',['inspect','--format','{{.State.Running}}','fountain-gitlab-integration-baseline-1'],{encoding:'utf8'}).trim(),'false');
const current=await readFile(target);assert.equal(sha(current),currentInstall.files[relative]);
const prepared=await readFile(resolve(root,'integrations/gitlab/fixtures/markdown-editor-prepared.vue'),'utf8');
assert.equal(sha(prepared),'697704a24572acc75d9f4d5b6225f3ad9c32a3b32410fabc09a6743d8aa0fca9');
const legacy=prepared.replace('renderMarkdown(markdown) {','renderMarkdown(markdown, { noHeaderAnchors = false, signal } = {}) {')
 .replace('no_header_anchors: !this.supportsTableOfContents,','no_header_anchors: noHeaderAnchors || !this.supportsTableOfContents,')
 .replace('return axios\n        .post(url, { text: markdown })','const request = signal ? axios.post(url, { text: markdown }, { signal }) : axios.post(url, { text: markdown });\n      return request');
const require=createRequire(resolve(currentInstall.source,'package.json')),prettier=require('prettier'),options=await prettier.resolveConfig(target);
const value=await prettier.format(legacy,{...options,filepath:target,plugins:(options.plugins??[]).map(name=>require.resolve(name)),tailwindConfig:resolve(currentInstall.source,options.tailwindConfig)});
assert.equal(sha(value),originalInstall.files[relative]);
const out=resolve(base,'mounted-parent-red-final');await mkdir(out);await writeFile(resolve(out,'previous-renderer.vue'),value);await writeFile(resolve(out,'candidate-renderer.vue'),current);
let status;
try{
 await writeFile(target,value);
 try{execFileSync('corepack',['yarn','jest','--runInBand','spec/frontend/vue_shared/components/markdown/fountain_mode_retention_spec.js'],{cwd:currentInstall.source,stdio:'inherit'});status=0;}
 catch(error){status=error.status;}
}finally{
 assert.equal(sha(await readFile(target)),sha(value),'Unexpected renderer edits during control.');
 await writeFile(target,current);
 assert.equal(sha(await readFile(target)),currentInstall.files[relative]);
}
assert.equal(status,1,'The previous parent boundary must fail the mounted ownership requirements.');
await writeFile(resolve(out,'receipt.json'),JSON.stringify({parentBoundary:'Byte-exact previous installed MarkdownEditor renderer',previousSha256:sha(value),testSha256:sha(await readFile(resolve(currentInstall.source,'spec/frontend/vue_shared/components/markdown/fountain_mode_retention_spec.js'))),candidateSha256:sha(current),candidateCleanupComponents:true,exitCode:status,candidateRestoredExact:true,scope:'Mounted component counterfactual with mocked transport; not a real backend browser comparison.'},null,2)+'\n');
console.log('Mounted previous-parent red control failed as expected; candidate renderer restored exactly.');
