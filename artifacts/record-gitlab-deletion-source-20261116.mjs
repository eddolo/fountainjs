import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),pin=JSON.parse(await readFile(new URL('integrations/gitlab/runtime/upstream.json',root))),install=JSON.parse(await readFile(new URL('artifacts/gitlab-native-browser-install/install.json',root)));
const source=install.source,git=(...args)=>execFileSync('git',['-C',source,...args],{encoding:'utf8',maxBuffer:16*1024*1024});
assert.equal(git('rev-parse','HEAD').trim(),pin.commit);
const lock=git('show',pin.commit+':yarn.lock'),packages={};
for(const name of ['core','pm','vue-2']){
 const entry=lock.match(new RegExp('"@tiptap/'+name+'@\\^2\\.27\\.3":\\n  version "([^"]+)"'));
 assert.ok(entry);packages['@tiptap/'+name]={descriptor:'^2.27.3',lockedVersion:entry[1]};
}
const prefix='artifacts/gitlab-compatibility/deletion-keyboard-20261116/';
const original=JSON.parse(await readFile(new URL(prefix+'original-1/report.json',root))),fountain=JSON.parse(await readFile(new URL(prefix+'fountain-1/report.json',root)));
const paths=['yarn.lock','app/assets/javascripts/content_editor/components/wrappers/code_block.vue','app/assets/javascripts/content_editor/extensions/code_suggestion.js',
'app/assets/javascripts/content_editor/components/editor_state_observer.vue','app/assets/javascripts/vue_shared/components/markdown/markdown_editor.vue',
'app/services/notes/update_service.rb','app/services/suggestions/create_service.rb','lib/gitlab/diff/suggestion.rb'];
const hashes={};for(const path of paths)hashes[path]=createHash('sha256').update(git('show',pin.commit+':'+path)).digest('hex');
const packaged={};for(const line of original.backend.serverSources){const [sha,path]=line.split(/\s+/u);packaged[path.replace('/opt/gitlab/embedded/service/gitlab-rails/','')]=sha;}
for(const [path,sha]of Object.entries(packaged))assert.equal(sha,hashes[path]);
assert.deepEqual(original.backend.serverSources,fountain.backend.serverSources);
const receipt={scope:'Pinned upstream source and actual shared packaged server provenance. Package versions are upstream lock entries; active editor identity is separately observed in UI.',
 sourceRevision:pin.commit,image:pin.image,packagedRevision:pin.packagedRevision,packages,hashes,packagedServerSourcesMatch:true,
 nativeRuntimeSha256:JSON.parse(await readFile(new URL('artifacts/gitlab-native-runtime/build.json',root))).sha256,
 candidateParent:execFileSync('git',['rev-parse','HEAD'],{cwd:new URL('../',import.meta.url),encoding:'utf8'}).trim()};
await writeFile(new URL(prefix+'source-provenance.json',root),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({sourceRevision:pin.commit,packages,packagedServerSourcesMatch:true}));
