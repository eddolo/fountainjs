import {vi} from 'vitest';

// Run the unchanged public behavioral suites against the private replacement.
// XML-wire assertions remain visible failures; this is an adoption diagnostic,
// not a modification of the production export or ordinary source-test results.
vi.mock('../src/yjs',async()=>{
  const old=await vi.importActual<typeof import('../src/yjs')>('../src/yjs');
  const replacement=await import('../src/yjs/retained-adapter');
  return {...old,YjsCollaborationAdapter:replacement.RetainedYjsCollaborationAdapter,
    createYjsCollaborationExtension:replacement.createRetainedYjsCollaborationExtension};
});
