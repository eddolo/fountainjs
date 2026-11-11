import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { babelParse, parse as parseSFC } from 'vue/compiler-sfc';

const root = fileURLToPath(new URL('../', import.meta.url));
const pin = JSON.parse(await readFile(new URL('../integrations/gitlab/upstream.json', import.meta.url), 'utf8'));

function nameOf(node) {
  return node.key?.type === 'Identifier' ? node.key.name : node.key?.type === 'StringLiteral' ? node.key.value : null;
}
function property(object, name) {
  return object.properties.find(node => nameOf(node) === name);
}
function vueContract(source, filename) {
  const parsed = parseSFC(source, { filename });
  const script = parsed.descriptor.script?.content;
  if (parsed.errors.length || !script) throw new Error(`${filename}: inspect the changed Vue component.`);
  const ast = babelParse(script, { sourceType: 'module' });
  const definition = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration')?.declaration;
  if (definition?.type !== 'ObjectExpression') throw new Error(`${filename}: editor definition changed; inspect it before adapting.`);
  const text = node => node ? script.slice(node.start, node.end) : null;
  const object = name => {
    const value = property(definition, name)?.value;
    return value?.type === 'ObjectExpression' ? value : null;
  };
  const props = object('props');
  const emits = property(definition, 'emits')?.value;
  if (!props || emits?.type !== 'ArrayExpression') throw new Error(`${filename}: props/events shape changed; inspect upstream.`);
  return {
    props: props.properties.map(node => {
      const options = node.value;
      if (options?.type !== 'ObjectExpression') throw new Error(`${filename}: inspect prop ${nameOf(node)}.`);
      return { name: nameOf(node), type: text(property(options, 'type')?.value),
        required: property(options, 'required')?.value?.value === true,
        default: text(property(options, 'default')?.value) };
    }),
    events: emits.elements.map(node => {
      return node?.type === 'StringLiteral' ? node.value : { expression: text(node), resolved: false };
    }),
    methods: object('methods')?.properties.map(nameOf).filter(Boolean) ?? [],
    watched: object('watch')?.properties.map(nameOf).filter(Boolean) ?? [],
    slots: [...new Set([...source.matchAll(/<slot\b([^>]*)>/g)].map(match => match[1].match(/\bname="([^"]+)"/)?.[1] ?? 'default'))],
  };
}

if (process.argv.length > 3 || !/^[a-f0-9]{40}$/.test(pin.commit) || pin.repository !== 'https://github.com/gitlabhq/gitlabhq') {
  throw new Error('Usage: node scripts/audit-gitlab-editor-contract.mjs [report.json]. Inspect the pinned upstream manifest.');
}
const sources = Object.fromEntries(await Promise.all(Object.entries(pin.files).map(async ([name, path]) => {
  if (!/^[\w/.-]+$/.test(path) || path.includes('..')) throw new Error('Unexpected upstream path.');
  const url = `https://raw.githubusercontent.com/gitlabhq/gitlabhq/${pin.commit}/${path}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Upstream fetch failed (${response.status}): ${path}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 2 * 1024 * 1024) throw new Error(`Inspect unexpectedly large upstream source: ${path}`);
  return [name, { path, url, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    source: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }];
})));
const extensionAst = babelParse(sources.extensions.source, { sourceType: 'module' });
const extensions = extensionAst.program.body.filter(node => node.type === 'ExportNamedDeclaration')
  .flatMap(node => node.specifiers.map(item => item.exported?.name ?? item.exported?.value).filter(Boolean));
if (!extensions.length) throw new Error('No upstream extension exports found; inspect the changed module.');
const dependencies = JSON.parse(sources.package.source).dependencies;
const component = vueContract(sources.component.source, pin.files.component);
const host = vueContract(sources.host.source, pin.files.host);
const report = {
  measuredAt: new Date().toISOString(), upstream: pin,
  provenance: Object.fromEntries(Object.entries(sources).map(([name, { source, ...metadata }]) => [name, metadata])),
  runtimeDependencies: Object.fromEntries(['vue', '@gitlab/ui', '@tiptap/core', '@tiptap/vue-2'].map(name => [name, dependencies[name] ?? null])),
  component, host, extensions,
  status: 'Upstream contracts inventoried. Fountain replacement is not implemented or production-verified.',
  requiredEvidence: ['Real GitLab application with the Fountain replacement enabled',
    'Upstream editor tests and system workflows on original and replacement',
    'GitLab Flavored Markdown rendering, source retention and editing semantics',
    'Real authenticated persistence, uploads, references, permissions and collaboration',
    'Native recorded browser use, accessibility, lifecycle and failure recovery',
    'Repeatable side-by-side measurements before any superiority claim'],
};
const output = resolve(root, process.argv[2] ?? 'artifacts/gitlab-editor-contract-20261111.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, commit: pin.commit, props: component.props.length,
  events: component.events.length, exportedExtensions: extensions.length, status: report.status }, null, 2));
