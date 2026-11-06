import {build} from 'vite';
import {resolve} from 'node:path';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
const directory='cursor-overlay-build-20261106';
await build({configFile:false,build:{lib:{entry:{engine:resolve('src/index.ts'),'retained-adapter':resolve('src/yjs/retained-adapter.ts')},formats:['es','cjs'],fileName:(format,name)=>`${name}.${format==='es'?'js':'cjs'}`},rollupOptions:{external:['react','react-dom','react-dom/client','react/jsx-runtime','vue','svelte','svelte/store','yjs']},outDir:`artifacts/${directory}`,sourcemap:true,minify:false,emptyOutDir:true}});
await copyFile('src/styles.css',`artifacts/${directory}/styles.css`);
for(const [source,target] of [['retained-adapter-fixture-20261106.html','retained-adapter-fixture-compiled-20261106.html'],['cursor-native-reference-20261106.html','cursor-native-reference-compiled-20261106.html']]){
 const html=(await readFile(`artifacts/${source}`,'utf8')).replaceAll('/src/index.ts',`/artifacts/${directory}/engine.js`).replaceAll('/src/yjs/retained-adapter.ts',`/artifacts/${directory}/retained-adapter.js`).replaceAll('/src/styles.css',`/artifacts/${directory}/styles.css`);
 if(html.includes('/src/'))throw new Error('Compiled fixture still imports project source.');
 await writeFile(`artifacts/${target}`,html);
}
