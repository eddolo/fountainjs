import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { babelParse } from 'vue/compiler-sfc';

const root = new URL('../', import.meta.url);
const pin = JSON.parse(await readFile(new URL('integrations/gitlab/upstream.json', root), 'utf8'));
if (pin.repository !== 'https://github.com/gitlabhq/gitlabhq' || !/^[a-f0-9]{40}$/u.test(pin.commit)) throw new Error('Inspect the upstream pin.');
const filename = 'spec/frontend/content_editor/test_constants.js';
const fixturesURL = `https://raw.githubusercontent.com/gitlabhq/gitlabhq/${pin.commit}/${filename}`;
const licenseURL = `https://raw.githubusercontent.com/gitlabhq/gitlabhq/${pin.commit}/LICENSE`;
async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 1_048_576) throw new Error('Inspect an unexpectedly large upstream fixture/license.');
  return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), sha256: createHash('sha256').update(bytes).digest('hex') };
}
const [source, license] = await Promise.all([fetchText(fixturesURL), fetchText(licenseURL)]);
const wanted = ['RESOLVED_ISSUE_HTML', 'RESOLVED_MERGE_REQUEST_HTML', 'RESOLVED_EPIC_HTML', 'RESOLVED_LABEL_HTML',
  'RESOLVED_SNIPPET_HTML', 'RESOLVED_MILESTONE_HTML', 'RESOLVED_USER_HTML', 'RESOLVED_VULNERABILITY_HTML',
  'PROJECT_WIKI_ATTACHMENT_IMAGE_HTML', 'REPOSITORY_RELATIVE_LINK_HTML', 'UPLOAD_IMAGE_HTML', 'ASSET_PROXIED_IMAGE_HTML',
  'REPOSITORY_RELATIVE_IMAGE_HTML', 'REPOSITORY_RELATIVE_IMAGE_WITHOUT_CANONICAL_SRC_HTML',
  'REPOSITORY_RELATIVE_LINK_WITH_TITLE_HTML', 'REPOSITORY_RELATIVE_LINKED_IMAGE_HTML',
  'REPOSITORY_RELATIVE_IMAGE_IN_LIST_HTML', 'REPOSITORY_RELATIVE_IMAGE_IN_TABLE_HTML',
  'REPOSITORY_RELATIVE_IMAGE_WITH_TITLE_HTML', 'REPOSITORY_RELATIVE_MIXED_PARAGRAPH_HTML',
  'RESOLVED_REFERENCES_PARAGRAPH_HTML', 'LINK_REFERENCE_HTML'];
const ast = babelParse(source.text, { sourceType: 'module' });
const literals = new Map();
for (const node of ast.program.body) {
  if (node.type !== 'ExportNamedDeclaration' || node.declaration?.type !== 'VariableDeclaration') continue;
  for (const declaration of node.declaration.declarations) {
    if (declaration.id.type !== 'Identifier' || !wanted.includes(declaration.id.name)) continue;
    const value = declaration.init;
    const literal = value?.type === 'StringLiteral' ? value.value
      : value?.type === 'TemplateLiteral' && value.expressions.length === 0 ? value.quasis[0].value.cooked : null;
    if (typeof literal !== 'string') throw new Error(`Inspect ${declaration.id.name}; executable expressions are not imported.`);
    literals.set(declaration.id.name, literal);
  }
}
if (literals.size !== wanted.length) throw new Error('Required immutable upstream fixtures are missing.');
const directory = new URL('integrations/gitlab/fixtures/', root);
await mkdir(directory, { recursive: true });
await writeFile(new URL('service-html.json', directory), JSON.stringify({ provenance: {
  commit: pin.commit, source: filename, url: fixturesURL, sha256: source.sha256,
  license: { url: licenseURL, sha256: license.sha256, local: 'GITLAB-LICENSE.txt' },
  method: 'Only expression-free AST string literals extracted; upstream code is not executed.',
}, fixtures: Object.fromEntries(wanted.map(name => [name, literals.get(name)])) }, null, 2) + '\n');
await writeFile(new URL('GITLAB-LICENSE.txt', directory), license.text);
console.log(JSON.stringify({ commit: pin.commit, fixtures: literals.size, sourceSHA256: source.sha256 }, null, 2));
