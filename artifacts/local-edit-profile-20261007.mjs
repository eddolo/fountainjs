import { performance } from 'node:perf_hooks';
import { CoreExtension, composeExtensions, createEditor } from '../dist/index.js';
for (const size of [1000, 10000]) {
  const kit = composeExtensions([CoreExtension]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: {
    type: 'doc', content: Array.from({length: size}, (_, i) => ({type: 'paragraph', content: [{type:'text',text:`Paragraph ${i}`}]})),
  } });
  let offset = `Paragraph ${size-1}`.length;
  const samples = [];
  for (let i=0;i<330;i++) {
    const start = performance.now();
    if (!editor.dispatch(editor.state.createTransaction().insertText([size-1,0],offset++,'!'))) throw new Error('Rejected');
    if (i>=30) samples.push(performance.now()-start);
  }
  samples.sort((a,b)=>a-b);
  console.log(JSON.stringify({size,iterations:samples.length,p50:samples[149],p95:samples[284],text:editor.state.doc.child(size-1).child(0).text?.length}));
  editor.destroy();
}
