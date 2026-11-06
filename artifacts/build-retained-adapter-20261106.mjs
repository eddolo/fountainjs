import { build } from 'vite';
import { resolve } from 'node:path';
await build({configFile:false,build:{lib:{entry:{engine:resolve('src/index.ts'),'retained-adapter':resolve('src/yjs/retained-adapter.ts')},formats:['es','cjs'],fileName:(format,name)=>`${name}.${format==='es'?'js':'cjs'}`},rollupOptions:{external:['react','react-dom','react-dom/client','react/jsx-runtime','vue','svelte','svelte/store','yjs']},outDir:'artifacts/retained-adapter-build-20261106',sourcemap:true,minify:false,emptyOutDir:true}});
