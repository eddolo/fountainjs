import {build} from 'vite';
import {resolve} from 'node:path';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
const directory='retained-checkpoint-build-20261106';
await build({configFile:false,build:{lib:{entry:{engine:resolve('src/index.ts'),'retained-adapter':resolve('src/yjs/retained-adapter.ts'),checkpoint:resolve('src/yjs/retained-checkpoint.ts')},formats:['es','cjs'],fileName:(format,name)=>`${name}.${format==='es'?'js':'cjs'}`},rollupOptions:{external:['react','react-dom','react-dom/client','react/jsx-runtime','vue','svelte','svelte/store','yjs']},outDir:`artifacts/${directory}`,sourcemap:true,minify:false,emptyOutDir:true}});
await copyFile('src/styles.css',`artifacts/${directory}/styles.css`);
const html=(await readFile('artifacts/retained-checkpoint-fixture-20261106.html','utf8')).replaceAll('/src/index.ts',`/artifacts/${directory}/engine.js`).replaceAll('/src/yjs/retained-adapter.ts',`/artifacts/${directory}/retained-adapter.js`).replaceAll('/src/yjs/retained-checkpoint.ts',`/artifacts/${directory}/checkpoint.js`).replaceAll('/src/styles.css',`/artifacts/${directory}/styles.css`);
if(html.includes('/src/'))throw new Error('Compiled checkpoint fixture still imports project source.');
await writeFile('artifacts/retained-checkpoint-fixture-compiled-20261106.html',html);
