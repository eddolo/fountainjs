import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const source = fileURLToPath(new URL('./interface.js', import.meta.url));
const out = new URL('../../artifacts/directus-extension/', import.meta.url);
const marker = 'FOUNTAIN_DIRECTUS_UNSTAMPED_EXTENSION';
const hash = input => createHash('sha256').update(input).digest('hex');
const result = await build({
  configFile: false,
  define: { __FOUNTAIN_DIRECTUS_BUILD__: JSON.stringify(marker) },
  build: { write: false, lib: { entry: source, formats: ['es'] }, rollupOptions: { external: ['vue'], output: { codeSplitting: false } } },
});
const output = Array.isArray(result) ? result.flatMap(r=>r.output) : result.output;
if (output.length !== 1 || output[0].type !== 'chunk') throw new Error('Expected one self-contained extension module.');
const code = output[0].code;
if (code.split(marker).length !== 2) throw new Error('Missing unique adapter identity marker.');
const buildId = hash(code);
const installed = code.replace(marker, buildId);
await mkdir(out,{recursive:true});
await writeFile(new URL('index.js',out),installed);
await writeFile(new URL('package.json',out),JSON.stringify({
  name:'directus-extension-fountain-html',version:'0.0.1',type:'module',
  'directus:extension':{type:'interface',path:'index.js',source:'interface.js',host:'12.7.0'},
},null,2)+'\n');
await writeFile(new URL('identity.json',out),JSON.stringify({
  buildId, bundleSHA256:hash(installed), repositoryHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
},null,2)+'\n');
