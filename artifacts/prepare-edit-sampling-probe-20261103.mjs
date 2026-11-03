import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
let source = execFileSync('git', ['show', 'df093be:scripts/check-performance-budgets.mjs'], { encoding: 'utf8' });
const sampleStart = 'function sample(run, count = iterations) {\n  run();';
if (!source.includes(sampleStart)) throw new Error('Sampling anchor changed');
source = source.replace(sampleStart, `function sample(run, count = iterations, settle = 1) {
  const initial = [];
  for (let i = 0; i < settle; i++) { const start = performance.now(); run(); initial.push(performance.now() - start); }
  if (settle > 1) console.log(JSON.stringify({ phase: 'initial-edit-window', samples: initial }));`);
const boundary = '  });\n  editor.destroy();\n  return result;';
if (source.split(boundary).length !== 3) throw new Error('Expected local/remote sampling boundaries');
source = source.split(boundary).join('  }, 100, 100);\n  editor.destroy();\n  return result;');
writeFileSync('artifacts/edit-sampling-probe-20261103.mjs', source);
