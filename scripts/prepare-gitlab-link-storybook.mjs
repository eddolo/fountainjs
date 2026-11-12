import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';

const source = process.argv[2];
if (!source || !isAbsolute(source)) throw new Error('Pass the absolute pinned GitLab checkout.');
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  !== '0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf') throw new Error('Unexpected source pin.');
const kind = process.argv.includes('--alert') ? 'alert' : process.argv.includes('--code') ? 'code' : 'link';
const directory = resolve(source, `storybook/.fountain-${kind}-audit`);
await mkdir(directory, { recursive: true });
const files = {
  'main.js': `const upstream = require('../config/main');
module.exports = { ...upstream, stories: ['../../app/assets/javascripts/content_editor/components/fountain_${kind}_menu.stories.js'] };
`,
  'webpack.config.js': `module.exports = require('../config/webpack.config');\n`,
  'preview.js': `export * from '../config/preview';\n`,
  'test-runner.js': `const upstream = require('../config/test-runner');
const { checkA11y } = require('axe-playwright');
module.exports = { async postVisit(page, context) {
  await upstream.postVisit(page, context);
  // Modal portals live outside storybook-root and need the same accessibility gate.
  await checkA11y(page, 'body', { detailedReport: true, detailedReportOptions: { html: true } }, false, 'v2');
} };
`,
};
for (const [name, content] of Object.entries(files)) {
  const path = resolve(directory, name), bytes = `// Owned by Fountain's pinned ${kind}-component audit.\n${content}`;
  try {
    const current = await readFile(path, 'utf8');
    if (current !== bytes) throw new Error(`Refusing unknown existing audit configuration: ${name}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(path, bytes);
}
console.log(`Prepared a filtered ${kind} Storybook configuration; upstream configuration is unchanged.`);
