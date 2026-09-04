import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function assertExports(module, names, surface) {
  const missing = names.filter((name) => typeof module[name] === 'undefined');
  if (missing.length) throw new Error(`${surface} is missing: ${missing.join(', ')}`);
}

const coreNames = ['MediaExtension', 'startAssetUpload', 'registerFountainElement'];
const reactNames = ['FountainComposer', 'FountainEditor', 'FountainToolbar'];

assertExports(await import('fountainjs-editor'), coreNames, 'ESM package root');
assertExports(await import('fountainjs-editor/react'), reactNames, 'ESM React entry');
assertExports(require('fountainjs-editor'), coreNames, 'CommonJS package root');
assertExports(require('fountainjs-editor/react'), reactNames, 'CommonJS React entry');

console.log('ESM, CommonJS, React, and Web Component package exports loaded successfully.');
