import {build} from 'vite';
import {resolve} from 'node:path';
import {copyFile} from 'node:fs/promises';
await build({configFile:false,build:{lib:{entry:{engine:resolve('src/index.ts'),'retained-adapter':resolve('src/yjs/retained-adapter.ts'),checkpoint:resolve('src/yjs/retained-checkpoint.ts'),'room-store':resolve('src/yjs/retained-room-store.ts'),coordinator:resolve('src/yjs/retained-room-coordinator.ts'),sqlite:resolve('examples/backends/retained-sqlite.ts'),handoff:resolve('src/yjs/retained-handoff.ts'),migration:resolve('src/yjs/retained-migration.ts')},formats:['es','cjs'],fileName:(format,name)=>`${name}.${format==='es'?'js':'cjs'}`},rollupOptions:{external:['node:sqlite','react','react-dom','react-dom/client','react/jsx-runtime','vue','svelte','svelte/store','yjs']},outDir:'artifacts/retained-handoff-build-20261106',sourcemap:true,minify:false,emptyOutDir:true}});
await copyFile('src/styles.css','artifacts/retained-handoff-build-20261106/styles.css');
