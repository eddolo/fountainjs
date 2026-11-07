import {build} from 'vite';
import {resolve} from 'node:path';
import {copyFile} from 'node:fs/promises';
await build({configFile:false,build:{lib:{entry:{engine:resolve('src/index.ts'),adapter:resolve('src/yjs/retained-adapter.ts'),admission:resolve('src/yjs/retained-admission.ts'),checkpoint:resolve('src/yjs/retained-checkpoint.ts'),authority:resolve('src/yjs/document-room.ts'),sqlite:resolve('examples/backends/retained-sqlite.ts'),coordinator:resolve('src/yjs/retained-room-coordinator.ts')},formats:['es','cjs'],fileName:(format,name)=>`${name}.${format==='es'?'js':'cjs'}`},rollupOptions:{external:['node:sqlite','react','react-dom','react-dom/client','react/jsx-runtime','vue','svelte','svelte/store','yjs']},outDir:'artifacts/yjs-authority-admission-build-20261107',sourcemap:true,minify:false,emptyOutDir:true}});
await copyFile('src/styles.css','artifacts/yjs-authority-admission-build-20261107/styles.css');
