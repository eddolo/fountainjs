import {build} from 'vite';
import {resolve} from 'node:path';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
const directory='retained-migration-build-20261106';
await build({configFile:false,build:{lib:{entry:{engine:resolve('src/index.ts'),'retained-adapter':resolve('src/yjs/retained-adapter.ts'),checkpoint:resolve('src/yjs/retained-checkpoint.ts'),'room-store':resolve('src/yjs/retained-room-store.ts'),migration:resolve('src/yjs/retained-migration.ts'),selection:resolve('src/yjs/retained-selection.ts'),'document-store':resolve('src/yjs/retained-document.ts')},formats:['es','cjs'],fileName:(format,name)=>`${name}.${format==='es'?'js':'cjs'}`},rollupOptions:{external:['react','react-dom','react-dom/client','react/jsx-runtime','vue','svelte','svelte/store','yjs']},outDir:`artifacts/${directory}`,sourcemap:true,minify:false,emptyOutDir:true}});
await copyFile('src/styles.css',`artifacts/${directory}/styles.css`);
let html=await readFile('artifacts/retained-migration-fixture-20261106.html','utf8');
for(const [source,target]of [['/src/index.ts','engine.js'],['/src/yjs/retained-adapter.ts','retained-adapter.js'],['/src/yjs/retained-checkpoint.ts','checkpoint.js'],['/src/yjs/retained-room-store.ts','room-store.js'],['/src/yjs/retained-migration.ts','migration.js'],['/src/yjs/retained-selection.ts','selection.js'],['/src/yjs/retained-document.ts','document-store.js'],['/src/styles.css','styles.css']])html=html.replaceAll(source,`/artifacts/${directory}/${target}`);
if(html.includes('/src/'))throw new Error('Compiled migration fixture imports project source.');await writeFile('artifacts/retained-migration-fixture-compiled-20261106.html',html);
