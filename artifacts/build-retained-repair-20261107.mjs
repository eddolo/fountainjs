import {build} from 'vite';
import {resolve} from 'node:path';
import {copyFile} from 'node:fs/promises';
await build({configFile:false,build:{lib:{entry:{engine:resolve('src/index.ts'),'node-ids':resolve('src/node-ids/index.ts'),'retained-adapter':resolve('src/yjs/retained-adapter.ts')},formats:['es','cjs'],fileName:(format,name)=>`${name}.${format==='es'?'js':'cjs'}`},rollupOptions:{external:['react','react-dom','react-dom/client','react/jsx-runtime','vue','svelte','svelte/store','yjs']},outDir:'artifacts/retained-repair-build-20261107',sourcemap:true,minify:false,emptyOutDir:true}});
await copyFile('src/styles.css','artifacts/retained-repair-build-20261107/styles.css');
