import {createHash} from 'node:crypto';
import {readFile,writeFile,realpath,lstat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
if(process.platform!=='linux'||!isAbsolute(process.argv[2]??''))throw new Error('Pass the pinned Linux GitLab checkout.');
const root=fileURLToPath(new URL('../',import.meta.url)),source=await realpath(process.argv[2]);
const pin=JSON.parse(await readFile(resolve(root,'integrations/gitlab/runtime/upstream.json')));
if(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==pin.commit)throw new Error('Unexpected GitLab revision.');
const target=resolve(source,'spec/frontend/vue_shared/components/markdown/fountain_mode_retention_spec.js');
const fixture=await readFile(resolve(root,'integrations/gitlab/fixtures/mode-retention-spec.js'),'utf8');
const require=createRequire(resolve(source,'package.json')),prettier=require('prettier'),options=await prettier.resolveConfig(target);
const value=await prettier.format(fixture,{...options,filepath:target,plugins:(options.plugins??[]).map(name=>require.resolve(name)),tailwindConfig:resolve(source,options.tailwindConfig)});
const priorGenerations=new Set(["89006ead345bd66763812ebc257f9b75e4965f91938fefe4ebdf8a29e6f36d8e", "773e0cbe8573063c6846f9c4fa356414ae9796cfa53f107fd2035655c40fabd2", "134f5b0bf8e726838d1eb4e8f3ecddcdc69a186fa7a35d21dfe5497d70d23ed3", "2b19522a623f75ba5beeebc1e36222afa234931c4392e543e03d859c049e409b", "461e14673950a0e39b0537a61663d0b12bb92ef6ad7a20e90c2cd11415179fcc", "5e148a4169db9050929c15069d698a05d83d8e75c9fab1c3f6ac80e0ed77d1de", "67c11a841809629f765623c089504e8247f9a53c911adcbf171f5d0e829d5529", "cec2f46d2097223acf2b62de988c0694f363dbfe686325c52dc5456e4922881f"]);
try{
 if((await lstat(target)).isSymbolicLink())throw new Error('Refusing a symlinked mode retention test.');
 const current=await readFile(target);
 if(current.toString('utf8')!==value&&!priorGenerations.has(createHash('sha256').update(current).digest('hex')))throw new Error('Refusing unrecognized mode retention test edits.');
}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile(target,value);
console.log('Prepared actual native MarkdownEditor lifecycle regressions.');
