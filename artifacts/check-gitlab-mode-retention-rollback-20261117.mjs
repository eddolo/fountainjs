import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const root=process.cwd(),out=resolve(root,'artifacts/gitlab-mode-retention-20261117/rollback');
const path=resolve(root,'artifacts/gitlab-native-browser-install/install.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const before=JSON.parse(await readFile(path));
assert.equal(execFileSync('docker',['inspect','--format','{{.State.Running}}','fountain-gitlab-integration-baseline-1'],{encoding:'utf8'}).trim(),'false');
assert.equal(before.restored,undefined);assert.equal(before.formatVersion,16);assert.equal(Object.keys(before.files).length,32);
for(const [name,hash]of Object.entries(before.files))assert.equal(sha(await readFile(resolve(before.source,name))),hash,name);
await mkdir(out,{recursive:false});await writeFile(resolve(out,'before.json'),JSON.stringify(before,null,2)+'\n');
const install=restore=>execFileSync(process.execPath,[resolve(root,'scripts/install-gitlab-native-browser.mjs'),before.source,...(restore?['--restore']:[])],{stdio:'inherit'});
let restored=false;
try{
 install(true);restored=true;assert.equal(JSON.parse(await readFile(path)).restored,true);
 const boundaries=[['app/assets/javascripts/work_items/components/work_item_detail.vue','integrations/gitlab/fixtures/work-item-detail-upstream.vue'],['app/assets/javascripts/work_items/components/work_item_description.vue','integrations/gitlab/fixtures/work-item-description-prepared.vue']];
 for(const [name,fixture]of boundaries)assert.equal(sha(await readFile(resolve(before.source,name))),sha(await readFile(resolve(root,fixture))),name);
 await writeFile(resolve(out,'restored.json'),await readFile(path));
}finally{if(restored)install(false);}
const after=JSON.parse(await readFile(path));assert.deepEqual(after.files,before.files);assert.deepEqual(after.nativeRuntime,before.nativeRuntime);
for(const [name,hash]of Object.entries(after.files))assert.equal(sha(await readFile(resolve(after.source,name))),hash,name);
await writeFile(resolve(out,'checks.json'),JSON.stringify({passed:true,installedFiles:32,hostParentRestoredByteExact:true,preparedDescriptionRestoredByteExact:true,allReinstalledFileDigestsExact:true,compiledAssetsChanged:false,scope:'Source rollback/reinstall with task deployment stopped. Compiled deployment rollback is not claimed.'},null,2)+'\n');
console.log('Verified exact parent/description rollback and all 32 reinstalled source digests.');
