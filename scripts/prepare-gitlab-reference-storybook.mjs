import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, isAbsolute } from 'node:path';
const source = process.argv[2];
if (process.platform !== 'linux' || !source || !isAbsolute(source)) throw new Error('Pass the absolute pinned Linux source checkout.');
const pin = JSON.parse(await readFile(new URL('../integrations/gitlab/runtime/upstream.json', import.meta.url)));
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== pin.commit) throw new Error('Wrong GitLab revision');
const directory = resolve(source, 'storybook/.fountain-reference-audit');
const files = {
  'main.js': "// Owned by Fountain's pinned reference-component audit.\nconst upstream = require('../config/main');\nmodule.exports = { ...upstream, stories: ['../../app/assets/javascripts/content_editor/components/fountain_reference_menu.stories.js'] };\n",
  'preview.js': "// Owned by Fountain's pinned reference-component audit.\nexport * from '../config/preview';\n",
  'webpack.config.js': "// Owned by Fountain's pinned reference-component audit.\nmodule.exports = require('../config/webpack.config');\n",
  'test-runner.js': "// Owned by Fountain's pinned reference-component audit.\nmodule.exports = require('../config/test-runner');\n",
};
for (const [name, content] of Object.entries(files)) {
  try { if (await readFile(resolve(directory, name), 'utf8') !== content) throw new Error('Unrecognized Storybook audit configuration.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await mkdir(directory, { recursive: true });
for (const [name, content] of Object.entries(files)) await writeFile(resolve(directory, name), content);
console.log('Prepared a filtered reference-component Storybook configuration.');
