import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { babelParse } from 'vue/compiler-sfc';

const root = new URL('../', import.meta.url);
const pin = JSON.parse(await readFile(new URL('integrations/gitlab/upstream.json', root), 'utf8'));
if (pin.repository !== 'https://github.com/gitlabhq/gitlabhq' || !/^[a-f0-9]{40}$/u.test(pin.commit)) throw new Error('Inspect the upstream pin.');
const files = [
  'spec/frontend/content_editor/services/gl_api_markdown_deserializer_spec.js',
  'spec/frontend/content_editor/extensions/math_inline_spec.js',
  'app/assets/javascripts/content_editor/extensions/math_inline.js',
  'app/assets/javascripts/content_editor/services/serializer/math_inline.js',
  'app/assets/javascripts/behaviors/markdown/render_math.js',
];
const sources = await Promise.all(files.map(async path => {
  const url = `https://raw.githubusercontent.com/gitlabhq/gitlabhq/${pin.commit}/${path}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 1_048_576) throw new Error('Inspect unexpectedly large upstream source.');
  return { path, url, sha256: createHash('sha256').update(bytes).digest('hex'),
    text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
}));
function visit(value, inspect) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { for (const child of value) visit(child, inspect); return; }
  inspect(value);
  for (const [key, child] of Object.entries(value)) if (!['loc', 'start', 'end', 'extra'].includes(key)) visit(child, inspect);
}
const ast = sources.slice(0, 2).map(source => babelParse(source.text, { sourceType: 'module' }));
const rows = [];
visit(ast[0], node => {
  if (node.type !== 'TaggedTemplateExpression' || node.tag.type !== 'MemberExpression'
    || node.tag.object.name !== 'it' || node.tag.property.name !== 'each'
    || node.quasi.quasis[0].value.raw.replace(/\s+/gu, ' ').trim() !== 'description | markdown | html') return;
  const values = node.quasi.expressions;
  if (values.length !== 30 || values.some(value => value.type !== 'StringLiteral')) throw new Error('Inspect changed math fixtures.');
  for (let index = 0; index < values.length; index += 3) rows.push({
    description: values[index].value, markdown: values[index + 1].value, html: values[index + 2].value,
  });
});
let katexHTML;
visit(ast[1], node => {
  if (node.type === 'VariableDeclarator' && node.id.name === 'katexHTML' && node.init.type === 'StringLiteral') {
    if (katexHTML) throw new Error('Inspect ambiguous KaTeX fixture.');
    katexHTML = node.init.value;
  }
});
if (rows.length !== 10 || typeof katexHTML !== 'string') throw new Error('Required math fixtures missing.');
await writeFile(new URL('integrations/gitlab/fixtures/math-html.json', root), JSON.stringify({
  provenance: { commit: pin.commit, files: sources.map(({ text, ...source }) => source),
    license: 'GITLAB-LICENSE.txt', method: 'Only whitelisted expression-free AST literals extracted; no upstream code executed.' },
  rows, katexHTML,
}, null, 2) + '\n');
console.log(JSON.stringify({ commit: pin.commit, rows: rows.length, renderedKaTeXFixtures: 1, sources: sources.map(({ text, ...source }) => source) }, null, 2));
