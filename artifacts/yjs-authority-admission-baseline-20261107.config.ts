import {defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
export default defineConfig({resolve:{alias:[{find:/^\.\.\/src(?=\/|$)/,replacement:resolve('artifacts/yjs-authority-admission-baseline-20261107/src')}]},test:{environment:'node',include:['artifacts/yjs-authority-admission-baseline-20261107.test.ts']}});
