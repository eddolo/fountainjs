import {defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
export default defineConfig({resolve:{alias:[{find:/^\.\.\/src(?=\/|$)/,replacement:resolve('artifacts/yjs-authority-admission-history-control-20261107/src')}]},test:{environment:'node',include:['tests/yjs-retained-authority-admission.test.ts'],testNamePattern:'keeps a refreshed remote checkpoint'}});
