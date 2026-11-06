import {execFileSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'vite';
const base='artifacts/retained-projection-baseline-source-20261106';
await mkdir(base,{recursive:true});
execFileSync('git',['-c','core.longpaths=true','archive','--format=tar','--output=artifacts/retained-projection-baseline-source-20261106.tar','168707c6','src']);
execFileSync('tar',['-xf','artifacts/retained-projection-baseline-source-20261106.tar','-C',base]);
await build({configFile:false,build:{lib:{entry:{engine:resolve(base,'src/index.ts'),'retained-adapter':resolve(base,'src/yjs/retained-adapter.ts')},formats:['es','cjs'],fileName:(format,name)=>`${name}.${format==='es'?'js':'cjs'}`},rollupOptions:{external:['react','react-dom','react-dom/client','react/jsx-runtime','vue','svelte','svelte/store','yjs']},outDir:'artifacts/retained-projection-baseline-build-20261106',sourcemap:true,minify:false,emptyOutDir:true}});
