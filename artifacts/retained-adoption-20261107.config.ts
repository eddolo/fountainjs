import {defineConfig} from 'vitest/config';

export default defineConfig({test:{
  environment:'node',
  include:['tests/yjs-document-range.test.ts','tests/yjs-collaboration.test.ts','tests/yjs-structured-attributes.test.ts','tests/node-ids-yjs.test.ts','tests/widgets-yjs.test.ts'],
  setupFiles:['artifacts/retained-adoption-20261107.setup.ts'],
}});
